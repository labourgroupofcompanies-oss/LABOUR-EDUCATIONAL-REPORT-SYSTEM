import React, { useState, useEffect, useRef } from 'react';
import Layout from '../../components/layout/Layout';
import { db } from '../../lib/db';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../store/AuthContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { enqueueSync } from '../../services/syncEngine';
import { compressImageToBlob, processSchoolLogo, blobToDataURL } from '../../utils/imageUtils';
import authService from '../../services/authService';
import { DEFAULT_GRADING_SCALE } from '../../lib/grading';

const Settings = () => {
  const { user, updateProfile } = useAuth();
  const isAdmin = user?.role === 'super_admin';

  const globalSettings = useLiveQuery(() => db.settings.get('global'), []);
  const schoolData = useLiveQuery(() => user?.schoolId ? db.schools.get(user.schoolId) : null, [user]);
  
  const [activeTab, setActiveTab] = useState(isAdmin ? 'school' : 'profile'); // 'school' | 'assessment' | 'profile' | 'security'

  // User Profile State
  const [profileName, setProfileName] = useState('');
  const [profileStaffId, setProfileStaffId] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    if (user) {
      setProfileName(user.fullName || '');
      setProfileStaffId(user.staffId || '');
    }
  }, [user]);

  // Security / Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      alert("Please fill in all password fields.");
      return;
    }
    if (newPassword !== confirmPassword) {
      alert("New passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      alert("New password must be at least 6 characters long.");
      return;
    }
    
    setIsChangingPassword(true);
    try {
      await authService.changeStaffPassword(user.id, currentPassword, newPassword);
      alert("Password changed successfully!");
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      alert(err.message || "Failed to change password. Please verify your current password.");
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Assessment & Grading State
  const [settings, setSettings] = useState({
    caWeight: 30,
    examWeight: 70,
    caModel: 'simple_mean',
    caBestNCount: '',
    caBreakdown: [
      { id: 'tests', label: 'Class Tests', count: 2, maxScore: 15, enabled: true },
      { id: 'assignments', label: 'Group work', count: 2, maxScore: 10, enabled: true },
      { id: 'projects', label: 'Project Work', count: 1, maxScore: 10, enabled: true }
    ],
    gradingScale: DEFAULT_GRADING_SCALE,
    enableBest6Aggregate: true
  });

  // School Profile State
  const [school, setSchool] = useState({
    name: '',
    motto: '',
    logoUrl: '',
    location: '',
    district: '',
    region: '',
    circuit: '',
    schoolType: 'private',
    currentAcademicYear: '',
    currentTerm: 'Term 1',
    vacationDate: '',
    nextTermBegins: '',
    phone: '',
    email: ''
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  // Sync from Cloud on mount
  useEffect(() => {
    const fetchCloudSettings = async () => {
      if (!navigator.onLine || !user?.schoolId) return;
      try {
        const { data: settingsList, error: settingsError } = await supabase
          .from('report_settings')
          .select('*')
          .eq('id', user.schoolId);
        const settingsData = settingsList?.[0];

        if (settingsData && !settingsError) {
          let rawBreakdown = settingsData.ca_breakdown || [];
          let needsUpdate = false;

          const cleanBreakdown = rawBreakdown.filter(item => {
            if (item.id === 'exercises') {
              needsUpdate = true;
              return false;
            }
            return true;
          }).map(item => {
            if (item.id === 'assignments' && item.label !== 'Group work') {
              needsUpdate = true;
              return { ...item, label: 'Group work' };
            }
            return item;
          });

          await db.settings.put({
            id: 'global',
            caWeight: settingsData.ca_weight,
            examWeight: settingsData.exam_weight,
            caModel: settingsData.ca_model,
            caBestNCount: settingsData.ca_best_n || '',
            caBreakdown: cleanBreakdown,
            gradingScale: settingsData.grading_scale || [],
            enableBest6Aggregate: settingsData.enable_best6_aggregate ?? true
          });

          if (needsUpdate) {
            await enqueueSync('upsert', 'report_settings', {
              id: user.schoolId,
              school_id: user.schoolId,
              ca_weight: settingsData.ca_weight,
              exam_weight: settingsData.exam_weight,
              ca_model: settingsData.ca_model,
              ca_best_n: settingsData.ca_best_n || null,
              ca_breakdown: cleanBreakdown,
              grading_scale: settingsData.grading_scale || [],
              enable_best6_aggregate: settingsData.enable_best6_aggregate ?? true,
              updated_at: new Date().toISOString()
            }, user.schoolId);
          }
        }

        const { data: schoolCloudData, error: schoolError } = await supabase
          .from('report_schools')
          .select('*')
          .eq('id', user.schoolId);
        const sData = schoolCloudData?.[0];

        if (sData && !schoolError) {
          const localSchool = await db.schools.get(user.schoolId).catch(() => null);
          const remoteLogo = sData.logo_url;
          const localLogo = localSchool?.logoUrl;
          const isLocalDataUrl = localLogo && typeof localLogo === 'string' && localLogo.startsWith('data:');
          const isRemoteDataUrl = remoteLogo && typeof remoteLogo === 'string' && remoteLogo.startsWith('data:');
          const isRemoteStorageBroken = remoteLogo && typeof remoteLogo === 'string' && remoteLogo.includes('storage/v1/object/public/learner-photos/logos');

          let effectiveLogo = localLogo || '';
          if (isRemoteDataUrl) {
            effectiveLogo = remoteLogo;
          } else if (remoteLogo && typeof remoteLogo === 'string' && !isRemoteStorageBroken) {
            effectiveLogo = remoteLogo;
          } else if (isLocalDataUrl) {
            effectiveLogo = localLogo;
          } else if (remoteLogo && typeof remoteLogo === 'string') {
            effectiveLogo = remoteLogo;
          }

          const rawType = (sData.school_type || sData.school_category || localSchool?.schoolType || 'private').toLowerCase();
          const effectiveType = rawType === 'public' || rawType === 'ges' ? 'public' : rawType === 'international' ? 'international' : 'private';
          const effectiveCategory = sData.school_category || (effectiveType === 'public' ? 'GES' : effectiveType === 'international' ? 'International' : 'Private');

          await db.schools.put({
            ...(localSchool || {}),
            id: user.schoolId,
            name: sData.name || localSchool?.name || '',
            motto: sData.motto ?? localSchool?.motto ?? '',
            logoUrl: effectiveLogo,
            logoBlob: localSchool?.logoBlob || null,
            location: sData.location ?? localSchool?.location ?? '',
            district: sData.district ?? localSchool?.district ?? '',
            region: sData.region ?? localSchool?.region ?? '',
            circuit: sData.circuit ?? localSchool?.circuit ?? '',
            schoolType: effectiveType,
            school_category: effectiveCategory,
            currentAcademicYear: sData.current_academic_year || localSchool?.currentAcademicYear || '',
            currentTerm: sData.current_term || localSchool?.currentTerm || 'Term 1',
            vacationDate: sData.vacation_date || localSchool?.vacationDate || '',
            nextTermBegins: sData.next_term_begins || localSchool?.nextTermBegins || '',
            phone: sData.phone || localSchool?.phone || '',
            email: sData.email || localSchool?.email || ''
          });
        }
      } catch (err) {
        console.warn('Could not fetch settings from cloud, using local database:', err);
      }
    };

    fetchCloudSettings();
  }, [user]);

  // Sync state from Dexie IndexedDB
  useEffect(() => {
    if (globalSettings) {
      let rawBreakdown = globalSettings.caBreakdown || [];
      const cleanBreakdown = rawBreakdown.filter(item => item.id !== 'exercises').map(item => {
        if (item.id === 'assignments' && item.label !== 'Group work') {
          return { ...item, label: 'Group work' };
        }
        return item;
      });

      setSettings({
        caWeight: globalSettings.caWeight ?? 30,
        examWeight: globalSettings.examWeight ?? 70,
        caModel: globalSettings.caModel || 'simple_mean',
        caBestNCount: globalSettings.caBestNCount || '',
        caBreakdown: cleanBreakdown.length > 0 ? cleanBreakdown : [
          { id: 'tests', label: 'Class Tests', count: 2, maxScore: 15, enabled: true },
          { id: 'assignments', label: 'Group work', count: 2, maxScore: 10, enabled: true },
          { id: 'projects', label: 'Project Work', count: 1, maxScore: 10, enabled: true }
        ],
        gradingScale: globalSettings.gradingScale && globalSettings.gradingScale.length > 0
          ? globalSettings.gradingScale
          : DEFAULT_GRADING_SCALE,
        enableBest6Aggregate: globalSettings.enableBest6Aggregate ?? true
      });
    }
  }, [globalSettings]);

  useEffect(() => {
    if (schoolData) {
      setSchool(prev => ({
        ...prev,
        name: schoolData.name || prev.name || '',
        motto: schoolData.motto || prev.motto || '',
        logoUrl: schoolData.logoUrl || prev.logoUrl || '',
        location: schoolData.location || prev.location || '',
        district: schoolData.district || prev.district || '',
        region: schoolData.region || prev.region || '',
        circuit: schoolData.circuit || prev.circuit || '',
        schoolType: schoolData.schoolType || prev.schoolType || 'private',
        currentAcademicYear: schoolData.currentAcademicYear || prev.currentAcademicYear || '',
        currentTerm: schoolData.currentTerm || prev.currentTerm || 'Term 1',
        vacationDate: schoolData.vacationDate || prev.vacationDate || '',
        nextTermBegins: schoolData.nextTermBegins || prev.nextTermBegins || '',
        phone: schoolData.phone || prev.phone || '',
        email: schoolData.email || prev.email || ''
      }));
    }
  }, [schoolData]);

  // Handle Logo Upload
  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploadingLogo(true);
    try {
      let dataUrl = null;
      let logoBlob = null;
      try {
        logoBlob = await processSchoolLogo(file, 600);
        dataUrl = await blobToDataURL(logoBlob);
      } catch (procErr) {
        logoBlob = await compressImageToBlob(file, 400, 400, 0.85);
        dataUrl = await blobToDataURL(logoBlob);
      }

      if (!dataUrl) {
        throw new Error('Failed to generate image preview.');
      }

      // 1. Immediately update UI state
      setSchool(prev => ({ ...prev, logoUrl: dataUrl }));

      // 2. Save directly to local IndexedDB (with both dataUrl and raw blob)
      if (user?.schoolId) {
        await db.schools.update(user.schoolId, { 
          logoUrl: dataUrl, 
          logoBlob,
          logo_url: dataUrl 
        });

        // 3. Persist directly to Supabase report_schools table (fast & permanent)
        try {
          await supabase
            .from('report_schools')
            .update({ 
              logo_url: dataUrl,
              updated_at: new Date().toISOString()
            })
            .eq('id', user.schoolId);
        } catch (dbErr) {
          console.warn('[Settings] Direct Supabase logo update skipped, queued in sync engine:', dbErr);
        }

        // 4. Also enqueue to sync engine for offline-safe guarantee
        await enqueueSync('upsert', 'report_schools', {
          id: user.schoolId,
          logo_url: dataUrl,
          updated_at: new Date().toISOString()
        }, user.schoolId);
      }

      alert('School logo saved successfully!');
    } catch (err) {
      alert(`Failed to process logo: ${err.message}`);
    } finally {
      setIsUploadingLogo(false);
      e.target.value = '';
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();

    if (Number(settings.caWeight) + Number(settings.examWeight) !== 100) {
      alert('Continuous Assessment and Exam weights must sum to exactly 100%.');
      return;
    }

    if (settings.caModel === 'best_n' && (!settings.caBestNCount || Number(settings.caBestNCount) <= 0)) {
      alert('Please specify how many top components to count for Best N.');
      return;
    }
    
    setIsSaving(true);
    
    const sortedScale = [...settings.gradingScale]
      .map(item => ({
        ...item,
        min: item.min === '' ? 0 : Number(item.min),
        max: item.max === '' ? '' : Number(item.max)
      }))
      .sort((a, b) => Number(b.min) - Number(a.min));

    const finalScale = sortedScale.map((item, index) => {
      if (item.max === '') {
        const calculatedMax = index === 0 ? 100 : (Number(sortedScale[index - 1].min) - 1);
        return {
          ...item,
          max: Math.max(0, calculatedMax)
        };
      }
      return {
        ...item,
        max: Number(item.max)
      };
    });

    const updatedSettings = { ...settings, gradingScale: finalScale, id: 'global' };
    setSettings(updatedSettings);
    
    await db.settings.put(updatedSettings);

    if (user?.schoolId) {
      const sType = school.schoolType || 'private';
      const mappedCategory = sType === 'public' ? 'GES' : sType === 'international' ? 'International' : 'Private';

      await db.schools.put({
        ...school,
        schoolType: sType,
        school_category: mappedCategory,
        id: user.schoolId
      });
    }

    if (user?.schoolId) {
      try {
        const sType = school.schoolType || 'private';
        const mappedCategory = sType === 'public' ? 'GES' : sType === 'international' ? 'International' : 'Private';

        await enqueueSync('upsert', 'report_settings', {
          id: user.schoolId,
          school_id: user.schoolId,
          ca_weight: settings.caWeight,
          exam_weight: settings.examWeight,
          ca_model: settings.caModel,
          ca_best_n: settings.caBestNCount || null,
          ca_breakdown: settings.caBreakdown,
          grading_scale: finalScale,
          enable_best6_aggregate: settings.enableBest6Aggregate ?? true,
          updated_at: new Date().toISOString()
        }, user.schoolId);

        await enqueueSync('upsert', 'report_schools', {
          id: user.schoolId,
          name: school.name,
          school_type: sType,
          school_category: mappedCategory,
          motto: school.motto || null,
          logo_url: school.logoUrl || null,
          location: school.location || null,
          district: school.district || null,
          region: school.region || null,
          circuit: school.circuit || null,
          current_academic_year: school.currentAcademicYear || null,
          current_term: school.currentTerm || null,
          vacation_date: school.vacationDate || null,
          next_term_begins: school.nextTermBegins || null,
          phone: school.phone || null,
          email: school.email || null,
          updated_at: new Date().toISOString()
        }, user.schoolId);

      } catch (err) {
        console.error('Failed to sync settings or school:', err);
      }
    }

    setIsSaving(false);
    alert('Settings saved and synchronized successfully!');
  };

  // Canvas Signature state & handlers
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signaturePreview, setSignaturePreview] = useState(null);

  useEffect(() => {
    if (user?.id) {
      db.profiles.get(user.id).then(p => {
        if (p) {
          if (p.signature instanceof Blob) {
            setSignaturePreview(URL.createObjectURL(p.signature));
          } else if (p.signatureUrl) {
            setSignaturePreview(p.signatureUrl);
          }
        }
      });
    }
  }, [user]);

  const getCanvasCoordinates = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const getTouchCoordinates = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (touch.clientX - rect.left) * scaleX,
      y: (touch.clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const coords = e.touches ? getTouchCoordinates(e, canvas) : getCanvasCoordinates(e, canvas);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const coords = e.touches ? getTouchCoordinates(e, canvas) : getCanvasCoordinates(e, canvas);
    ctx.lineTo(coords.x, coords.y);
    ctx.strokeStyle = '#09090b';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const saveCanvasSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      await uploadAndSaveSignature(blob);
    }, 'image/png');
  };

  const handleSignatureUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const compressed = await compressImageToBlob(file, 400, 200, 0.9);
      await uploadAndSaveSignature(compressed);
    } catch (err) {
      alert('Failed to upload signature: ' + err.message);
    }
  };

  const uploadAndSaveSignature = async (blob) => {
    try {
      await db.profiles.update(user.id, {
        signature: blob,
        updatedAt: new Date().toISOString()
      });
      setSignaturePreview(URL.createObjectURL(blob));

      if (navigator.onLine && user?.id) {
        const path = `signatures/${user.id}.png`;
        const { error: uploadErr } = await supabase.storage
          .from('learner-photos')
          .upload(path, blob, { upsert: true, contentType: 'image/png' });

        if (!uploadErr) {
          const { data } = supabase.storage.from('learner-photos').getPublicUrl(path);
          const publicUrl = data.publicUrl;
          await db.profiles.update(user.id, {
            signatureUrl: publicUrl,
            updatedAt: new Date().toISOString()
          });

          await enqueueSync('upsert', 'report_profiles', {
            id: user.id,
            signature_url: publicUrl,
            updated_at: new Date().toISOString()
          }, user.schoolId);
        }
      }
      alert('Digital signature saved successfully!');
    } catch (err) {
      alert('Failed to save signature: ' + err.message);
    }
  };

  const deleteSignature = async () => {
    if (!window.confirm('Are you sure you want to delete your digital signature?')) return;
    try {
      await db.profiles.update(user.id, {
        signature: null,
        signatureUrl: null,
        updatedAt: new Date().toISOString()
      });
      setSignaturePreview(null);
      clearCanvas();

      if (navigator.onLine && user?.id) {
        await enqueueSync('upsert', 'report_profiles', {
          id: user.id,
          signature_url: null,
          updated_at: new Date().toISOString()
        }, user.schoolId);
        await supabase.storage.from('learner-photos').remove([`signatures/${user.id}.png`]).catch(() => null);
      }
      alert('Signature deleted.');
    } catch (err) {
      alert('Failed to delete signature: ' + err.message);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setIsSavingProfile(true);
    try {
      await updateProfile({
        fullName: profileName,
        staffId: profileStaffId
      });
      alert('Profile updated successfully!');
    } catch (err) {
      alert('Failed to update profile: ' + err.message);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const addGradingRow = () => {
    setSettings({
      ...settings,
      gradingScale: [
        ...settings.gradingScale,
        { min: 0, max: 100, grade: 'X', remark: 'Custom', interpretation: 'Custom' }
      ]
    });
  };

  const removeGradingRow = (index) => {
    const newScale = settings.gradingScale.filter((_, i) => i !== index);
    setSettings({ ...settings, gradingScale: newScale });
  };

  const tabs = [
    ...(isAdmin ? [{ id: 'school', label: 'School & Term', icon: 'fa-school' }] : []),
    ...(isAdmin ? [{ id: 'assessment', label: 'Grading & CA', icon: 'fa-sliders' }] : []),
    { id: 'profile', label: 'My Profile', icon: 'fa-user-gear' },
    { id: 'security', label: 'Security', icon: 'fa-key' }
  ];

  return (
    <Layout title={isAdmin ? "Settings & Preferences" : "Profile & Settings"}>
      <style>{`
        .settings-header-banner {
          background: #09090B;
          border-radius: 20px;
          padding: 1.5rem 1.75rem;
          color: #FFFFFF;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 1.25rem;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .settings-tab-bar {
          display: flex;
          gap: 6px;
          background: #FFFFFF;
          padding: 5px;
          border-radius: 14px;
          border: 1px solid #E4E4E7;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .settings-tab-bar::-webkit-scrollbar {
          display: none;
        }
        .settings-card {
          background: #FFFFFF;
          border-radius: 16px;
          border: 1px solid #E4E4E7;
          padding: 1.25rem 1.5rem;
          box-shadow: 0 1px 3px rgba(0,0,0,0.03);
          margin-bottom: 1.25rem;
        }
        .settings-field-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .settings-field-group label {
          font-size: 0.76rem;
          font-weight: 700;
          color: #475569;
        }
        .settings-input {
          width: 100%;
          padding: 0.55rem 0.85rem;
          border-radius: 8px;
          border: 1px solid #CBD5E1;
          font-size: 0.85rem;
          outline: 'none';
          box-sizing: border-box;
          background: #FFFFFF;
          color: #0F172A;
        }
        .settings-input:focus {
          border-color: #2563EB;
          outline: none;
        }
        @media (max-width: 768px) {
          .settings-header-banner {
            padding: 1.25rem 1rem;
            border-radius: 16px;
          }
          .settings-metrics-grid {
            display: grid !important;
            grid-template-columns: repeat(2, 1fr) !important;
            width: 100% !important;
            gap: 8px !important;
          }
          .settings-two-col {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
        
        {/* Executive Header Banner */}
        <div className="settings-header-banner">
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 9px', borderRadius: '999px', background: 'rgba(37, 99, 235, 0.2)', border: '1px solid rgba(37, 99, 235, 0.35)', color: '#60A5FA', fontSize: '0.72rem', fontWeight: 800, marginBottom: '0.5rem' }}>
              <i className="fas fa-sliders"></i> Portal Settings
            </div>
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.65rem', fontWeight: 800, margin: '0 0 4px', letterSpacing: '-0.02em', color: '#FFFFFF' }}>
              Settings &amp; Preferences
            </h1>
            <p style={{ margin: 0, color: '#A1A1AA', fontSize: '0.84rem', maxWidth: '460px' }}>
              Manage school identity, academic grading, user profile, and security.
            </p>
          </div>

          {/* Minimalist Glassmorphic Status Cards */}
          <div className="settings-metrics-grid" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '0.75rem 1.1rem', minWidth: '110px' }}>
              <div style={{ fontSize: '0.68rem', color: '#A1A1AA', fontWeight: 700, textTransform: 'uppercase' }}>School</div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#FFFFFF', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }}>
                {school.name || 'My School'}
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '0.75rem 1.1rem', minWidth: '100px' }}>
              <div style={{ fontSize: '0.68rem', color: '#A1A1AA', fontWeight: 700, textTransform: 'uppercase' }}>Active Term</div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#FFFFFF', marginTop: '2px' }}>
                {school.currentTerm || 'Term 1'}
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '0.75rem 1.1rem', minWidth: '95px' }}>
              <div style={{ fontSize: '0.68rem', color: '#A1A1AA', fontWeight: 700, textTransform: 'uppercase' }}>CA / Exam</div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#60A5FA', marginTop: '2px' }}>
                {settings.caWeight}/{settings.examWeight}%
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '0.75rem 1.1rem', minWidth: '90px' }}>
              <div style={{ fontSize: '0.68rem', color: '#A1A1AA', fontWeight: 700, textTransform: 'uppercase' }}>Role</div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#10B981', marginTop: '2px' }}>
                {user?.role === 'super_admin' ? 'Admin' : 'Teacher'}
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation Switcher */}
        <div className="settings-tab-bar">
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '0.6rem 1.15rem',
                  borderRadius: '10px',
                  border: 'none',
                  background: isActive ? '#09090B' : 'transparent',
                  color: isActive ? '#FFFFFF' : '#71717A',
                  fontWeight: 700,
                  fontSize: '0.84rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s'
                }}
              >
                <i className={`fas ${tab.icon}`} style={{ color: isActive ? '#2563EB' : '#A1A1AA' }}></i>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── TAB 1: SCHOOL & ACADEMIC CALENDAR ───────────────────────────── */}
        {activeTab === 'school' && isAdmin && (
          <form onSubmit={handleSave} className="fade-in">
            
            {/* School Profile Card */}
            <div className="settings-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #F1F5F9', paddingBottom: '0.75rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#09090B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fas fa-school" style={{ color: '#2563EB', fontSize: '0.95rem' }}></i>
                  School Identity &amp; Contact
                </h3>
              </div>

              <div style={{ display: 'flex', gap: '1.75rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {/* Logo Uploader */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flex: '0 0 130px' }}>
                  <div style={{
                    width: '110px',
                    height: '110px',
                    borderRadius: '50%',
                    border: '3px solid #2563EB',
                    background: '#F8FAFC',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    position: 'relative'
                  }}>
                    {school.logoUrl ? (
                      <img
                        src={school.logoUrl}
                        alt="School Logo"
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    ) : (
                      <i className="fas fa-university" style={{ fontSize: '2.5rem', color: '#CBD5E1' }} />
                    )}
                  </div>
                  <label 
                    style={{ 
                      padding: '0.35rem 0.75rem', 
                      fontSize: '0.75rem', 
                      background: isUploadingLogo ? '#A1A1AA' : '#09090B', 
                      color: 'white', 
                      cursor: isUploadingLogo ? 'not-allowed' : 'pointer', 
                      borderRadius: '8px', 
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    {isUploadingLogo ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-camera"></i>}
                    <span>{isUploadingLogo ? 'Uploading...' : 'Change Logo'}</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleLogoUpload} 
                      disabled={isUploadingLogo}
                      style={{ display: 'none' }} 
                    />
                  </label>
                </div>

                {/* Form Fields Grid */}
                <div style={{ flex: '1 1 380px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem' }}>
                  <div className="settings-field-group">
                    <label>School Name *</label>
                    <input 
                      type="text" 
                      className="settings-input" 
                      value={school.name} 
                      onChange={(e) => setSchool({ ...school, name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="settings-field-group">
                    <label>Motto</label>
                    <input 
                      type="text" 
                      className="settings-input" 
                      value={school.motto} 
                      onChange={(e) => setSchool({ ...school, motto: e.target.value })}
                    />
                  </div>

                  <div className="settings-field-group">
                    <label>School Ownership Type</label>
                    <select 
                      className="settings-input" 
                      value={school.schoolType || 'private'} 
                      onChange={(e) => setSchool({ ...school, schoolType: e.target.value })}
                    >
                      <option value="private">Private School</option>
                      <option value="public">Public / GES School</option>
                      <option value="international">International School</option>
                    </select>
                  </div>

                  <div className="settings-field-group">
                    <label>Location / Town</label>
                    <input 
                      type="text" 
                      className="settings-input" 
                      value={school.location} 
                      onChange={(e) => setSchool({ ...school, location: e.target.value })}
                    />
                  </div>

                  <div className="settings-field-group">
                    <label>District</label>
                    <input 
                      type="text" 
                      className="settings-input" 
                      value={school.district} 
                      onChange={(e) => setSchool({ ...school, district: e.target.value })}
                    />
                  </div>

                  <div className="settings-field-group">
                    <label>Region</label>
                    <input 
                      type="text" 
                      className="settings-input" 
                      value={school.region} 
                      onChange={(e) => setSchool({ ...school, region: e.target.value })}
                    />
                  </div>

                  <div className="settings-field-group">
                    <label>Phone Number</label>
                    <input 
                      type="text" 
                      className="settings-input" 
                      value={school.phone} 
                      onChange={(e) => setSchool({ ...school, phone: e.target.value })}
                    />
                  </div>

                  <div className="settings-field-group">
                    <label>Email Address</label>
                    <input 
                      type="email" 
                      className="settings-input" 
                      value={school.email} 
                      onChange={(e) => setSchool({ ...school, email: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Academic Calendar Card */}
            <div className="settings-card">
              <h3 style={{ margin: '0 0 1.25rem', fontSize: '1.1rem', fontWeight: 800, color: '#09090B', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #F1F5F9', paddingBottom: '0.75rem' }}>
                <i className="fas fa-calendar-days" style={{ color: '#2563EB', fontSize: '0.95rem' }}></i>
                Academic Term &amp; Schedule
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem' }}>
                <div className="settings-field-group">
                  <label>Current Academic Year</label>
                  <input 
                    type="text" 
                    className="settings-input" 
                    placeholder="e.g. 2025/2026"
                    value={school.currentAcademicYear} 
                    onChange={(e) => setSchool({ ...school, currentAcademicYear: e.target.value })}
                  />
                </div>

                <div className="settings-field-group">
                  <label>Current Running Term</label>
                  <select 
                    className="settings-input" 
                    value={school.currentTerm || 'Term 1'} 
                    onChange={(e) => setSchool({ ...school, currentTerm: e.target.value })}
                  >
                    <option value="Term 1">Term 1</option>
                    <option value="Term 2">Term 2</option>
                    <option value="Term 3">Term 3</option>
                  </select>
                </div>

                <div className="settings-field-group">
                  <label>Vacation Date</label>
                  <input 
                    type="date" 
                    className="settings-input" 
                    value={school.vacationDate} 
                    onChange={(e) => setSchool({ ...school, vacationDate: e.target.value })}
                  />
                </div>

                <div className="settings-field-group">
                  <label>Next Term Begins</label>
                  <input 
                    type="date" 
                    className="settings-input" 
                    value={school.nextTermBegins} 
                    onChange={(e) => setSchool({ ...school, nextTermBegins: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="submit"
                  disabled={isSaving}
                  style={{
                    padding: '0.65rem 1.35rem',
                    borderRadius: '10px',
                    background: '#09090B',
                    border: 'none',
                    color: '#FFFFFF',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {isSaving ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save" />}
                  <span>Save School Profile</span>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* ── TAB 2: GRADING & CONTINUOUS ASSESSMENT ──────────────────────── */}
        {activeTab === 'assessment' && isAdmin && (
          <form onSubmit={handleSave} className="fade-in">
            {/* Assessment Weights */}
            <div className="settings-card">
              <h3 style={{ margin: '0 0 1.25rem', fontSize: '1.1rem', fontWeight: 800, color: '#09090B', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #F1F5F9', paddingBottom: '0.75rem' }}>
                <i className="fas fa-balance-scale" style={{ color: '#2563EB', fontSize: '0.95rem' }}></i>
                Assessment Weight Distribution
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '0.75rem' }}>
                <div className="settings-field-group">
                  <label>Continuous Assessment (CA) %</label>
                  <input 
                    type="number" 
                    className="settings-input" 
                    value={settings.caWeight} 
                    onChange={(e) => setSettings({ ...settings, caWeight: Number(e.target.value) })}
                    min="0" max="100"
                  />
                </div>
                <div className="settings-field-group">
                  <label>Examination %</label>
                  <input 
                    type="number" 
                    className="settings-input" 
                    value={settings.examWeight} 
                    onChange={(e) => setSettings({ ...settings, examWeight: Number(e.target.value) })}
                    min="0" max="100"
                  />
                </div>
              </div>

              {Number(settings.caWeight) + Number(settings.examWeight) !== 100 ? (
                <div style={{ color: '#DC2626', fontSize: '0.8rem', fontWeight: 700 }}>
                  <i className="fas fa-triangle-exclamation" style={{ marginRight: '4px' }}></i>
                  Weights must equal 100% (Current: {Number(settings.caWeight) + Number(settings.examWeight)}%)
                </div>
              ) : (
                <div style={{ color: '#16A34A', fontSize: '0.8rem', fontWeight: 700 }}>
                  <i className="fas fa-check-circle" style={{ marginRight: '4px' }}></i>
                  Balanced (100% Total)
                </div>
              )}
            </div>

            {/* Continuous Assessment Breakdown */}
            <div className="settings-card">
              <h3 style={{ margin: '0 0 1.25rem', fontSize: '1.1rem', fontWeight: 800, color: '#09090B', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #F1F5F9', paddingBottom: '0.75rem' }}>
                <i className="fas fa-calculator" style={{ color: '#2563EB', fontSize: '0.95rem' }}></i>
                Continuous Assessment Breakdown
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                <div className="settings-field-group">
                  <label>Calculation Model</label>
                  <select 
                    className="settings-input" 
                    value={settings.caModel} 
                    onChange={(e) => setSettings({ ...settings, caModel: e.target.value })}
                  >
                    <option value="simple_mean">Simple Mean (Average of all components)</option>
                    <option value="best_n">Best 'N' Model (Average of top components)</option>
                  </select>
                </div>

                {settings.caModel === 'best_n' && (
                  <div className="settings-field-group">
                    <label>Top 'N' Count</label>
                    <input 
                      type="number" 
                      className="settings-input" 
                      placeholder="e.g. 3"
                      value={settings.caBestNCount || ''} 
                      onChange={(e) => setSettings({ ...settings, caBestNCount: e.target.value ? Number(e.target.value) : '' })}
                      min="1"
                    />
                  </div>
                )}
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                      <th style={{ padding: '0.65rem 0.85rem', fontSize: '0.75rem', color: '#475569', fontWeight: 800, textTransform: 'uppercase' }}>Component</th>
                      <th style={{ padding: '0.65rem 0.85rem', fontSize: '0.75rem', color: '#475569', fontWeight: 800, textAlign: 'center', textTransform: 'uppercase' }}>Count</th>
                      <th style={{ padding: '0.65rem 0.85rem', fontSize: '0.75rem', color: '#475569', fontWeight: 800, textAlign: 'center', textTransform: 'uppercase' }}>Max Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settings.caBreakdown?.map((item, index) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '0.65rem 0.85rem', fontWeight: 700, fontSize: '0.85rem', color: '#09090B' }}>{item.label}</td>
                        <td style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>
                          <input 
                            type="number" 
                            className="settings-input" 
                            style={{ textAlign: 'center', width: '70px', margin: '0 auto' }}
                            value={item.count || ''}
                            onChange={(e) => {
                              const newBreakdown = [...settings.caBreakdown];
                              newBreakdown[index].count = e.target.value ? Number(e.target.value) : '';
                              newBreakdown[index].enabled = newBreakdown[index].count > 0;
                              setSettings({ ...settings, caBreakdown: newBreakdown });
                            }}
                          />
                        </td>
                        <td style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>
                          <input 
                            type="number" 
                            className="settings-input" 
                            style={{ textAlign: 'center', width: '70px', margin: '0 auto' }}
                            value={item.maxScore || ''}
                            onChange={(e) => {
                              const newBreakdown = [...settings.caBreakdown];
                              newBreakdown[index].maxScore = e.target.value ? Number(e.target.value) : '';
                              setSettings({ ...settings, caBreakdown: newBreakdown });
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Grading Scale Table */}
            <div className="settings-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #F1F5F9', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#09090B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fas fa-chart-simple" style={{ color: '#2563EB', fontSize: '0.95rem' }}></i>
                  Grading Scale Matrix
                </h3>

                <button
                  type="button"
                  onClick={addGradingRow}
                  style={{
                    padding: '0.4rem 0.8rem',
                    borderRadius: '8px',
                    background: '#EFF6FF',
                    border: '1px solid #BFDBFE',
                    color: '#1D4ED8',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  <i className="fas fa-plus" style={{ marginRight: '4px' }}></i> Add Row
                </button>
              </div>

              <div style={{ overflowX: 'auto', marginBottom: '1.25rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                      <th style={{ padding: '0.65rem 0.85rem', fontSize: '0.75rem', color: '#475569', fontWeight: 800, textTransform: 'uppercase' }}>Min</th>
                      <th style={{ padding: '0.65rem 0.85rem', fontSize: '0.75rem', color: '#475569', fontWeight: 800, textTransform: 'uppercase' }}>Max</th>
                      <th style={{ padding: '0.65rem 0.85rem', fontSize: '0.75rem', color: '#475569', fontWeight: 800, textTransform: 'uppercase' }}>Grade</th>
                      <th style={{ padding: '0.65rem 0.85rem', fontSize: '0.75rem', color: '#475569', fontWeight: 800, textTransform: 'uppercase' }}>Remark</th>
                      <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {settings.gradingScale?.map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '0.5rem 0.65rem' }}>
                          <input 
                            type="number" 
                            className="settings-input" 
                            style={{ width: '60px' }}
                            value={row.min ?? ''} 
                            onChange={(e) => {
                              const newScale = [...settings.gradingScale];
                              newScale[idx].min = e.target.value === '' ? '' : Number(e.target.value);
                              setSettings({ ...settings, gradingScale: newScale });
                            }}
                          />
                        </td>
                        <td style={{ padding: '0.5rem 0.65rem' }}>
                          <input 
                            type="number" 
                            className="settings-input" 
                            style={{ width: '60px' }}
                            value={row.max ?? ''} 
                            onChange={(e) => {
                              const newScale = [...settings.gradingScale];
                              newScale[idx].max = e.target.value === '' ? '' : Number(e.target.value);
                              setSettings({ ...settings, gradingScale: newScale });
                            }}
                          />
                        </td>
                        <td style={{ padding: '0.5rem 0.65rem' }}>
                          <input 
                            type="text" 
                            className="settings-input" 
                            style={{ width: '50px', fontWeight: 800, textAlign: 'center' }}
                            value={row.grade || ''} 
                            onChange={(e) => {
                              const newScale = [...settings.gradingScale];
                              newScale[idx].grade = e.target.value;
                              setSettings({ ...settings, gradingScale: newScale });
                            }}
                          />
                        </td>
                        <td style={{ padding: '0.5rem 0.65rem' }}>
                          <input 
                            type="text" 
                            className="settings-input" 
                            value={row.remark || ''} 
                            onChange={(e) => {
                              const newScale = [...settings.gradingScale];
                              newScale[idx].remark = e.target.value;
                              setSettings({ ...settings, gradingScale: newScale });
                            }}
                          />
                        </td>
                        <td style={{ padding: '0.5rem 0.65rem', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => removeGradingRow(idx)}
                            style={{ border: 'none', background: 'transparent', color: '#EF4444', cursor: 'pointer', padding: '4px' }}
                          >
                            <i className="fas fa-trash-can"></i>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Best 6 Aggregate Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.25rem' }}>
                <input
                  type="checkbox"
                  id="best6Toggle"
                  checked={settings.enableBest6Aggregate}
                  onChange={e => setSettings({ ...settings, enableBest6Aggregate: e.target.checked })}
                  style={{ width: '16px', height: '16px', accentColor: '#2563EB', cursor: 'pointer' }}
                />
                <label htmlFor="best6Toggle" style={{ fontSize: '0.84rem', fontWeight: 700, color: '#09090B', cursor: 'pointer' }}>
                  Enable Best 6 Aggregate calculation on Broadsheets and Reports
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="submit"
                  disabled={isSaving}
                  style={{
                    padding: '0.65rem 1.35rem',
                    borderRadius: '10px',
                    background: '#09090B',
                    border: 'none',
                    color: '#FFFFFF',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {isSaving ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save" />}
                  <span>Save Grading Settings</span>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* ── TAB 3: USER PROFILE & SIGNATURE ────────────────────────────── */}
        {activeTab === 'profile' && (
          <div className="fade-in">
            <div className="settings-card">
              <h3 style={{ margin: '0 0 1.25rem', fontSize: '1.1rem', fontWeight: 800, color: '#09090B', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #F1F5F9', paddingBottom: '0.75rem' }}>
                <i className="fas fa-user-circle" style={{ color: '#2563EB', fontSize: '0.95rem' }}></i>
                Personal Profile Details
              </h3>

              <form onSubmit={handleSaveProfile}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem', marginBottom: '1.25rem' }}>
                  <div className="settings-field-group">
                    <label>Full Name</label>
                    <input 
                      type="text" 
                      className="settings-input" 
                      value={profileName} 
                      onChange={(e) => setProfileName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="settings-field-group">
                    <label>Staff ID</label>
                    <input 
                      type="text" 
                      className="settings-input" 
                      value={profileStaffId} 
                      onChange={(e) => setProfileStaffId(e.target.value)}
                    />
                  </div>

                  <div className="settings-field-group">
                    <label>Email Address</label>
                    <input 
                      type="email" 
                      className="settings-input" 
                      value={user?.email || ''} 
                      disabled
                      style={{ background: '#F8FAFC', color: '#64748B' }}
                    />
                  </div>

                  <div className="settings-field-group">
                    <label>Assigned Role</label>
                    <input 
                      type="text" 
                      className="settings-input" 
                      value={user?.role === 'super_admin' ? 'Super Administrator' : 'Staff Teacher'} 
                      disabled
                      style={{ background: '#F8FAFC', color: '#64748B' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="submit"
                    disabled={isSavingProfile}
                    style={{
                      padding: '0.6rem 1.25rem',
                      borderRadius: '10px',
                      background: '#09090B',
                      border: 'none',
                      color: '#FFFFFF',
                      fontWeight: 800,
                      fontSize: '0.84rem',
                      cursor: isSavingProfile ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {isSavingProfile ? 'Saving...' : 'Save Profile'}
                  </button>
                </div>
              </form>
            </div>

            {/* Digital Signature Card */}
            <div className="settings-card">
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: 800, color: '#09090B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fas fa-signature" style={{ color: '#2563EB', fontSize: '0.95rem' }}></i>
                Official Digital Signature
              </h3>
              <p style={{ margin: '0 0 1rem', fontSize: '0.8rem', color: '#71717A' }}>
                Draw on the pad below or upload an image to print your signature on terminal report cards.
              </p>

              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {/* Signature Pad */}
                <div style={{ flex: '1 1 280px' }}>
                  <div style={{
                    border: '1px solid #CBD5E1',
                    borderRadius: '10px',
                    background: '#FAFAFA',
                    overflow: 'hidden',
                    marginBottom: '0.5rem'
                  }}>
                    <canvas
                      ref={canvasRef}
                      width={380}
                      height={120}
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                      style={{ width: '100%', height: '120px', display: 'block', cursor: 'crosshair', touchAction: 'none' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={clearCanvas}
                      style={{
                        padding: '0.4rem 0.75rem',
                        borderRadius: '6px',
                        background: '#F1F5F9',
                        border: 'none',
                        color: '#475569',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={saveCanvasSignature}
                      style={{
                        padding: '0.4rem 0.85rem',
                        borderRadius: '6px',
                        background: '#09090B',
                        border: 'none',
                        color: '#FFFFFF',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Save Drawing
                    </button>
                    <label style={{
                      padding: '0.4rem 0.85rem',
                      borderRadius: '6px',
                      background: '#EFF6FF',
                      border: '1px solid #BFDBFE',
                      color: '#1D4ED8',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}>
                      Upload File
                      <input type="file" accept="image/*" onChange={handleSignatureUpload} style={{ display: 'none' }} />
                    </label>
                  </div>
                </div>

                {/* Preview */}
                {signaturePreview && (
                  <div style={{ flex: '0 0 160px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Current Signature
                    </div>
                    <div style={{ padding: '8px', border: '1px solid #E2E8F0', borderRadius: '8px', background: '#FFFFFF', marginBottom: '6px' }}>
                      <img src={signaturePreview} alt="Signature" style={{ maxHeight: '50px', maxWidth: '100%', objectFit: 'contain' }} />
                    </div>
                    <button
                      type="button"
                      onClick={deleteSignature}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        border: '1px solid #FEE2E2',
                        background: '#FEF2F2',
                        color: '#DC2626',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 4: ACCOUNT SECURITY ────────────────────────────────────── */}
        {activeTab === 'security' && (
          <div className="fade-in">
            <div className="settings-card" style={{ maxWidth: '500px' }}>
              <h3 style={{ margin: '0 0 1.25rem', fontSize: '1.1rem', fontWeight: 800, color: '#09090B', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #F1F5F9', paddingBottom: '0.75rem' }}>
                <i className="fas fa-lock" style={{ color: '#2563EB', fontSize: '0.95rem' }}></i>
                Change Password
              </h3>

              <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div className="settings-field-group">
                  <label>Current Password</label>
                  <input 
                    type="password" 
                    className="settings-input" 
                    value={currentPassword} 
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                </div>

                <div className="settings-field-group">
                  <label>New Password (min. 6 characters)</label>
                  <input 
                    type="password" 
                    className="settings-input" 
                    value={newPassword} 
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                </div>

                <div className="settings-field-group">
                  <label>Confirm New Password</label>
                  <input 
                    type="password" 
                    className="settings-input" 
                    value={confirmPassword} 
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>

                <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="submit"
                    disabled={isChangingPassword}
                    style={{
                      padding: '0.6rem 1.35rem',
                      borderRadius: '10px',
                      background: '#09090B',
                      border: 'none',
                      color: '#FFFFFF',
                      fontWeight: 800,
                      fontSize: '0.84rem',
                      cursor: isChangingPassword ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {isChangingPassword ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
};

export default Settings;
