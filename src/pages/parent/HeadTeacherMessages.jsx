import React, { useState, useEffect, useRef, useMemo } from 'react';
import Layout from '../../components/layout/Layout';
import { useAuth } from '../../store/AuthContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { supabase } from '../../lib/supabase';

const HeadTeacherMessages = () => {
  const { user } = useAuth();
  const schoolId = user?.schoolId;

  // Active stage states
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'broadcast' | 'logs'
  const [selectedParentPhone, setSelectedParentPhone] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Message composition states
  const [chatInput, setChatInput] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const chatBottomRef = useRef(null);
  const prevMsgCountRef = useRef(0);
  const [newReplyNotif, setNewReplyNotif] = useState(null);
  // Guard Set to prevent race conditions between syncDatabaseData and real-time listener
  const processingMsgIds = useRef(new Set());

  // Broadcast Alert composition states
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastContent, setBroadcastContent] = useState('');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [broadcastSuccess, setBroadcastSuccess] = useState(false);

  // Direct Notification composition states (inside chat modal/trigger)
  const [directNotifOpen, setDirectNotifOpen] = useState(false);
  const [directTitle, setDirectTitle] = useState('');
  const [directContent, setDirectContent] = useState('');
  const [sendingDirect, setSendingDirect] = useState(false);
  const [directSuccess, setDirectSuccess] = useState(false);

  // Live Dexie queries
  const learners = useLiveQuery(() => schoolId ? db.learners.where('schoolId').equals(schoolId).toArray() : [], [schoolId]) || [];
  const classes = useLiveQuery(() => schoolId ? db.classes.where('schoolId').equals(schoolId).toArray() : [], [schoolId]) || [];
  
  const localMessages = useLiveQuery(
    () => schoolId ? db.messages.where('schoolId').equals(schoolId).sortBy('created_at') : [],
    [schoolId]
  ) || [];

  const localNotifications = useLiveQuery(
    () => schoolId ? db.notifications.where('schoolId').equals(schoolId).reverse().sortBy('created_at') : [],
    [schoolId]
  ) || [];

  // Helper function to get clean 9-digit suffix of phone numbers for robust matching
  const cleanPhone = (p) => {
    if (!p) return '';
    return String(p).replace(/[^0-9]/g, '').slice(-9);
  };

  const getClassName = (classId) => {
    return classes.find(c => String(c.id) === String(classId))?.name || 'Class';
  };

  // Sync with Supabase on mount and during subscriptions
  useEffect(() => {
    if (!navigator.onLine || !schoolId) return;

    const syncDatabaseData = async () => {
      try {
        console.log('[HeadTeacherMessages] Synchronizing messages & notifications for school:', schoolId);

        // 1. Fetch remote messages
        const { data: remoteMsgs, error: msgErr } = await supabase
          .from('report_messages')
          .select('*')
          .eq('school_id', schoolId);

        if (!msgErr && remoteMsgs) {
          for (const m of remoteMsgs) {
            // Skip if real-time listener is already writing this record
            if (processingMsgIds.current.has(m.id)) continue;
            const existing = await db.messages.filter(x => x.supabaseId === m.id).first();
            if (!existing) {
              await db.messages.add({
                schoolId: m.school_id,
                parentPhone: m.parent_phone,
                senderRole: m.sender_role,
                content: m.content,
                created_at: m.created_at,
                isRead: m.is_read,
                supabaseId: m.id,
                synced: true
              });
            } else if (existing.isRead !== m.is_read) {
              await db.messages.update(existing.id, { isRead: m.is_read });
            }
          }
        }

        // 2. Fetch remote notifications
        const { data: remoteNotifs, error: notifErr } = await supabase
          .from('report_notifications')
          .select('*')
          .eq('school_id', schoolId);

        if (!notifErr && remoteNotifs) {
          for (const n of remoteNotifs) {
            const existing = await db.notifications.filter(x => x.supabaseId === n.id).first();
            if (!existing) {
              await db.notifications.add({
                schoolId: n.school_id,
                parentPhone: n.parent_phone || null,
                title: n.title,
                content: n.content,
                created_at: n.created_at,
                isRead: true, // Admin sent this, so they already read it
                supabaseId: n.id
              });
            }
          }
        }

        // 3. Dispatch any locally queued messages
        const unsyncedMsgs = await db.messages
          .filter(m => !m.synced && m.senderRole === 'head_teacher' && m.schoolId === schoolId)
          .toArray();

        for (const m of unsyncedMsgs) {
          const { data, error } = await supabase
            .from('report_messages')
            .insert({
              school_id: m.schoolId,
              parent_phone: m.parentPhone,
              sender_role: 'head_teacher',
              content: m.content,
              is_read: m.isRead,
              created_at: m.created_at
            })
            .select()
            .single();

          if (!error && data) {
            await db.messages.update(m.id, { synced: true, supabaseId: data.id });
          }
        }
      } catch (err) {
        console.warn('Sync failed:', err);
      }
    };

    syncDatabaseData();

    // 4. Set up real-time channels
    const messagesChannel = supabase
      .channel('admin-messages-sync')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'report_messages', filter: `school_id=eq.${schoolId}` },
        async (payload) => {
          const record = payload.new;
          // Mark in-flight so syncDatabaseData skips this record if it runs concurrently
          processingMsgIds.current.add(record.id);
          const existing = await db.messages.filter(x => x.supabaseId === record.id).first();
          if (!existing) {
            await db.messages.add({
              schoolId: record.school_id,
              parentPhone: record.parent_phone,
              senderRole: record.sender_role,
              content: record.content,
              created_at: record.created_at,
              isRead: record.is_read,
              supabaseId: record.id,
              synced: true
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'report_messages', filter: `school_id=eq.${schoolId}` },
        async (payload) => {
          const record = payload.new;
          const existing = await db.messages.filter(x => x.supabaseId === record.id).first();
          if (existing) {
            await db.messages.update(existing.id, { isRead: record.is_read });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
    };
  }, [schoolId]);

  // Aggregate all unique parent profiles dynamically by blending learners' guardian records and messaging threads
  const parentThreads = useMemo(() => {
    const registry = new Map();

    // A. Parse registered learners to map parents
    learners.forEach(learner => {
      if (learner.guardianContact1) {
        const key = cleanPhone(learner.guardianContact1);
        if (key && key.length >= 9) {
          if (!registry.has(key)) {
            registry.set(key, {
              phone: learner.guardianContact1,
              cleanKey: key,
              name: learner.guardianName || 'Parent',
              children: [],
              messages: [],
              unreadCount: 0
            });
          }
          const profile = registry.get(key);
          if (!profile.children.some(c => c.id === learner.id)) {
            profile.children.push({
              id: learner.id,
              fullName: learner.fullName,
              classId: learner.currentClassId,
              regNumber: learner.regNumber,
              photo: learner.photoUrl || learner.photo
            });
          }
          if (learner.guardianName && profile.name === 'Parent') {
            profile.name = learner.guardianName;
          }
        }
      }

      if (learner.guardianContact2) {
        const key = cleanPhone(learner.guardianContact2);
        if (key && key.length >= 9) {
          if (!registry.has(key)) {
            registry.set(key, {
              phone: learner.guardianContact2,
              cleanKey: key,
              name: 'Parent', // Second contact, might not be the primary guardianName
              children: [],
              messages: [],
              unreadCount: 0
            });
          }
          const profile = registry.get(key);
          if (!profile.children.some(c => c.id === learner.id)) {
            profile.children.push({
              id: learner.id,
              fullName: learner.fullName,
              classId: learner.currentClassId,
              regNumber: learner.regNumber,
              photo: learner.photoUrl || learner.photo
            });
          }
        }
      }
    });

    // B. Blend messages log to account for all parents including potential unregistered ones
    localMessages.forEach(msg => {
      const key = cleanPhone(msg.parentPhone);
      if (key && key.length >= 9) {
        if (!registry.has(key)) {
          registry.set(key, {
            phone: msg.parentPhone,
            cleanKey: key,
            name: `Parent (${msg.parentPhone})`,
            children: [],
            messages: [],
            unreadCount: 0
          });
        }
        const profile = registry.get(key);
        profile.messages.push(msg);

        if (msg.senderRole === 'parent' && !msg.isRead) {
          profile.unreadCount += 1;
        }
      }
    });

    // C. Format and sort by latest message time or unread status
    return Array.from(registry.values())
      .map(p => {
        // Find latest message if any
        const sortedMsgs = [...p.messages].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        const lastMsg = sortedMsgs[sortedMsgs.length - 1] || null;
        
        return {
          ...p,
          lastMessage: lastMsg,
          lastMsgTime: lastMsg ? new Date(lastMsg.created_at) : new Date(0)
        };
      })
      .filter(p => {
        // Search filter matching name, phone, or child names
        const query = searchTerm.toLowerCase().trim();
        if (!query) return true;
        
        const nameMatch = p.name.toLowerCase().includes(query);
        const phoneMatch = p.phone.toLowerCase().includes(query);
        const childMatch = p.children.some(c => c.fullName.toLowerCase().includes(query));
        
        return nameMatch || phoneMatch || childMatch;
      })
      .sort((a, b) => {
        // Unread messages bubble to top, then sorted by most recent message timestamp
        if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
        if (b.unreadCount > 0 && a.unreadCount === 0) return 1;
        return b.lastMsgTime - a.lastMsgTime;
      });
  }, [learners, localMessages, searchTerm]);

  // Selected thread data
  const activeThread = useMemo(() => {
    if (!selectedParentPhone) return null;
    const cleanActive = cleanPhone(selectedParentPhone);
    return parentThreads.find(p => p.cleanKey === cleanActive) || {
      phone: selectedParentPhone,
      cleanKey: cleanActive,
      name: `Parent (${selectedParentPhone})`,
      children: [],
      unreadCount: 0,
      lastMessage: null
    };
  }, [selectedParentPhone, parentThreads]);

  // Filter messages for active parent
  const activeMessages = useMemo(() => {
    if (!selectedParentPhone) return [];
    const cleanActive = cleanPhone(selectedParentPhone);
    return localMessages.filter(m => cleanPhone(m.parentPhone) === cleanActive);
  }, [selectedParentPhone, localMessages]);

  // Auto scroll chat to bottom when messages or selected parent changes
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeMessages, selectedParentPhone]);

  // Refs to track length of localMessages
  const allMsgsCountRef = useRef(0);

  // Sync refs on initial load
  useEffect(() => {
    if (localMessages) {
      allMsgsCountRef.current = localMessages.length;
    }
  }, [localMessages]);

  // Reset notifications when switching parents
  useEffect(() => {
    if (selectedParentPhone) {
      setNewReplyNotif(null);
    }
  }, [selectedParentPhone]);

  // Watch all messages to trigger in-chat notifications from ANY parent in real-time
  useEffect(() => {
    if (!localMessages || localMessages.length === 0) return;
    
    // Only trigger if we received a new message
    if (localMessages.length > allMsgsCountRef.current) {
      const lastMsg = localMessages[localMessages.length - 1];
      
      if (lastMsg && lastMsg.senderRole === 'parent') {
        const cleanParent = cleanPhone(lastMsg.parentPhone);
        const cleanActive = cleanPhone(selectedParentPhone);
        
        // Find parent's profile name from parentThreads
        const thread = parentThreads.find(t => t.cleanKey === cleanParent);
        const parentName = thread ? thread.name : `Parent (${lastMsg.parentPhone})`;
        
        if (cleanParent !== cleanActive) {
          // Message is from a different parent
          setNewReplyNotif({
            ...lastMsg,
            customTitle: `New Message from ${parentName}`,
            isOtherParent: true,
            parentName
          });
          const t = setTimeout(() => {
            setNewReplyNotif(null);
          }, 4500);
          allMsgsCountRef.current = localMessages.length;
          return () => clearTimeout(t);
        } else {
          // Message is from the currently active parent thread
          setNewReplyNotif({
            ...lastMsg,
            customTitle: `New Reply from ${parentName}`,
            isOtherParent: false,
            parentName
          });
          const t = setTimeout(() => {
            setNewReplyNotif(null);
          }, 4500);
          allMsgsCountRef.current = localMessages.length;
          return () => clearTimeout(t);
        }
      }
    }
    
    allMsgsCountRef.current = localMessages.length;
  }, [localMessages, selectedParentPhone, parentThreads]);

  // Mark active thread messages as read when opening conversation
  useEffect(() => {
    if (!selectedParentPhone || !schoolId) return;

    const markAsRead = async () => {
      const cleanActive = cleanPhone(selectedParentPhone);
      const unread = activeMessages.filter(m => m.senderRole === 'parent' && !m.isRead);

      if (unread.length === 0) return;

      // Update locally
      for (const m of unread) {
        await db.messages.update(m.id, { isRead: true });
      }

      // Update in Supabase
      if (navigator.onLine) {
        try {
          await supabase
            .from('report_messages')
            .update({ is_read: true })
            .eq('school_id', schoolId)
            .eq('sender_role', 'parent')
            .eq('is_read', false)
            .filter('parent_phone', 'ilike', `%${cleanActive}`);
        } catch (e) {
          console.warn('Failed to mark remote messages as read:', e);
        }
      }
    };

    markAsRead();
  }, [selectedParentPhone, activeMessages, schoolId]);

  // Send parent text message
  const handleSendMessage = async () => {
    const text = chatInput.trim();
    if (!text || !schoolId || !selectedParentPhone) return;

    setSendingMsg(true);
    const now = new Date().toISOString();

    // Save locally first for premium responsive feel
    const localId = await db.messages.add({
      schoolId,
      parentPhone: selectedParentPhone,
      senderRole: 'head_teacher',
      content: text,
      created_at: now,
      isRead: true, // I sent it, I've read it
      synced: false
    });

    setChatInput('');
    setSendingMsg(false);

    if (navigator.onLine) {
      try {
        const { data, error } = await supabase
          .from('report_messages')
          .insert({
            school_id: schoolId,
            parent_phone: selectedParentPhone,
            sender_role: 'head_teacher',
            content: text,
            is_read: false // Unread for parent portal
          })
          .select()
          .single();

        if (!error && data) {
          await db.messages.update(localId, { synced: true, supabaseId: data.id });
        }
      } catch (err) {
        console.warn('Failed to push admin message:', err);
      }
    }
  };

  // Submit broadcast alert (school-wide)
  const handleSendBroadcast = async (e) => {
    e.preventDefault();
    const title = broadcastTitle.trim();
    const content = broadcastContent.trim();
    if (!title || !content || !schoolId) return;

    setSendingBroadcast(true);
    setBroadcastSuccess(false);

    if (navigator.onLine) {
      try {
        const { data, error } = await supabase
          .from('report_notifications')
          .insert({
            school_id: schoolId,
            parent_phone: null, // NULL signals school-wide broadcast
            title,
            content
          })
          .select()
          .single();

        if (!error && data) {
          await db.notifications.add({
            schoolId,
            parentPhone: null,
            title,
            content,
            created_at: data.created_at,
            isRead: true,
            supabaseId: data.id
          });
          setBroadcastTitle('');
          setBroadcastContent('');
          setBroadcastSuccess(true);
        } else {
          throw new Error(error?.message || 'Database error');
        }
      } catch (err) {
        alert('Failed to send broadcast alert: ' + err.message);
      }
    } else {
      alert('You must be online to compose and send broadcast alerts.');
    }
    setSendingBroadcast(false);
  };

  // Submit targeted notification (direct to parent)
  const handleSendDirectNotification = async (e) => {
    e.preventDefault();
    const title = directTitle.trim();
    const content = directContent.trim();
    if (!title || !content || !schoolId || !selectedParentPhone) return;

    setSendingDirect(true);
    setDirectSuccess(false);

    if (navigator.onLine) {
      try {
        const { data, error } = await supabase
          .from('report_notifications')
          .insert({
            school_id: schoolId,
            parent_phone: selectedParentPhone,
            title,
            content
          })
          .select()
          .single();

        if (!error && data) {
          await db.notifications.add({
            schoolId,
            parentPhone: selectedParentPhone,
            title,
            content,
            created_at: data.created_at,
            isRead: true,
            supabaseId: data.id
          });
          setDirectTitle('');
          setDirectContent('');
          setDirectSuccess(true);
          setTimeout(() => {
            setDirectNotifOpen(false);
            setDirectSuccess(false);
          }, 1500);
        } else {
          throw new Error(error?.message || 'Database error');
        }
      } catch (err) {
        alert('Failed to send targeted alert: ' + err.message);
      }
    } else {
      alert('You must be online to send parent targeted notifications.');
    }
    setSendingDirect(false);
  };

  const formatDate = (isoStr) => {
    if (!isoStr) return '';
    const date = new Date(isoStr);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatTime = (isoStr) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Layout title="Communication Center">
      <div className="comms-workspace-container">
        <style>{`
          .comms-workspace-container {
            display: grid;
            grid-template-columns: 360px 1fr;
            background: #fff;
            border-radius: 24px;
            box-shadow: 0 10px 40px rgba(15, 23, 42, 0.04);
            border: 1px solid #e2e8f0;
            overflow: hidden;
            height: calc(100vh - 140px);
            min-height: 580px;
            font-family: 'Outfit', 'Inter', system-ui, sans-serif;
          }

          @media (max-width: 992px) {
            .comms-workspace-container {
              grid-template-columns: 1fr;
              height: auto;
            }
            .stage-column {
              display: ${selectedParentPhone || activeTab !== 'chat' ? 'flex' : 'none'} !important;
            }
            .sidebar-column {
              display: ${selectedParentPhone || activeTab !== 'chat' ? 'none' : 'flex'} !important;
            }
          }

          /* ── Sidebar Column ── */
          .sidebar-column {
            border-right: 1px solid #e2e8f0;
            background: #f8fafc;
            display: flex;
            flex-direction: column;
            overflow: hidden;
          }
          .sidebar-header {
            padding: 1.5rem;
            border-bottom: 1px solid #e2e8f0;
            background: #fff;
          }
          .sidebar-title {
            font-size: 1.15rem;
            font-weight: 800;
            color: #0f172a;
            margin: 0 0 1rem;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .sidebar-title i { color: #8b5cf6; }

          .search-wrapper {
            position: relative;
          }
          .search-wrapper i {
            position: absolute;
            left: 12px;
            top: 50%;
            transform: translateY(-50%);
            color: #94a3b8;
            font-size: 0.85rem;
          }
          .search-input {
            width: 100%;
            padding: 0.65rem 0.75rem 0.65rem 2.2rem;
            border-radius: 12px;
            border: 1px solid #cbd5e1;
            font-family: inherit;
            font-size: 0.85rem;
            outline: none;
            transition: all 0.2s;
            background: #fff;
          }
          .search-input:focus {
            border-color: #8b5cf6;
            box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.12);
          }

          .thread-list {
            flex: 1;
            overflow-y: auto;
            padding: 0.75rem;
            display: flex;
            flex-direction: column;
            gap: 4px;
          }
          .thread-list::-webkit-scrollbar { width: 4px; }
          .thread-list::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }

          .thread-item {
            padding: 0.85rem 1rem;
            border-radius: 16px;
            cursor: pointer;
            transition: all 0.25s ease;
            display: flex;
            gap: 12px;
            align-items: flex-start;
            position: relative;
            background: transparent;
            border: 1px solid transparent;
            text-align: left;
            width: 100%;
          }
          .thread-item:hover {
            background: #fff;
            border-color: #e2e8f0;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.02);
          }
          .thread-item.active {
            background: linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(139,92,246,0.02) 100%);
            border-color: rgba(139, 92, 246, 0.25);
          }
          .thread-avatar {
            width: 42px;
            height: 42px;
            border-radius: 12px;
            background: rgba(139, 92, 246, 0.12);
            color: #8b5cf6;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1rem;
            font-weight: 700;
            flex-shrink: 0;
            text-transform: uppercase;
          }
          .thread-item.active .thread-avatar {
            background: #8b5cf6;
            color: #fff;
            box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
          }
          .thread-details {
            flex: 1;
            min-width: 0;
          }
          .thread-name-row {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 8px;
            margin-bottom: 2px;
          }
          .thread-name {
            font-size: 0.88rem;
            font-weight: 800;
            color: #0f172a;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .thread-time {
            font-size: 0.65rem;
            color: #94a3b8;
            font-weight: 600;
          }
          .thread-snippet {
            font-size: 0.78rem;
            color: #64748b;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            line-height: 1.3;
          }
          .thread-children {
            font-size: 0.68rem;
            color: #8b5cf6;
            font-weight: 700;
            margin-top: 5px;
            display: flex;
            align-items: center;
            gap: 4px;
          }
          .unread-indicator-badge {
            background: #ef4444;
            color: #fff;
            font-size: 0.62rem;
            font-weight: 800;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            align-self: center;
            box-shadow: 0 0 10px rgba(239, 68, 68, 0.4);
            animation: pulse-unread 1.8s infinite;
          }
          @keyframes pulse-unread {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.15); }
          }
          
          .no-threads-state {
            padding: 3rem 1.5rem;
            text-align: center;
            color: #94a3b8;
          }
          .no-threads-state i {
            font-size: 2rem;
            margin-bottom: 0.75rem;
            display: block;
          }

          /* ── Main Stage Column ── */
          .stage-column {
            display: flex;
            flex-direction: column;
            overflow: hidden;
            background: #fff;
          }
          .stage-header-tabs {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 1.5rem;
            border-bottom: 1px solid #e2e8f0;
            background: #f8fafc;
            flex-shrink: 0;
          }
          .stage-tabs {
            display: flex;
            gap: 1.5rem;
          }
          .stage-tab-btn {
            background: none;
            border: none;
            padding: 1.25rem 0.25rem;
            font-family: inherit;
            font-size: 0.85rem;
            font-weight: 700;
            color: #64748b;
            cursor: pointer;
            position: relative;
            transition: color 0.2s;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .stage-tab-btn:hover { color: #0f172a; }
          .stage-tab-btn.active {
            color: #8b5cf6;
          }
          .stage-tab-btn.active::after {
            content: '';
            position: absolute;
            bottom: -1px;
            left: 0; right: 0;
            height: 3px;
            background: #8b5cf6;
            border-radius: 99px;
          }
          
          .back-btn-mobile {
            display: none;
            background: rgba(139,92,246,0.1);
            color: #8b5cf6;
            border: none;
            padding: 0.5rem 0.8rem;
            border-radius: 10px;
            font-family: inherit;
            font-size: 0.75rem;
            font-weight: 700;
            cursor: pointer;
            align-items: center;
            gap: 4px;
          }
          @media (max-width: 992px) {
            .back-btn-mobile { display: inline-flex; }
          }

          .stage-content-body {
            flex: 1;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            position: relative;
          }

          /* Landing State */
          .landing-stage-empty {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 3rem;
            text-align: center;
            color: #64748b;
            background: linear-gradient(180deg, #fff 0%, #f8fafc 100%);
          }
          .landing-empty-art {
            width: 74px;
            height: 74px;
            border-radius: 24px;
            background: rgba(139,92,246,0.08);
            border: 1px solid rgba(139,92,246,0.18);
            color: #8b5cf6;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 2.2rem;
            margin-bottom: 1.5rem;
            box-shadow: 0 10px 25px rgba(139,92,246,0.06);
            animation: bounce-slow 4s infinite alternate;
          }
          @keyframes bounce-slow {
            0% { transform: translateY(0); }
            100% { transform: translateY(-8px); }
          }
          .landing-stage-empty h3 {
            font-size: 1.35rem;
            font-weight: 900;
            color: #0f172a;
            margin: 0 0 0.5rem;
            letter-spacing: -0.02em;
          }
          .landing-stage-empty p {
            max-width: 420px;
            font-size: 0.88rem;
            line-height: 1.6;
            margin: 0;
          }

          /* ── Tab 1: Live Chat Workspace ── */
          .chat-workspace-pane {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
          }
          .chat-pane-header {
            padding: 1rem 1.5rem;
            border-bottom: 1px solid #e2e8f0;
            background: #fff;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
            gap: 1.5rem;
          }
          .chat-pane-info {
            min-width: 0;
          }
          .chat-pane-name {
            font-size: 1rem;
            font-weight: 800;
            color: #0f172a;
            margin: 0 0 2px;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .chat-pane-phone {
            font-size: 0.78rem;
            color: #64748b;
            font-weight: 500;
          }
          
          .btn-trigger-notif {
            background: linear-gradient(135deg, rgba(139,92,246,0.09) 0%, rgba(139,92,246,0.02) 100%);
            border: 1px solid rgba(139, 92, 246, 0.2);
            color: #8b5cf6;
            padding: 0.5rem 1rem;
            border-radius: 12px;
            font-family: inherit;
            font-size: 0.8rem;
            font-weight: 700;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s;
            white-space: nowrap;
          }
          .btn-trigger-notif:hover {
            background: #8b5cf6;
            color: #fff;
            box-shadow: 0 4px 14px rgba(139,92,246,0.3);
            border-color: transparent;
          }

          .chat-scrollbox {
            flex: 1;
            overflow-y: auto;
            padding: 1.5rem;
            background: #f8fafc;
            display: flex;
            flex-direction: column;
            gap: 1rem;
          }
          .chat-scrollbox::-webkit-scrollbar { width: 4px; }
          .chat-scrollbox::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }

          .chat-msg-row {
            display: flex;
            flex-direction: column;
            max-width: 75%;
          }
          .chat-msg-row.me {
            align-self: flex-end;
            align-items: flex-end;
          }
          .chat-msg-row.them {
            align-self: flex-start;
            align-items: flex-start;
          }
          .chat-msg-bubble {
            padding: 0.75rem 1.1rem;
            border-radius: 18px;
            font-size: 0.88rem;
            line-height: 1.5;
            word-break: break-word;
            box-shadow: 0 2px 8px rgba(0,0,0,0.015);
          }
          .chat-msg-row.me .chat-msg-bubble {
            background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%);
            color: #fff;
            border-bottom-right-radius: 4px;
            box-shadow: 0 4px 18px rgba(13, 148, 136, 0.25);
          }
          .chat-msg-row.them .chat-msg-bubble {
            background: linear-gradient(145deg, #1e293b 0%, #0f172a 100%);
            color: #e2e8f0;
            border-bottom-left-radius: 4px;
            border: 1px solid rgba(255,255,255,0.06);
          }
          .chat-msg-meta {
            font-size: 0.65rem;
            color: #94a3b8;
            margin-top: 4px;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 4px;
          }
          .chat-msg-pending { color: #f59e0b; }

          .chat-compose-area {
            padding: 1.25rem 1.5rem;
            border-top: 1px solid #e2e8f0;
            background: #fff;
            flex-shrink: 0;
          }
          .chat-compose-row {
            display: flex;
            gap: 0.75rem;
            align-items: flex-end;
          }
          .chat-textbox {
            flex: 1;
            padding: 0.75rem 1rem;
            border-radius: 14px;
            border: 1px solid #cbd5e1;
            font-family: inherit;
            font-size: 0.88rem;
            outline: none;
            resize: none;
            min-height: 44px;
            max-height: 120px;
            line-height: 1.45;
            transition: all 0.2s;
          }
          .chat-textbox:focus {
            border-color: #0d9488;
            box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.12);
          }
          .chat-send-btn {
            background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%);
            border: none;
            color: #fff;
            width: 44px;
            height: 44px;
            border-radius: 13px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.22s;
            box-shadow: 0 4px 16px rgba(13,148,136,0.25);
            flex-shrink: 0;
          }
          .chat-send-btn:hover:not(:disabled) {
            transform: scale(1.05);
            box-shadow: 0 6px 20px rgba(13,148,136,0.35);
          }
          .chat-send-btn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
            box-shadow: none;
          }

          .chat-toast-banner {
            background: rgba(139, 92, 246, 0.95);
            backdrop-filter: blur(8px);
            border-bottom: 1px solid rgba(255, 255, 255, 0.15);
            padding: 0.65rem 1.25rem;
            display: flex;
            align-items: center;
            gap: 12px;
            cursor: pointer;
            animation: toastSlideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            z-index: 10;
            flex-shrink: 0;
          }
          @keyframes toastSlideDown {
            from { transform: translateY(-100%); opacity: 0; }
            to   { transform: translateY(0); opacity: 1; }
          }
          .chat-toast-icon {
            width: 32px;
            height: 32px;
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.18);
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.85rem;
            flex-shrink: 0;
          }
          .chat-toast-text {
            flex: 1;
            min-width: 0;
            text-align: left;
          }
          .chat-toast-title {
            font-size: 0.78rem;
            font-weight: 800;
            color: #fff;
          }
          .chat-toast-body {
            font-size: 0.72rem;
            color: rgba(255, 255, 255, 0.85);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-top: 1px;
          }
          .btn-close-toast {
            background: transparent;
            border: none;
            color: rgba(255, 255, 255, 0.7);
            cursor: pointer;
            font-size: 0.75rem;
            padding: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: color 0.2s;
          }
          .btn-close-toast:hover {
            color: #fff;
          }

          /* ── Tab 2: Broadcast Alert Composer ── */
          .composer-scrollbox {
            flex: 1;
            overflow-y: auto;
            padding: 2rem 2.5rem;
            background: #f8fafc;
          }
          .composer-scrollbox::-webkit-scrollbar { width: 4px; }
          .composer-card {
            background: #fff;
            border-radius: 20px;
            border: 1px solid #e2e8f0;
            padding: 2rem;
            max-width: 720px;
            margin: 0 auto;
            box-shadow: 0 8px 30px rgba(15,23,42,0.03);
          }
          .composer-card h2 {
            font-size: 1.25rem;
            font-weight: 800;
            color: #0f172a;
            margin: 0 0 0.5rem;
            letter-spacing: -0.01em;
          }
          .composer-card p {
            font-size: 0.82rem;
            color: #64748b;
            margin: 0 0 1.75rem;
            line-height: 1.5;
          }
          
          .form-group {
            display: flex;
            flex-direction: column;
            gap: 6px;
            margin-bottom: 1.25rem;
          }
          .form-label {
            font-size: 0.78rem;
            font-weight: 700;
            color: #475569;
            text-transform: uppercase;
            letter-spacing: 0.03em;
          }
          .form-input-text {
            padding: 0.75rem 1rem;
            border-radius: 12px;
            border: 1px solid #cbd5e1;
            font-family: inherit;
            font-size: 0.88rem;
            outline: none;
            transition: all 0.2s;
          }
          .form-input-text:focus {
            border-color: #8b5cf6;
            box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.12);
          }
          .form-textarea {
            padding: 0.75rem 1rem;
            border-radius: 12px;
            border: 1px solid #cbd5e1;
            font-family: inherit;
            font-size: 0.88rem;
            outline: none;
            resize: vertical;
            min-height: 120px;
            transition: all 0.2s;
          }
          .form-textarea:focus {
            border-color: #8b5cf6;
            box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.12);
          }

          .btn-submit-broad {
            background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
            border: none;
            color: #fff;
            padding: 0.8rem 1.5rem;
            border-radius: 12px;
            font-family: inherit;
            font-size: 0.88rem;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.25s;
            box-shadow: 0 4px 16px rgba(139, 92, 246, 0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            width: fit-content;
          }
          .btn-submit-broad:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 6px 22px rgba(139, 92, 246, 0.45);
          }
          .btn-submit-broad:disabled {
            opacity: 0.55;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
          }
          
          .broad-success-toast {
            background: rgba(16, 185, 129, 0.08);
            border: 1px solid rgba(16, 185, 129, 0.25);
            border-radius: 12px;
            padding: 0.85rem 1.15rem;
            color: #059669;
            font-size: 0.85rem;
            font-weight: 600;
            margin-bottom: 1.5rem;
            display: flex;
            align-items: center;
            gap: 8px;
            animation: slideInDown 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          }
          @keyframes slideInDown {
            from { transform: translateY(-10px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }

          /* ── Tab 3: Sent Notifications Log ── */
          .logs-scrollbox {
            flex: 1;
            overflow-y: auto;
            padding: 2rem;
            background: #f8fafc;
          }
          .logs-scrollbox::-webkit-scrollbar { width: 4px; }
          
          .logs-container {
            max-width: 820px;
            margin: 0 auto;
            display: flex;
            flex-direction: column;
            gap: 1rem;
          }
          .logs-title-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.5rem;
          }
          .logs-title-row h2 {
            font-size: 1.15rem;
            font-weight: 800;
            color: #0f172a;
            margin: 0;
          }
          .logs-count {
            font-size: 0.72rem;
            color: #64748b;
            font-weight: 700;
            background: #e2e8f0;
            padding: 0.25rem 0.6rem;
            border-radius: 99px;
          }

          .log-item-card {
            background: #fff;
            border-radius: 16px;
            border: 1px solid #e2e8f0;
            padding: 1.25rem 1.5rem;
            box-shadow: 0 4px 12px rgba(15,23,42,0.015);
            display: flex;
            gap: 1rem;
            align-items: flex-start;
            position: relative;
          }
          .log-item-badge {
            font-size: 0.65rem;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            padding: 0.25rem 0.55rem;
            border-radius: 6px;
            white-space: nowrap;
          }
          .log-badge-broadcast {
            background: rgba(13, 148, 136, 0.1);
            color: #0d9488;
            border: 1px solid rgba(13, 148, 136, 0.15);
          }
          .log-badge-direct {
            background: rgba(59, 130, 246, 0.1);
            color: #3b82f6;
            border: 1px solid rgba(59, 130, 246, 0.15);
          }
          .log-item-body {
            flex: 1;
            min-width: 0;
          }
          .log-item-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 1rem;
            margin-bottom: 0.35rem;
          }
          .log-item-title {
            font-size: 0.92rem;
            font-weight: 800;
            color: #0f172a;
          }
          .log-item-date {
            font-size: 0.7rem;
            color: #94a3b8;
            font-weight: 500;
          }
          .log-item-text {
            font-size: 0.82rem;
            color: #475569;
            line-height: 1.5;
            margin: 0;
            white-space: pre-wrap;
          }
          .log-item-recipient {
            font-size: 0.7rem;
            color: #64748b;
            font-weight: 700;
            margin-top: 8px;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            background: #f1f5f9;
            padding: 0.15rem 0.45rem;
            border-radius: 4px;
          }

          .log-empty-state {
            padding: 4rem 2rem;
            text-align: center;
            color: #94a3b8;
            background: #fff;
            border-radius: 20px;
            border: 1px solid #e2e8f0;
          }
          .log-empty-state i {
            font-size: 2.2rem;
            margin-bottom: 0.75rem;
          }
          .log-empty-state p {
            font-size: 0.88rem;
            margin: 0;
          }

          /* ── Premium Glassmorphic Modal (Direct Alert) ── */
          .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(15,23,42,0.45);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            z-index: 500;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1.5rem;
            animation: fadeIn 0.25s ease;
          }
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          .modal-window {
            background: rgba(255, 255, 255, 0.98);
            border-radius: 24px;
            border: 1px solid rgba(255,255,255,0.8);
            box-shadow: 0 30px 80px rgba(15, 23, 42, 0.22);
            width: 100%;
            max-width: 520px;
            overflow: hidden;
            animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          }
          @keyframes scaleIn {
            from { transform: scale(0.95) translateY(10px); opacity: 0; }
            to { transform: scale(1) translateY(0); opacity: 1; }
          }
          .modal-header {
            padding: 1.25rem 1.75rem;
            background: #f8fafc;
            border-bottom: 1px solid #e2e8f0;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .modal-header h3 {
            font-size: 1.05rem;
            font-weight: 850;
            color: #0f172a;
            margin: 0;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .modal-header h3 i { color: #3b82f6; }
          .modal-close-btn {
            background: none;
            border: none;
            color: #94a3b8;
            cursor: pointer;
            font-size: 1.1rem;
            padding: 0.25rem;
            transition: color 0.2s;
          }
          .modal-close-btn:hover { color: #64748b; }
          .modal-body {
            padding: 1.5rem 1.75rem 2rem;
          }
          .modal-recipient-pill {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: #eff6ff;
            color: #2563eb;
            font-size: 0.78rem;
            font-weight: 700;
            padding: 0.35rem 0.75rem;
            border-radius: 8px;
            margin-bottom: 1.5rem;
            border: 1px solid rgba(37, 99, 235, 0.12);
          }

          .btn-modal-submit {
            background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
            border: none;
            color: #fff;
            padding: 0.75rem 1.5rem;
            border-radius: 12px;
            font-family: inherit;
            font-size: 0.85rem;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s;
            box-shadow: 0 4px 14px rgba(59, 130, 246, 0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            width: 100%;
          }
          .btn-modal-submit:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
          }
          .btn-modal-submit:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
          }

          /* ── Mobile responsiveness overrides ── */
          @media (max-width: 600px) {
            .stage-header-tabs {
              padding: 0 0.5rem;
            }
            .stage-tabs {
              gap: 0.35rem;
              flex: 1;
              justify-content: space-around;
            }
            .stage-tab-btn {
              padding: 1rem 0.2rem;
              font-size: 0.78rem;
              gap: 4px;
            }
            .stage-tab-btn span {
              display: none !important; /* Hide text on mobile screens to show only icons cleanly */
            }
            .back-btn-mobile {
              padding: 0.35rem 0.5rem;
              font-size: 0.68rem;
              margin-left: 0.25rem;
            }

            /* Log Registry List Mobile Style */
            .logs-scrollbox {
              padding: 1rem;
            }
            .log-item-card {
              flex-direction: column;
              align-items: stretch;
              gap: 0.75rem;
              padding: 1rem;
            }
            .log-item-header {
              flex-direction: column;
              align-items: flex-start;
              gap: 4px;
            }
            .log-item-title {
              font-size: 0.88rem;
              line-height: 1.35;
            }
            .log-item-date {
              font-size: 0.68rem;
              color: #94a3b8;
              font-weight: 600;
            }
            .log-item-badge {
              width: fit-content;
              padding: 0.2rem 0.5rem;
              font-size: 0.6rem;
            }
            .composer-scrollbox {
              padding: 1rem;
            }
            .composer-card {
              padding: 1.25rem;
            }
            .composer-card h2 {
              font-size: 1.1rem;
            }
          }
        `}</style>

        {/* ── LEFT COLUMN: THREAD PANEL ── */}
        <div className="sidebar-column">
          <div className="sidebar-header">
            <h3 className="sidebar-title">
              <i className="fas fa-comments"></i> Parent Dialogues
            </h3>
            <div className="search-wrapper">
              <i className="fas fa-search"></i>
              <input
                type="text"
                className="search-input"
                placeholder="Search phone, parent, child…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="thread-list">
            {parentThreads.length === 0 ? (
              <div className="no-threads-state">
                <i className="fas fa-search"></i>
                <p>{searchTerm ? 'No matching threads found.' : 'No active messaging threads yet.'}</p>
              </div>
            ) : (
              parentThreads.map((thread) => {
                const isActive = selectedParentPhone === thread.phone;
                return (
                  <button
                    key={thread.phone}
                    className={`thread-item ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedParentPhone(thread.phone);
                      setActiveTab('chat');
                    }}
                  >
                    <div className="thread-avatar">
                      {thread.name.substring(0, 2)}
                    </div>
                    <div className="thread-details">
                      <div className="thread-name-row">
                        <span className="thread-name">{thread.name}</span>
                        {thread.lastMessage && (
                          <span className="thread-time">{formatTime(thread.lastMessage.created_at)}</span>
                        )}
                      </div>
                      <div className="thread-snippet">
                        {thread.lastMessage ? (
                          <>
                            {thread.lastMessage.senderRole === 'head_teacher' && 'You: '}
                            {thread.lastMessage.content}
                          </>
                        ) : (
                          'Ready to chat'
                        )}
                      </div>
                      {thread.children.length > 0 && (
                        <div className="thread-children">
                          <i className="fas fa-child"></i>
                          <span>
                            {thread.children.map(c => c.fullName.split(' ')[0]).join(', ')}
                          </span>
                        </div>
                      )}
                    </div>
                    {thread.unreadCount > 0 && (
                      <span className="unread-indicator-badge">{thread.unreadCount}</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN: MAIN STAGE ── */}
        <div className="stage-column">
          <div className="stage-header-tabs">
            <div className="stage-tabs">
              <button
                className={`stage-tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
                onClick={() => setActiveTab('chat')}
              >
                <i className="fas fa-comment-dots"></i> <span>Live Workspace</span>
              </button>
              <button
                className={`stage-tab-btn ${activeTab === 'broadcast' ? 'active' : ''}`}
                onClick={() => setActiveTab('broadcast')}
              >
                <i className="fas fa-bullhorn"></i> <span>Send Broadcast</span>
              </button>
              <button
                className={`stage-tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
                onClick={() => setActiveTab('logs')}
              >
                <i className="fas fa-history"></i> <span>Alert Registry</span>
              </button>
            </div>

            {selectedParentPhone && (
              <button className="back-btn-mobile" onClick={() => setSelectedParentPhone(null)}>
                <i className="fas fa-chevron-left"></i> Conversations
              </button>
            )}
          </div>

          <div className="stage-content-body">
            {activeTab === 'chat' && (
              <>
                {!selectedParentPhone ? (
                  <div className="landing-stage-empty">
                    <div className="landing-empty-art">
                      <i className="fas fa-comments"></i>
                    </div>
                    <h3>Labour Communication Workspace</h3>
                    <p>Select a parent thread on the left to begin active live support, view dynamic family registers, or issue direct targeted notification bulletins.</p>
                  </div>
                ) : (
                  <div className="chat-workspace-pane">
                    <div className="chat-pane-header">
                      <div className="chat-pane-info">
                        <h4 className="chat-pane-name">
                          {activeThread?.name}
                        </h4>
                        <div className="chat-pane-phone">
                          <span style={{ marginRight: '10px' }}><i className="fas fa-phone-alt" style={{ color: '#cbd5e1', marginRight: '4px' }}></i>{activeThread?.phone}</span>
                          {activeThread?.children && activeThread.children.length > 0 && (
                            <span style={{ color: '#8b5cf6', fontWeight: 700 }}>
                              <i className="fas fa-user-graduate" style={{ marginRight: '4px' }}></i>
                              Guardian of: {activeThread.children.map(c => `${c.fullName} (${getClassName(c.classId)})`).join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <button className="btn-trigger-notif" onClick={() => setDirectNotifOpen(true)}>
                        <i className="fas fa-envelope-open-text"></i> Direct Notice
                      </button>
                    </div>

                    {newReplyNotif && (
                      <div 
                        className="chat-toast-banner" 
                        onClick={() => {
                          if (newReplyNotif.isOtherParent) {
                            setSelectedParentPhone(newReplyNotif.parentPhone);
                          }
                          setNewReplyNotif(null);
                        }}
                        style={{
                          background: newReplyNotif.isOtherParent ? 'rgba(13, 148, 136, 0.95)' : 'rgba(139, 92, 246, 0.95)',
                          cursor: 'pointer'
                        }}
                      >
                        <div className="chat-toast-icon">
                          <i className="fas fa-comment-dots"></i>
                        </div>
                        <div className="chat-toast-text">
                          <div className="chat-toast-title">
                            {newReplyNotif.customTitle || "New Message from Parent"}
                          </div>
                          <div className="chat-toast-body">{newReplyNotif.content}</div>
                        </div>
                        {newReplyNotif.isOtherParent && (
                          <div style={{
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            background: 'rgba(255, 255, 255, 0.2)',
                            color: '#fff',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            marginRight: '6px',
                            whiteSpace: 'nowrap'
                          }}>
                            Click to Open
                          </div>
                        )}
                        <button className="btn-close-toast" onClick={(e) => { e.stopPropagation(); setNewReplyNotif(null); }}>
                          <i className="fas fa-times"></i>
                        </button>
                      </div>
                    )}

                    <div className="chat-scrollbox">
                      {activeMessages.length === 0 ? (
                        <div className="landing-stage-empty" style={{ background: 'transparent' }}>
                          <div className="landing-empty-art" style={{ width: '56px', height: '56px', fontSize: '1.5rem', background: 'rgba(13,148,136,0.06)', color: '#0d9488', borderColor: 'rgba(13,148,136,0.12)' }}>
                            <i className="fas fa-paper-plane"></i>
                          </div>
                          <h4 style={{ color: '#0f172a', fontWeight: 800, margin: '0 0 4px' }}>No messages yet</h4>
                          <p style={{ fontSize: '0.8rem' }}>Draft and send a text bubble to begin direct messaging with this guardian.</p>
                        </div>
                      ) : (
                        activeMessages.map((m) => {
                          const isMe = m.senderRole === 'head_teacher';
                          return (
                            <div key={m.id} className={`chat-msg-row ${isMe ? 'me' : 'them'}`}>
                              <div className="chat-msg-bubble">{m.content}</div>
                              <div className="chat-msg-meta">
                                {formatTime(m.created_at)}
                                {isMe && !m.synced && (
                                  <i className="fas fa-clock chat-msg-pending" title="Sending…"></i>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                      <div ref={chatBottomRef} />
                    </div>

                    <div className="chat-compose-area">
                      <div className="chat-compose-row">
                        <textarea
                          className="chat-textbox"
                          rows={1}
                          placeholder={`Message ${activeThread?.name.split(' ')[0]}…`}
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSendMessage();
                            }
                          }}
                        />
                        <button
                          className="chat-send-btn"
                          onClick={handleSendMessage}
                          disabled={sendingMsg || !chatInput.trim()}
                        >
                          <i className="fas fa-paper-plane"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {activeTab === 'broadcast' && (
              <div className="composer-scrollbox">
                <div className="composer-card">
                  {broadcastSuccess && (
                    <div className="broad-success-toast">
                      <i className="fas fa-check-circle"></i>
                      <span>School-wide Broadcast notification distributed successfully!</span>
                    </div>
                  )}
                  <h2>School-Wide Broadcast Alert</h2>
                  <p>Issue general warnings, calendar listings, assembly notifications, or system declarations to **ALL registered parent portals** instantly.</p>
                  
                  <form onSubmit={handleSendBroadcast}>
                    <div className="form-group">
                      <label className="form-label">Alert Title</label>
                      <input
                        type="text"
                        className="form-input-text"
                        placeholder="e.g. PTA General Assembly Call"
                        value={broadcastTitle}
                        onChange={(e) => setBroadcastTitle(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Declaration Content</label>
                      <textarea
                        className="form-textarea"
                        placeholder="Draft the details of the alert here. Keep it descriptive, informative, and precise…"
                        value={broadcastContent}
                        onChange={(e) => setBroadcastContent(e.target.value)}
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      className="btn-submit-broad"
                      disabled={sendingBroadcast || !broadcastTitle.trim() || !broadcastContent.trim()}
                    >
                      {sendingBroadcast ? (
                        <>
                          <i className="fas fa-spinner fa-spin"></i> Distributing…
                        </>
                      ) : (
                        <>
                          <i className="fas fa-bullhorn"></i> Dispatch Alert
                        </>
                      )}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {activeTab === 'logs' && (
              <div className="logs-scrollbox">
                <div className="logs-container">
                  <div className="logs-title-row">
                    <h2>Alert &amp; Broadcast Log Registry</h2>
                    <span className="logs-count">{localNotifications.length} Alerts</span>
                  </div>

                  {localNotifications.length === 0 ? (
                    <div className="log-empty-state">
                      <i className="fas fa-history"></i>
                      <p>No records inside the school alert log registry yet.</p>
                    </div>
                  ) : (
                    localNotifications.map((n) => (
                      <div key={n.id} className="log-item-card">
                        <span className={`log-item-badge ${n.parentPhone ? 'log-badge-direct' : 'log-badge-broadcast'}`}>
                          {n.parentPhone ? 'Targeted' : 'Broadcast'}
                        </span>
                        <div className="log-item-body">
                          <div className="log-item-header">
                            <span className="log-item-title">{n.title}</span>
                            <span className="log-item-date">{formatDate(n.created_at)}</span>
                          </div>
                          <p className="log-item-text">{n.content}</p>
                          {n.parentPhone && (
                            <div className="log-item-recipient">
                              <i className="fas fa-user-circle"></i>
                              <span>Sent to guardian: {n.parentPhone}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── DIRECT TARGETED NOTIFICATION GLASSMODAL ── */}
        {directNotifOpen && (
          <div className="modal-overlay" onClick={() => setDirectNotifOpen(false)}>
            <div className="modal-window" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3><i className="fas fa-envelope-open-text"></i> Direct Targeted Alert</h3>
                <button className="modal-close-btn" onClick={() => setDirectNotifOpen(false)}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="modal-body">
                {directSuccess ? (
                  <div className="broad-success-toast" style={{ margin: '0 0 1rem' }}>
                    <i className="fas fa-check-circle"></i>
                    <span>Direct notification dispatched successfully!</span>
                  </div>
                ) : (
                  <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 1rem', lineHeight: 1.55 }}>
                    Compose a direct targeted bulletin. This alert will pop up only inside the portal bell dropdown for **{activeThread?.name}**, complete with a direct-message envelope icon.
                  </p>
                )}
                
                <div className="modal-recipient-pill">
                  <i className="fas fa-user"></i>
                  <span>Recipient: {activeThread?.name} ({activeThread?.phone})</span>
                </div>

                <form onSubmit={handleSendDirectNotification}>
                  <div className="form-group">
                    <label className="form-label">Alert Headline</label>
                    <input
                      type="text"
                      className="form-input-text"
                      placeholder="e.g. Sibling Tuition Arrears Reminder"
                      value={directTitle}
                      onChange={(e) => setDirectTitle(e.target.value)}
                      required
                      disabled={directSuccess}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Notification Content</label>
                    <textarea
                      className="form-textarea"
                      placeholder="Type details regarding balance issues, behavior status, or specific parent reminders…"
                      value={directContent}
                      onChange={(e) => setDirectContent(e.target.value)}
                      required
                      disabled={directSuccess}
                    />
                  </div>
                  <button
                    type="submit"
                    className="btn-modal-submit"
                    disabled={sendingDirect || directSuccess || !directTitle.trim() || !directContent.trim()}
                  >
                    {sendingDirect ? (
                      <>
                        <i className="fas fa-spinner fa-spin"></i> Dispatched…
                      </>
                    ) : (
                      <>
                        <i className="fas fa-paper-plane"></i> Dispatch targeted alert
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default HeadTeacherMessages;
