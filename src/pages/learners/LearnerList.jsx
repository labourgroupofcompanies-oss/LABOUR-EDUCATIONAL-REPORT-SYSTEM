import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Layout from '../../components/layout/Layout';
import { db } from '../../lib/db';
import { supabase } from '../../lib/supabase';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../../store/AuthContext';
import { compressImageToBlob } from '../../utils/imageUtils';
import LearnerPhoto from '../../components/common/LearnerPhoto';
import authService from '../../services/authService';
import { enqueueSync } from '../../services/syncEngine';
import * as XLSX from 'xlsx';

// ── Registration number helpers ──────────────────────────────────────────────
const REG_KEY = 'labour_edu_last_reg';
const PREFIX_KEY = 'labour_edu_reg_prefix';

const DEFAULT_PREFIX = 'STUD';

// Returns the stored prefix (e.g. 'STUD', 'GES', 'BKS')
const getPrefix = () => localStorage.getItem(PREFIX_KEY) || DEFAULT_PREFIX;

// Returns next number as zero-padded 4-digit string
const peekNextRegNumber = () => {
  const num = parseInt(localStorage.getItem(REG_KEY) || '0', 10) + 1;
  return `${getPrefix()}-${String(num).padStart(4, '0')}`;
};

// Advances counter and returns the number used
const getNextRegNumber = () => {
  const last = parseInt(localStorage.getItem(REG_KEY) || '0', 10);
  const next = last + 1;
  localStorage.setItem(REG_KEY, String(next));
  return next;
};

// Extract and save prefix from a user-typed value like "GES-0023" → "GES"
const savePrefix = (value) => {
  const match = value.match(/^([A-Za-z0-9]+)[\s\-\_]/);
  if (match) localStorage.setItem(PREFIX_KEY, match[1].toUpperCase());
};

const mapHeadersAndParse = (headers, rows, schoolId, classesList) => {
  const findColIndex = (patterns) => {
    return headers.findIndex(h => {
      if (h === undefined || h === null) return false;
      const cleanH = String(h).toLowerCase().replace(/[\s\_\-]/g, '');
      return patterns.some(p => cleanH.includes(p.toLowerCase().replace(/[\s\_\-]/g, '')));
    });
  };

  const nameIdx = findColIndex(['fullname', 'name', 'learnername', 'studentname', 'student', 'learner']);
  const regIdx = findColIndex(['regnumber', 'registration', 'regno', 'studentid', 'indexno', 'admissionno', 'student_no', 'learner_no']);
  const genderIdx = findColIndex(['gender', 'sex']);
  const classIdx = findColIndex(['class', 'classname', 'grade', 'stage']);
  
  const guardNameIdx = findColIndex(['guardianname', 'parentname', 'guardian', 'parent', 'father', 'mother']);
  const guardContact1Idx = findColIndex(['phone', 'contact', 'mobile', 'primarycontact', 'phone1']);
  const guardContact2Idx = findColIndex(['phone2', 'secondarycontact', 'othercontact', 'contact2']);
  const guardRelationIdx = findColIndex(['relation', 'relationship', 'guardianrelation']);
  const guardLocationIdx = findColIndex(['location', 'address', 'residence']);
  const guardProfessionIdx = findColIndex(['profession', 'occupation', 'job']);

  const parsed = [];
  
  rows.forEach((row, rowIndex) => {
    if (!row || row.length === 0 || row.every(val => val === undefined || val === null || String(val).trim() === '')) {
      return;
    }

    const getVal = (idx) => {
      if (idx === -1 || idx >= row.length) return '';
      const v = row[idx];
      return v !== undefined && v !== null ? String(v).trim() : '';
    };

    const rawName = getVal(nameIdx);
    const rawReg = getVal(regIdx);
    const rawGender = getVal(genderIdx);
    const rawClass = getVal(classIdx);
    
    let normalizedGender = 'Male';
    if (rawGender) {
      const gLower = rawGender.toLowerCase();
      if (gLower.startsWith('f') || gLower.includes('female') || gLower.includes('girl')) {
        normalizedGender = 'Female';
      }
    }

    let matchedClassId = '';
    if (rawClass && classesList) {
      const matched = classesList.find(c => c.name.toLowerCase().trim() === rawClass.toLowerCase().trim());
      if (matched) matchedClassId = String(matched.id);
    }

    parsed.push({
      tempId: `${Date.now()}-${rowIndex}-${Math.random()}`,
      fullName: rawName,
      regNumber: rawReg,
      gender: normalizedGender,
      className: rawClass,
      classId: matchedClassId,
      guardianName: getVal(guardNameIdx),
      guardianContact1: getVal(guardContact1Idx),
      guardianContact2: getVal(guardContact2Idx),
      guardianRelation: getVal(guardRelationIdx),
      guardianLocation: getVal(guardLocationIdx),
      guardianProfession: getVal(guardProfessionIdx),
      warningClass: matchedClassId === '',
      warningName: rawName === ''
    });
  });

  return parsed;
};

const LearnerList = () => {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [photoMode, setPhotoMode] = useState('upload');
  const [cameraActive, setCameraActive] = useState(false);
  // photoPreview holds a Blob (from camera/file) or a string URL (from existing record)
  const [photoPreview, setPhotoPreview] = useState(null);
  // photoPreviewUrl is an object URL derived from a Blob preview, for memory-safe <img> rendering
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null);
  // Camera device management
  const [cameras, setCameras] = useState([]);       // list of VideoInputDeviceInfo
  const [activeCamIdx, setActiveCamIdx] = useState(0); // which camera is in use
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const fileInputExcelRef = useRef(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importData, setImportData] = useState([]);
  const [importing, setImporting] = useState(false);
  const blank = { 
    fullName: '', 
    regNumber: peekNextRegNumber(), 
    gender: 'Male', 
    currentClassId: '',
    guardianName: '',
    guardianRelation: '',
    guardianContact1: '',
    guardianContact2: '',
    guardianProfession: '',
    guardianLocation: ''
  };
  const [form, setForm] = useState(blank);
  const [profileLearner, setProfileLearner] = useState(null);
  const [profileTab, setProfileTab] = useState('personal');

  // Reassign registration numbers states
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
  const [reassignPrefix, setReassignPrefix] = useState('');
  const [reassignStartNum, setReassignStartNum] = useState('1');
  const [reassignStatus, setReassignStatus] = useState('');
  const [isReassigning, setIsReassigning] = useState(false);

  const learners = useLiveQuery(() => user?.schoolId ? db.learners.where('schoolId').equals(user.schoolId).toArray() : [], [user?.schoolId]);
  const classes = useLiveQuery(() => user?.schoolId ? db.classes.where('schoolId').equals(user.schoolId).toArray() : [], [user?.schoolId]);

  const schoolInfo = useLiveQuery(
    () => user?.schoolId ? db.schools.get(user.schoolId) : null, [user]
  );

  // Sync the last registration number from the database whenever learners list changes
  useEffect(() => {
    if (learners && learners.length > 0) {
      const prefix = getPrefix().toUpperCase();
      let maxNum = 0;
      
      learners.forEach(l => {
        if (!l.regNumber) return;
        const regStr = String(l.regNumber).trim().toUpperCase();
        
        if (regStr.startsWith(prefix)) {
          const suffixPart = regStr.substring(prefix.length);
          const match = suffixPart.match(/(\d+)/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > maxNum) maxNum = num;
          }
        } else {
          const match = regStr.match(/(\d+)$/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > maxNum) maxNum = num;
          }
        }
      });

      if (maxNum > 0) {
        localStorage.setItem(REG_KEY, String(maxNum));
        
        // Asynchronously update the form registration number if it is currently in "new student" mode and hasn't been edited yet
        setForm(prev => {
          if (!editingId && (!prev.fullName || prev.fullName.trim() === '')) {
            return {
              ...prev,
              regNumber: peekNextRegNumber()
            };
          }
          return prev;
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learners, editingId]);

  const activeAcademicYear = schoolInfo?.currentAcademicYear || '';
  const activeTerm = schoolInfo?.currentTerm || 'Term 1';

  const learnerSummary = useLiveQuery(async () => {
    if (!profileLearner || !activeAcademicYear || !activeTerm) return null;
    return await db.reportSummaries
      .filter(s =>
        (s.learnerId === profileLearner.id || s.learnerId === String(profileLearner.id) || (profileLearner.supabaseId && s.learnerId === profileLearner.supabaseId)) &&
        s.academicYear === activeAcademicYear &&
        s.term === activeTerm
      )
      .first();
  }, [profileLearner, activeAcademicYear, activeTerm]);

  const learnerScores = useLiveQuery(async () => {
    if (!profileLearner || !activeAcademicYear || !activeTerm) return [];
    return await db.scores
      .filter(s =>
        (s.learnerId === profileLearner.id || s.learnerId === String(profileLearner.id) || (profileLearner.supabaseId && s.learnerId === profileLearner.supabaseId)) &&
        s.term === activeTerm &&
        s.academicYear === activeAcademicYear
      )
      .toArray();
  }, [profileLearner, activeAcademicYear, activeTerm]);

  const currentAverage = useMemo(() => {
    if (!learnerScores || learnerScores.length === 0) return null;
    const sum = learnerScores.reduce((acc, s) => acc + (Number(s.totalScore) || 0), 0);
    return parseFloat((sum / learnerScores.length).toFixed(1));
  }, [learnerScores]);

  const attendanceRate = useMemo(() => {
    if (!learnerSummary) return null;
    const present = Number(learnerSummary.attendancePresent);
    const total = Number(learnerSummary.attendanceTotal);
    if (isNaN(present) || isNaN(total) || total <= 0) return null;
    return parseFloat(((present / total) * 100).toFixed(1));
  }, [learnerSummary]);

  // ── Stop any running stream (stable ref, no deps) ──
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  // ── Enumerate cameras (requests permission so labels appear) ──
  const loadCameras = useCallback(async () => {
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ video: true });
      probe.getTracks().forEach(t => t.stop());
      const all = await navigator.mediaDevices.enumerateDevices();
      return all.filter(d => d.kind === 'videoinput');
    } catch { return []; }
  }, []);

  // ── Start a specific camera by deviceId ──
  const startCameraDevice = useCallback(async (deviceId, idx, camList) => {
    // Stop previous stream first, then wait a tick for the device to release
    stopCamera();
    await new Promise(r => setTimeout(r, 150));
    try {
      const constraints = deviceId
        ? { video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } }
        : { video: { facingMode: 'user' } };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      // Attach to video element — videoRef must be mounted at this point
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => videoRef.current?.play().catch(() => {});
      }
      setCameraActive(true);
      setActiveCamIdx(idx);
      setCameras(camList);
    } catch (err) {
      console.warn('Camera switch failed:', err);
      // Do NOT reset photoMode — just show error state, keep camera UI visible
      setCameraActive(false);
    }
  }, [stopCamera]);

  // ── Switch to next/prev camera ──
  const switchCamera = useCallback(async (dir) => {
    if (cameras.length < 2) return;
    const next = (activeCamIdx + dir + cameras.length) % cameras.length;
    await startCameraDevice(cameras[next]?.deviceId, next, cameras);
  }, [cameras, activeCamIdx, startCameraDevice]);

  const capturePhoto = () => {
    const v = videoRef.current, c = canvasRef.current;
    if (!v || !c) return;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    // Get blob directly from canvas — no base64 string ever created
    c.toBlob(async (rawBlob) => {
      if (!rawBlob) return;
      try {
        const compressed = await compressImageToBlob(rawBlob, 500, 500, 0.85);
        setPhotoPreview(compressed);
      } catch (err) {
        console.warn('Failed to compress camera capture:', err);
        setPhotoPreview(rawBlob);
      }
      stopCamera();
    }, 'image/jpeg', 0.92);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageToBlob(file, 500, 500, 0.85);
      setPhotoPreview(compressed);
    } catch (err) {
      console.warn('Failed to compress uploaded file:', err);
      setPhotoPreview(file);
    }
  };

  const openModal = () => {
    setEditingId(null);
    setForm({
      fullName: '',
      regNumber: peekNextRegNumber(),
      gender: 'Male',
      currentClassId: '',
      guardianName: '',
      guardianRelation: '',
      guardianContact1: '',
      guardianContact2: '',
      guardianProfession: '',
      guardianLocation: ''
    });
    setPhotoPreview(null); setPhotoPreviewUrl(null); setPhotoMode('upload');
    setCameras([]); setActiveCamIdx(0);
    setIsModalOpen(true);
  };

  const openEditModal = (l) => {
    setEditingId(l.id);
    setForm({
      fullName: l.fullName,
      regNumber: l.regNumber,
      gender: l.gender,
      currentClassId: String(l.currentClassId),
      guardianName: l.guardianName || '',
      guardianRelation: l.guardianRelation || '',
      guardianContact1: l.guardianContact1 || '',
      guardianContact2: l.guardianContact2 || '',
      guardianProfession: l.guardianProfession || '',
      guardianLocation: l.guardianLocation || ''
    });
    // photo may be a Blob (local) or a string URL (remote cached)
    setPhotoPreview(l.photo || l.photoUrl || null);
    setPhotoMode('upload');
    setCameras([]); setActiveCamIdx(0);
    setIsModalOpen(true);
  };

  const closeModal = () => { stopCamera(); setIsModalOpen(false); setPhotoPreview(null); setPhotoPreviewUrl(null); };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!form.currentClassId) { alert('Please assign a class.'); return; }
    setIsSaving(true);
    try {
      // Determine if we have a fresh local Blob (needs upload) or an existing URL
      const isNewBlob = photoPreview instanceof Blob;
      let remotePhotoUrl = null;

      // If online and we have a fresh Blob, upload it immediately
      if (navigator.onLine && isNewBlob) {
        try {
          const cleanReg = String(form.regNumber).replace(/[^a-zA-Z0-9]/g, '_');
          const path = `learners/${user.schoolId}_${cleanReg}_${Date.now()}.webp`;
          const { error } = await supabase.storage.from('learner-photos').upload(path, photoPreview, { upsert: true, contentType: 'image/webp' });
          if (!error) {
            const { data } = supabase.storage.from('learner-photos').getPublicUrl(path);
            if (data?.publicUrl) remotePhotoUrl = data.publicUrl;
          }
        } catch (err) {
          console.warn('Failed to upload photo to storage:', err);
        }
      } else if (typeof photoPreview === 'string' && photoPreview.startsWith('http')) {
        // Existing remote URL kept as-is
        remotePhotoUrl = photoPreview;
      }

      // photo field stores the Blob (for offline display) OR the remote URL as a string fallback
      // photoUrl field stores the remote HTTP URL (for Supabase sync)
      const photoField = isNewBlob ? photoPreview : (photoPreview || null);
      // If we uploaded, store the URL reference so we can detect URL changes on next pull sync
      const photoUrlField = remotePhotoUrl;

      const record = {
        fullName: form.fullName,
        regNumber: String(form.regNumber),
        gender: form.gender,
        schoolId: user.schoolId,
        currentClassId: Number(form.currentClassId),
        photo: photoField,
        photoUrl: photoUrlField,
        guardianName: form.guardianName,
        guardianRelation: form.guardianRelation,
        guardianContact1: form.guardianContact1,
        guardianContact2: form.guardianContact2,
        guardianProfession: form.guardianProfession,
        guardianLocation: form.guardianLocation,
        // Mark synced=false if we have an un-uploaded local Blob (sync engine will handle it)
        synced: isNewBlob && !remotePhotoUrl ? false : false,
        updatedAt: new Date().toISOString()
      };

      if (editingId) {
        const existing = await db.learners.get(editingId);
        await db.learners.update(editingId, record);

        if (existing?.supabaseId) {
          await enqueueSync('update', 'report_learners', {
            filter: { id: existing.supabaseId },
            data: {
              full_name: record.fullName,
              reg_number: record.regNumber,
              gender: record.gender,
              class_id: record.currentClassId,
              photo_url: remotePhotoUrl,
              guardian_name: record.guardianName,
              guardian_relation: record.guardianRelation,
              guardian_contact_1: record.guardianContact1,
              guardian_contact_2: record.guardianContact2,
              guardian_profession: record.guardianProfession,
              guardian_location: record.guardianLocation,
              updated_at: record.updatedAt
            }
          });
          await db.learners.update(editingId, { synced: true });
        }
      } else {
        record.createdAt = new Date().toISOString();
        const localId = await db.learners.add(record);
        await enqueueSync('insert', 'report_learners', {
          full_name: record.fullName,
          reg_number: record.regNumber,
          gender: record.gender,
          class_id: record.currentClassId,
          school_id: record.schoolId,
          photo_url: remotePhotoUrl,
          guardian_name: record.guardianName,
          guardian_relation: record.guardianRelation,
          guardian_contact_1: record.guardianContact1,
          guardian_contact_2: record.guardianContact2,
          guardian_profession: record.guardianProfession,
          guardian_location: record.guardianLocation,
          created_at: record.createdAt
        });
        await db.learners.update(localId, { synced: true });
        savePrefix(String(form.regNumber));
        getNextRegNumber();
      }
      closeModal();
      // Trigger background sync immediately if online (handles any Blob uploads)
      if (navigator.onLine) {
        syncUnsyncedLearners().catch(err => console.warn('Failed to sync after register:', err));
      }
    } catch (err) {
      console.error(err);
      alert('Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExcelImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = new Uint8Array(ev.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const sheetData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        
        if (sheetData.length < 2) {
          alert("The Excel file seems to be empty or has no data rows below the header.");
          setImporting(false);
          return;
        }
        
        const headers = sheetData[0];
        const rows = sheetData.slice(1);
        
        const parsed = mapHeadersAndParse(headers, rows, user.schoolId, classes);
        
        if (parsed.length === 0) {
          alert("Could not extract any valid learner records from the Excel file.");
          setImporting(false);
          return;
        }

        const emptyNamesCount = parsed.filter(p => !p.fullName).length;
        if (emptyNamesCount === parsed.length) {
          if (!await window.confirm("Warning: We could not find a 'Name' column in your Excel. The first column will be treated as the Learner Name. Do you want to proceed?")) {
            setImporting(false);
            return;
          }
        }
        
        setImportData(parsed);
        setIsImportModalOpen(true);
      } catch (err) {
        console.error(err);
        alert("Failed to parse Excel file. Please make sure it is a valid .xlsx, .xls or .csv file.");
      } finally {
        setImporting(false);
        if (fileInputExcelRef.current) fileInputExcelRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleConfirmImport = async () => {
    setIsSaving(true);
    try {
      const recordsToInsert = [];
      let currentRegIndex = parseInt(localStorage.getItem(REG_KEY) || '0', 10);
      const prefix = getPrefix();
      
      const unassignedCount = importData.filter(d => !d.classId).length;
      if (unassignedCount > 0) {
        alert(`Please assign classes to all learners. There are ${unassignedCount} learners with unassigned classes.`);
        setIsSaving(false);
        return;
      }

      for (const d of importData) {
        let regNo = d.regNumber;
        if (!regNo) {
          currentRegIndex++;
          regNo = `${prefix}-${String(currentRegIndex).padStart(4, '0')}`;
        }

        recordsToInsert.push({
          fullName: d.fullName || 'Unnamed Learner',
          regNumber: String(regNo),
          gender: d.gender || 'Male',
          schoolId: user.schoolId,
          currentClassId: Number(d.classId),
          photo: null,
          guardianName: d.guardianName,
          guardianRelation: d.guardianRelation,
          guardianContact1: d.guardianContact1,
          guardianContact2: d.guardianContact2,
          guardianProfession: d.guardianProfession,
          guardianLocation: d.guardianLocation,
          synced: false,
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString()
        });
      }

      const localIds = [];
      await db.transaction('rw', db.learners, async () => {
        for (const rec of recordsToInsert) {
          const id = await db.learners.add(rec);
          localIds.push({ localId: id, record: rec });
        }
      });

      localStorage.setItem(REG_KEY, String(currentRegIndex));
      setIsImportModalOpen(false);
      setImportData([]);
      alert(`Successfully registered ${recordsToInsert.length} learners!`);

      const cloudRows = localIds.map(item => ({
        full_name: item.record.fullName,
        reg_number: item.record.regNumber,
        gender: item.record.gender,
        class_id: item.record.currentClassId,
        school_id: item.record.schoolId,
        photo_url: null,
        guardian_name: item.record.guardianName,
        guardian_relation: item.record.guardianRelation,
        guardian_contact_1: item.record.guardianContact1,
        guardian_contact_2: item.record.guardianContact2,
        guardian_profession: item.record.guardianProfession,
        guardian_location: item.record.guardianLocation,
        created_at: item.record.createdAt
      }));

      await enqueueSync('insert', 'report_learners', cloudRows);

      await db.transaction('rw', db.learners, async () => {
        for (const item of localIds) {
          await db.learners.update(item.localId, { synced: true });
        }
      });
    } catch (err) {
      console.error(err);
      alert('Import failed. Please check the Excel file and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const reconcileClassesAndSubjects = useCallback(async () => {
    if (!navigator.onLine || !user?.schoolId) return;
    try {
      console.log('Reconciling classes and subjects with Supabase...');
      
      // 1. Sync Classes
      const localClasses = await db.classes.where('schoolId').equals(user.schoolId).toArray();
      const { data: remoteClasses, error: classErr } = await supabase
        .from('report_classes')
        .select('*')
        .eq('school_id', user.schoolId);

      if (!classErr && remoteClasses) {
        for (const lc of localClasses) {
          let rc = remoteClasses.find(c => c.name.toLowerCase().trim() === lc.name.toLowerCase().trim());
          
          if (!rc) {
            const { data, error } = await supabase
              .from('report_classes')
              .insert([{ school_id: user.schoolId, name: lc.name }])
              .select()
              .single();
            if (!error && data) rc = data;
          }

          if (rc && rc.id !== lc.id) {
            const oldId = lc.id;
            const newId = rc.id;
            console.log(`Reconciling Class ID: ${lc.name} (Local: ${oldId} -> Supabase: ${newId})`);

            // Update all local learners referencing this class
            const relatedLearners = await db.learners.where('currentClassId').equals(oldId).toArray();
            for (const l of relatedLearners) {
              await db.learners.update(l.id, { currentClassId: newId, synced: false });
            }

            // Update all local scores referencing this class
            const relatedScores = await db.scores.where('classId').equals(oldId).toArray();
            for (const s of relatedScores) {
              await db.scores.update(s.id, { classId: newId });
            }

            // Update all local teacher assignments referencing this class
            const relatedAssigns = await db.teacherAssignments.where('classId').equals(oldId).toArray();
            for (const a of relatedAssigns) {
              await db.teacherAssignments.update(a.id, { classId: newId });
            }

            // Re-create the class record locally using the Supabase ID
            await db.classes.delete(oldId);
            await db.classes.put({
              id: newId,
              schoolId: user.schoolId,
              name: lc.name,
              createdAt: lc.createdAt || new Date().toISOString()
            });
          }
        }
      }

      // 2. Sync Subjects
      const localSubjects = await db.subjects.where('schoolId').equals(user.schoolId).toArray();
      const { data: remoteSubjects, error: subErr } = await supabase
        .from('report_subjects')
        .select('*')
        .eq('school_id', user.schoolId);

      if (!subErr && remoteSubjects) {
        for (const ls of localSubjects) {
          let rs = remoteSubjects.find(s => s.name.toLowerCase().trim() === ls.name.toLowerCase().trim());
          
          if (!rs) {
            const { data, error } = await supabase
              .from('report_subjects')
              .insert([{ school_id: user.schoolId, name: ls.name }])
              .select()
              .single();
            if (!error && data) rs = data;
          }

          if (rs && rs.id !== ls.id) {
            const oldId = ls.id;
            const newId = rs.id;
            console.log(`Reconciling Subject ID: ${ls.name} (Local: ${oldId} -> Supabase: ${newId})`);

            // Update all local scores referencing this subject
            const relatedScores = await db.scores.where('subjectId').equals(oldId).toArray();
            for (const s of relatedScores) {
              await db.scores.update(s.id, { subjectId: newId });
            }

            // Update all local teacher assignments referencing this subject
            const relatedAssigns = await db.teacherAssignments.where('subjectId').equals(oldId).toArray();
            for (const a of relatedAssigns) {
              await db.teacherAssignments.update(a.id, { subjectId: newId });
            }

            // Re-create the subject record locally using the Supabase ID
            await db.subjects.delete(oldId);
            await db.subjects.put({
              id: newId,
              schoolId: user.schoolId,
              name: ls.name,
              createdAt: ls.createdAt || new Date().toISOString()
            });
          }
        }
      }
      console.log('Finished reconciling classes and subjects!');
    } catch (err) {
      console.error('Failed to reconcile classes and subjects:', err);
    }
  }, [user]);

  const syncDeleted = useCallback(async () => {
    if (navigator.onLine) {
      const queue = JSON.parse(localStorage.getItem('pending_deleted_learners') || '[]');
      if (queue.length > 0) {
        try {
          const { error } = await supabase.from('report_learners').delete().in('id', queue);
          if (!error) {
            localStorage.removeItem('pending_deleted_learners');
            console.log('Successfully synced offline deletions!');
          } else {
            console.error('Failed to sync offline deletions:', error);
          }
        } catch (err) {
          console.error('Failed to sync offline deletions:', err);
        }
      }
    }
  }, []);

  const syncUnsyncedLearners = useCallback(async () => {
    if (navigator.onLine && user?.schoolId) {
      try {
        const unsynced = await db.learners.where('schoolId').equals(user.schoolId).filter(l => !l.synced).toArray();
        if (unsynced.length === 0) return;

        console.log(`Syncing ${unsynced.length} un-synced learners to the cloud...`);
        for (const l of unsynced) {
          // Upload local Blob photo to Supabase storage if present
          let remotePhotoUrl = l.photoUrl || null;
          const localPhoto = l.photo;
          const needsUpload = localPhoto instanceof Blob || (typeof localPhoto === 'string' && localPhoto.startsWith('data:'));

          if (needsUpload && !remotePhotoUrl) {
            try {
              const blob = localPhoto instanceof Blob ? localPhoto : await fetch(localPhoto).then(r => r.blob());
              const cleanReg = String(l.regNumber).replace(/[^a-zA-Z0-9]/g, '_');
              const path = `learners/${l.schoolId}_${cleanReg}_${Date.now()}.webp`;
              const { error: uploadError } = await supabase.storage.from('learner-photos').upload(path, blob, { upsert: true, contentType: 'image/webp' });
              if (!uploadError) {
                const { data } = supabase.storage.from('learner-photos').getPublicUrl(path);
                if (data?.publicUrl) {
                  remotePhotoUrl = data.publicUrl;
                  // Keep local Blob in photo field, store the URL in photoUrl for sync reference
                  await db.learners.update(l.id, { photoUrl: remotePhotoUrl });
                }
              }
            } catch (uploadErr) {
              console.warn('Failed to upload photo during sync:', uploadErr);
            }
          }

          // Use remotePhotoUrl (http) for cloud, never put a Blob into Supabase
          const photoUrl = remotePhotoUrl;

          let supabaseId = l.supabaseId;

          if (!supabaseId) {
            // Self-healing: Check if the learner already exists remotely by matching school_id and reg_number
            try {
              const { data: remoteRecord, error: checkErr } = await supabase
                .from('report_learners')
                .select('id')
                .eq('school_id', l.schoolId)
                .eq('reg_number', l.regNumber)
                .maybeSingle();
              
              if (!checkErr && remoteRecord) {
                supabaseId = remoteRecord.id;
                // Update local record with the found supabaseId so we don't have to look it up again
                await db.learners.update(l.id, { supabaseId });
                console.log(`[Sync] Self-healed learner ${l.fullName}: associated with existing remote ID ${supabaseId}`);
              }
            } catch (checkErr) {
              console.warn('Failed to perform self-healing check for learner:', checkErr);
            }
          }

          if (supabaseId) {
            // Update existing online record
            const { error } = await supabase.from('report_learners').update({
              full_name: l.fullName,
              reg_number: l.regNumber,
              gender: l.gender,
              class_id: l.currentClassId,
              photo_url: typeof photoUrl === 'string' && photoUrl.startsWith('http') ? photoUrl : null,
              guardian_name: l.guardianName,
              guardian_relation: l.guardianRelation,
              guardian_contact_1: l.guardianContact1,
              guardian_contact_2: l.guardianContact2,
              guardian_profession: l.guardianProfession,
              guardian_location: l.guardianLocation,
              updated_at: l.updatedAt || new Date().toISOString()
            }).eq('id', supabaseId);

            if (!error) {
              await db.learners.update(l.id, { photoUrl: remotePhotoUrl, synced: true });
            } else {
              console.error('Error syncing learner update:', error);
              
              // Self-healing: if update fails due to a unique key conflict (ghost student)
              if (error.code === '23505' || String(error.message).toLowerCase().includes('unique constraint') || String(error.message).toLowerCase().includes('duplicate key')) {
                console.log(`[Inline Sync] 🔄 Unique key conflict (23505) detected on update for learner ${l.fullName} with reg_number ${l.regNumber}. Attempting self-healing...`);
                
                try {
                  // 1. Query Supabase to find the duplicate student holding this registration number
                  const { data: duplicateLearner } = await supabase
                    .from('report_learners')
                    .select('id, full_name')
                    .eq('school_id', l.schoolId)
                    .eq('reg_number', l.regNumber)
                    .maybeSingle();
                    
                  if (duplicateLearner && duplicateLearner.id !== supabaseId) {
                    console.log(`[Inline Sync] Conflicting student found on Supabase: "${duplicateLearner.full_name}" (ID: ${duplicateLearner.id}). Checking if deleted locally...`);
                    
                    const existsLocally = await db.learners.where('supabaseId').equals(duplicateLearner.id).first();
                    
                    if (!existsLocally) {
                      // Conflicting student does NOT exist locally in Dexie (Ghost Student). Automatically purge!
                      console.log(`[Inline Sync] 🧹 Purging ghost student "${duplicateLearner.full_name}" from Supabase...`);
                      const { error: purgeErr } = await supabase
                        .from('report_learners')
                        .delete()
                        .eq('id', duplicateLearner.id);
                        
                      if (!purgeErr) {
                        console.log(`[Inline Sync] ✅ Purged ghost student. Retrying update...`);
                        
                        // Retry the update
                        const { error: retryErr } = await supabase.from('report_learners').update({
                          full_name: l.fullName,
                          reg_number: l.regNumber,
                          gender: l.gender,
                          class_id: l.currentClassId,
                          photo_url: typeof photoUrl === 'string' && photoUrl.startsWith('http') ? photoUrl : null,
                          guardian_name: l.guardianName,
                          guardian_relation: l.guardianRelation,
                          guardian_contact_1: l.guardianContact1,
                          guardian_contact_2: l.guardianContact2,
                          guardian_profession: l.guardianProfession,
                          guardian_location: l.guardianLocation,
                          updated_at: l.updatedAt || new Date().toISOString()
                        }).eq('id', supabaseId);
                        
                        if (!retryErr) {
                          await db.learners.update(l.id, { photoUrl: remotePhotoUrl, synced: true });
                          console.log(`[Inline Sync] ✅ Successfully self-healed and synced learner ${l.fullName}`);
                        } else {
                          console.error('[Inline Sync] Retry update failed:', retryErr);
                        }
                      } else {
                        console.error('[Inline Sync] Failed to purge ghost student:', purgeErr);
                      }
                    } else {
                      console.log(`[Inline Sync] Conflicting student exists locally. Legitimate duplicate.`);
                    }
                  }
                } catch (reconcileErr) {
                  console.error('[Inline Sync] Self-healing failed:', reconcileErr);
                }
              }
            }
          } else {
            // Insert new record online
            const { data, error } = await supabase.from('report_learners').insert([{
              full_name: l.fullName,
              reg_number: l.regNumber,
              gender: l.gender,
              class_id: l.currentClassId,
              school_id: l.schoolId,
              photo_url: typeof photoUrl === 'string' && photoUrl.startsWith('http') ? photoUrl : null,
              guardian_name: l.guardianName,
              guardian_relation: l.guardianRelation,
              guardian_contact_1: l.guardianContact1,
              guardian_contact_2: l.guardianContact2,
              guardian_profession: l.guardianProfession,
              guardian_location: l.guardianLocation,
              created_at: l.createdAt || new Date().toISOString()
            }]).select().single();

            if (!error && data) {
              await db.learners.update(l.id, { supabaseId: data.id, photoUrl: remotePhotoUrl, synced: true });
            } else if (error) {
              console.error('Error syncing learner insert:', error);
            }
          }
        }
        console.log('Finished syncing un-synced learners!');
      } catch (err) {
        console.error('Failed to sync un-synced learners:', err);
      }
    }
  }, [user]);

  const syncAll = useCallback(async () => {
    await reconcileClassesAndSubjects();
    await syncDeleted();
    await syncUnsyncedLearners();
  }, [reconcileClassesAndSubjects, syncDeleted, syncUnsyncedLearners]);

  useEffect(() => {
    syncAll();

    const handleOnline = () => {
      syncAll();
    };
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [user, syncAll]);

  const openReassignModal = () => {
    setReassignPrefix(getPrefix());
    setReassignStartNum('1');
    setReassignStatus('');
    setIsReassigning(false);
    setIsReassignModalOpen(true);
  };

  const handleReassignRegNumbers = async (e) => {
    e.preventDefault();
    if (!navigator.onLine) {
      alert('An active internet connection is required to reassign registration numbers to avoid unique key conflicts on the cloud.');
      return;
    }

    if (!filtered || filtered.length === 0) {
      alert('No learners displayed to reassign.');
      return;
    }

    const startNum = parseInt(reassignStartNum, 10);
    if (isNaN(startNum) || startNum < 1) {
      alert('Please enter a valid starting number (minimum 1).');
      return;
    }

    const prefix = reassignPrefix.trim().toUpperCase();
    if (!prefix) {
      alert('Please enter a valid registration prefix.');
      return;
    }

    const confirmMsg = `Are you sure you want to sequentially reassign registration numbers to all ${filtered.length} currently displayed learners in their alphabetical name order?\n\nThis will modify records locally and immediately sync updates to the cloud.`;
    if (!window.confirm(confirmMsg)) return;

    setIsReassigning(true);
    setReassignStatus('Step 1 of 3: Releasing current registration numbers in local database...');

    try {
      const timestamp = Date.now();
      const listToReassign = [...filtered];

      // Pass 1: Make them unique with temporary suffix locally so Supabase doesn't conflict
      for (let i = 0; i < listToReassign.length; i++) {
        const learner = listToReassign[i];
        const tempReg = `${learner.regNumber}_TEMP_${timestamp}_${i}`;
        
        await db.learners.update(learner.id, {
          regNumber: tempReg,
          synced: false
        });
      }

      setReassignStatus('Step 2 of 3: Syncing temporary releases to the cloud...');
      if (navigator.onLine) {
        await syncUnsyncedLearners();
      }

      setReassignStatus('Step 3 of 3: Assigning new sequential registration numbers alphabetically...');
      for (let i = 0; i < listToReassign.length; i++) {
        const learner = listToReassign[i];
        const nextNum = startNum + i;
        const padNum = String(nextNum).padStart(4, '0');
        const finalReg = `${prefix}-${padNum}`;

        await db.learners.update(learner.id, {
          regNumber: finalReg,
          synced: false,
          updatedAt: new Date().toISOString()
        });

        // If the learner has a supabaseId, queue standard updates to ensure outbox consistency
        if (learner.supabaseId) {
          await enqueueSync('update', 'report_learners', {
            filter: { id: learner.supabaseId },
            data: {
              reg_number: finalReg,
              updated_at: new Date().toISOString()
            }
          }, user.schoolId);
        }
      }

      setReassignStatus('Finalizing: Syncing new alphabetical registration numbers to cloud...');
      
      const maxAssignedNum = startNum + listToReassign.length - 1;
      localStorage.setItem(REG_KEY, String(maxAssignedNum));
      localStorage.setItem(PREFIX_KEY, prefix);

      if (navigator.onLine) {
        await syncUnsyncedLearners();
      }

      alert(`Successfully reassigned registration numbers to ${listToReassign.length} learners!`);
      setIsReassignModalOpen(false);
    } catch (err) {
      console.error('Error during registration number reassignment:', err);
      alert('An error occurred during reassignment: ' + err.message);
    } finally {
      setIsReassigning(false);
      setReassignStatus('');
    }
  };

  const handleDeleteLearner = async (l) => {
    const warningMessage = 
      `🚨 PERMANENT ACADEMIC ERASURE!\n\n` +
      `Are you sure you want to absolutely delete ${l.fullName}?\n` +
      `This is a complete database purge and CANNOT be undone.\n\n` +
      `🔴 THIS WILL PERMANENTLY ERASE:\n` +
      `   • Official Student Profile & Registry\n` +
      `   • All Academic Scores & Grades across all terms/years\n` +
      `   • All Terminal Report Cards & Advisory Remarks\n` +
      `   • All School Fees & Financial Billings\n\n` +
      `Both the local computer cache and cloud server will be wiped forever.\n\n` +
      `Are you absolutely sure you want to proceed?`;

    if (!await window.confirm(warningMessage)) return;
    
    try {
      // 1. Clean up any pending outbox mutations for this learner to avoid ghost insertions
      const pendingItems = await db.outbox.toArray();
      for (const item of pendingItems) {
        if (item.table === 'report_learners' || item.table === 'report_scores' || item.table === 'report_summaries') {
          try {
            const payload = JSON.parse(item.payload);
            
            if (item.table === 'report_scores' && item.operation === 'delete_insert') {
              // Handle array-based score insertions (delete_insert)
              if (Array.isArray(payload.insertData)) {
                const initialLength = payload.insertData.length;
                
                // Filter out the deleted student's scores
                payload.insertData = payload.insertData.filter(row => {
                  const sLearnerId = String(row.learner_id || row.learnerId || '');
                  return sLearnerId !== String(l.id) && (!l.supabaseId || sLearnerId !== String(l.supabaseId));
                });
                
                if (payload.insertData.length === 0) {
                  // If no scores left for other students, delete the entire outbox item
                  await db.outbox.delete(item.id);
                  console.log(`[Absolute Delete] Purged empty outbox scores item ${item.id} for ${l.fullName}`);
                } else if (payload.insertData.length < initialLength) {
                  // If some scores were removed, update the outbox item with the filtered array
                  await db.outbox.update(item.id, { payload: JSON.stringify(payload) });
                  console.log(`[Absolute Delete] Filtered out deleted student's scores from outbox item ${item.id} for ${l.fullName}`);
                }
              }
            } else {
              // Handle standard object-based payloads
              const pData = payload.data || payload;
              const matchesId = String(pData.learnerId || pData.learner_id || pData.id) === String(l.id) || 
                                String(pData.learnerId || pData.learner_id || pData.id) === String(l.supabaseId);
              
              if (matchesId) {
                await db.outbox.delete(item.id);
                console.log(`[Absolute Delete] Cancelled pending outbox operation "${item.operation}" for learner ${l.fullName}`);
              }
            }
          } catch (e) {
            console.warn('Failed to inspect/delete outbox item:', e);
          }
        }
      }

      // 2. Enqueue the deletion in both sync systems for robust success (online & offline)
      if (l.supabaseId) {
        // Enqueue cascade deletes on cloud just in case foreign keys cascade isn't fully active
        await enqueueSync('delete', 'report_scores', {
          filter: { learner_id: l.supabaseId, school_id: user.schoolId }
        }, user.schoolId);

        await enqueueSync('delete', 'report_summaries', {
          filter: { learner_id: l.supabaseId, school_id: user.schoolId }
        }, user.schoolId);

        await enqueueSync('delete', 'report_learners', {
          filter: { id: l.supabaseId, school_id: user.schoolId }
        }, user.schoolId);
        
        // Also queue in the inline custom deletion array as backup
        const deletedQueue = JSON.parse(localStorage.getItem('pending_deleted_learners') || '[]');
        if (!deletedQueue.includes(l.supabaseId)) {
          deletedQueue.push(l.supabaseId);
          localStorage.setItem('pending_deleted_learners', JSON.stringify(deletedQueue));
        }
      } else if (l.regNumber) {
        // Safe-heal fallback: delete by registration number if supabaseId is missing locally
        await enqueueSync('delete', 'report_learners', {
          filter: { reg_number: l.regNumber, school_id: user.schoolId }
        }, user.schoolId);
      }
      
      // 3. Absolute delete locally in Dexie (scores, summaries, and profile) in a transaction
      await db.transaction('rw', [db.learners, db.scores, db.reportSummaries], async () => {
        // Purge local scores
        await db.scores
          .filter(s => String(s.learnerId) === String(l.id) || (l.supabaseId && String(s.learnerId) === String(l.supabaseId)))
          .delete();

        // Purge local summaries
        await db.reportSummaries
          .filter(s => String(s.learnerId) === String(l.id) || (l.supabaseId && String(s.learnerId) === String(l.supabaseId)))
          .delete();

        // Purge local learner profile
        await db.learners.delete(l.id);
      });

      console.log(`[Absolute Delete] Successfully completed database purge locally and enqueued cloud deletes for ${l.fullName}`);
      
      if (profileLearner && profileLearner.id === l.id) {
        setProfileLearner(null);
      }
    } catch (err) {
      console.error('Error executing absolute delete:', err);
      alert('Failed to execute absolute delete: ' + err.message);
    }
  };

  const filtered = learners
    ?.filter(l => {
      const matchSearch = l.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) || String(l.regNumber || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchClass = selectedClass === 'alumni' 
        ? l.status === 'Alumni'
        : selectedClass === '' 
          ? (l.status !== 'Alumni' && l.status !== 'Graduated')
          : (String(l.currentClassId) === String(selectedClass) && l.status !== 'Alumni' && l.status !== 'Graduated');
      return matchSearch && matchClass;
    })
    .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));

  const getClass = id => classes?.find(c => c.id === id)?.name || 'Unassigned';

  return (
    <Layout title="Learner Management">
      <style>{`
        .reg-modal-backdrop{position:fixed;inset:0;background:rgba(15,23,42,0.6);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:200;padding:1rem;overflow-y:auto;}
        .reg-modal{background:#fff;border-radius:20px;width:100%;max-width:580px;box-shadow:0 25px 60px rgba(0,0,0,0.2);animation:modalIn .25s cubic-bezier(.34,1.56,.64,1) both;margin:auto;}
        @keyframes modalIn{from{opacity:0;transform:scale(.94) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}
        .reg-modal-header{padding:1.5rem 1.5rem 0;display:flex;justify-content:space-between;align-items:center;}
        .reg-modal-body{padding:1.25rem 1.5rem 1.5rem;}
        .photo-zone{border:2px dashed #cbd5e1;border-radius:14px;padding:1.5rem;text-align:center;cursor:pointer;transition:all .2s;background:#f8fafc;}
        .photo-zone:hover{border-color:#0d9488;background:#f0fdfa;}
        .mode-pill{display:flex;background:#f1f5f9;border-radius:999px;padding:3px;gap:3px;margin-bottom:1rem;width:fit-content;}
        .mode-btn{padding:.35rem .9rem;border-radius:999px;border:none;cursor:pointer;font-size:.8rem;font-weight:600;font-family:inherit;transition:all .2s;background:transparent;color:#64748b;}
        .mode-btn.active{background:#fff;color:#0d9488;box-shadow:0 1px 4px rgba(0,0,0,.1);}
        .field-label{display:block;font-size:.78rem;font-weight:600;color:#475569;margin-bottom:.4rem;letter-spacing:.02em;text-transform:uppercase;}
        .field-input{width:100%;padding:.7rem 1rem;border:1.5px solid #e2e8f0;border-radius:10px;font-size:.95rem;font-family:inherit;color:#0f172a;background:#fff;outline:none;transition:border-color .2s,box-shadow .2s;}
        .field-input:focus{border-color:#0d9488;box-shadow:0 0 0 3px rgba(13,148,136,.12);}
        .field-row{display:grid;grid-template-columns:1fr 1fr;gap:1rem;}
        @media(max-width:480px){.field-row{grid-template-columns:1fr;}.reg-modal-header{padding:1rem 1rem 0;}.reg-modal-body{padding:1rem;}}
        .reg-btn-primary{width:100%;padding:.85rem;background:linear-gradient(135deg,#0d9488,#0f766e);color:#fff;border:none;border-radius:12px;font-size:1rem;font-weight:700;font-family:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:.5rem;transition:opacity .2s,transform .15s;}
        .reg-btn-primary:hover:not(:disabled){opacity:.92;transform:translateY(-1px);}
        .reg-btn-primary:disabled{opacity:.6;cursor:not-allowed;}
        .reg-btn-ghost{width:100%;padding:.85rem;background:#f1f5f9;color:#64748b;border:none;border-radius:12px;font-size:.95rem;font-weight:600;font-family:inherit;cursor:pointer;transition:background .2s;}
        .reg-btn-ghost:hover{background:#e2e8f0;}
        .sync-chip{display:inline-flex;align-items:center;gap:6px;padding:.35rem .75rem;border-radius:999px;font-size:.75rem;font-weight:600;}
        .sync-online{background:rgba(16,185,129,.1);color:#059669;}
        .sync-offline{background:rgba(245,158,11,.1);color:#d97706;}
        .photo-preview-wrap{display:flex;flex-direction:column;align-items:center;gap:.75rem;}
        .photo-avatar{width:100px;height:100px;border-radius:50%;object-fit:cover;border:3px solid #0d9488;box-shadow:0 4px 14px rgba(13,148,136,.25);}
        .gen-btn{position:absolute;right:8px;top:50%;transform:translateY(-50%);padding:.3rem .65rem;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;font-size:.72rem;font-weight:600;cursor:pointer;font-family:inherit;color:#475569;white-space:nowrap;}
        .gen-btn:hover{background:#e2e8f0;}
        .learners-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.25rem; }
        .learner-card { background: #fff; border-radius: 20px; padding: 1.25rem; display: flex; flex-direction: column; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 4px 15px rgba(0,0,0,0.03); border: 1px solid rgba(226, 232, 240, 0.8); position: relative; overflow: hidden; }
        .learner-card::before { content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 4px; background: linear-gradient(90deg, #0d9488, #3b82f6); opacity: 0; transition: opacity 0.3s; }
        .learner-card:hover { transform: translateY(-4px); box-shadow: 0 20px 40px rgba(0,0,0,0.08); border-color: rgba(13, 148, 136, 0.3); }
        .learner-card:hover::before { opacity: 1; }
        .lc-header { display: flex; gap: 1rem; align-items: center; margin-bottom: 1.25rem; }
        .lc-photo { width: 56px; height: 56px; border-radius: 16px; object-fit: cover; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
        .lc-photo-placeholder { width: 56px; height: 56px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 1.4rem; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
        .lc-name { font-weight: 700; color: #0f172a; font-size: 1.05rem; margin-bottom: 0.2rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .lc-reg { font-size: 0.72rem; background: rgba(13, 148, 136, 0.1); color: #0d9488; padding: 0.2rem 0.5rem; border-radius: 6px; font-weight: 700; display: inline-block; letter-spacing: 0.03em; }
        .lc-details { display: flex; justify-content: space-between; align-items: center; padding: 0.85rem 1rem; background: #f8fafc; border-radius: 12px; margin-bottom: 1.25rem; border: 1px solid #f1f5f9; }
        .lc-detail-item { display: flex; flex-direction: column; gap: 4px; }
        .lc-detail-lbl { font-size: 0.65rem; color: #94a3b8; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; }
        .lc-detail-val { font-size: 0.85rem; color: #1e293b; font-weight: 600; display: flex; align-items: center; gap: 6px; }
        .lc-actions { display: flex; gap: 0.5rem; margin-top: auto; flex-wrap: wrap; }
        .lc-btn { padding: 0.7rem; border-radius: 12px; font-size: 0.8rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.2s; border: none; font-family: inherit; }
        .lc-btn-view { flex: 1 1 100%; background: rgba(13, 148, 136, 0.08); color: #0d9488; }
        .lc-btn-view:hover { background: #0d9488; color: #fff; box-shadow: 0 4px 12px rgba(13, 148, 136, 0.2); }
        .lc-btn-edit { flex: 1 1 calc(50% - 0.25rem); background: rgba(245, 158, 11, 0.1); color: #d97706; }
        .lc-btn-edit:hover { background: #f59e0b; color: #fff; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.2); }
        .lc-btn-delete { flex: 1 1 calc(50% - 0.25rem); background: rgba(239, 68, 68, 0.08); color: #ef4444; }
        .lc-btn-delete:hover { background: #ef4444; color: #fff; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2); }

        /* Learner Profile Modal Styles */
        .profile-modal-backdrop { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.65); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 200; padding: 1rem; overflow-y: auto; }
        .profile-modal { background: #fff; border-radius: 24px; width: 100%; max-width: 440px; box-shadow: 0 25px 60px rgba(15, 23, 42, 0.18); animation: profileModalIn .3s cubic-bezier(.34, 1.56, .64, 1) both; overflow: hidden; border: 1px solid rgba(226, 232, 240, 0.8); margin: auto; position: relative; }
        @keyframes profileModalIn { from { opacity: 0; transform: scale(.92) translateY(30px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        
        .profile-header-grad { height: 110px; position: relative; padding: 1rem 1.5rem; display: flex; justify-content: flex-end; align-items: flex-start; }
        .profile-header-grad.male { background: linear-gradient(135deg, #0d9488, #3b82f6); }
        .profile-header-grad.female { background: linear-gradient(135deg, #0d9488, #ec4899); }
        
        .profile-close-btn { background: rgba(255, 255, 255, 0.25); border: none; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 0.95rem; color: #fff; display: flex; align-items: center; justify-content: center; transition: all 0.2s; backdrop-filter: blur(4px); }
        .profile-close-btn:hover { background: rgba(255, 255, 255, 0.4); transform: rotate(90deg); }
        
        .profile-body { padding: 0 1.5rem 1.5rem; display: flex; flex-direction: column; align-items: center; }
        
        .profile-avatar-container { margin-top: -55px; margin-bottom: 0.75rem; position: relative; }
        .profile-avatar-img { width: 110px; height: 110px; border-radius: 50%; object-fit: cover; border: 4px solid #fff; box-shadow: 0 8px 20px rgba(15, 23, 42, 0.12); background: #fff; }
        .profile-avatar-placeholder { width: 110px; height: 110px; border-radius: 50%; border: 4px solid #fff; box-shadow: 0 8px 20px rgba(15, 23, 42, 0.12); display: flex; align-items: center; justify-content: center; font-size: 2.5rem; }
        .profile-avatar-placeholder.male { background: #eff6ff; color: #3b82f6; }
        .profile-avatar-placeholder.female { background: #fdf2f8; color: #ec4899; }
        
        .profile-name { font-size: 1.35rem; font-weight: 800; color: #0f172a; text-align: center; margin: 0 0 0.25rem 0; letter-spacing: -0.01em; }
        .profile-reg-badge { font-size: 0.75rem; font-weight: 700; color: #0d9488; background: rgba(13, 148, 136, 0.08); padding: 0.25rem 0.75rem; border-radius: 999px; display: inline-flex; align-items: center; gap: 6px; border: 1px solid rgba(13, 148, 136, 0.12); }
        
        .profile-tabs { display: flex; background: #f1f5f9; border-radius: 14px; padding: 4px; gap: 4px; margin: 1.25rem 0 1rem; width: 100%; }
        .profile-tab-btn { flex: 1; padding: 0.55rem; border-radius: 10px; border: none; cursor: pointer; font-size: 0.82rem; font-weight: 700; font-family: inherit; transition: all 0.2s; background: transparent; color: #64748b; text-align: center; }
        .profile-tab-btn.active { background: #fff; color: #0d9488; box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06); }
        
        .profile-content { width: 100%; min-height: 140px; }
        
        .profile-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; width: 100%; }
        .profile-info-card { background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 14px; padding: 0.75rem 1rem; display: flex; flex-direction: column; gap: 4px; }
        .profile-info-label { font-size: 0.65rem; color: #94a3b8; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; }
        .profile-info-value { font-size: 0.85rem; color: #1e293b; font-weight: 600; display: flex; align-items: center; gap: 6px; }
        
        .academic-stats { display: flex; flex-direction: column; gap: 0.75rem; width: 100%; }
        .stat-bar-container { display: flex; flex-direction: column; gap: 4px; }
        .stat-bar-header { display: flex; justify-content: space-between; font-size: 0.75rem; font-weight: 600; color: #475569; }
        .stat-bar-outer { width: 100%; height: 8px; background: #e2e8f0; border-radius: 999px; overflow: hidden; }
        .stat-bar-inner { height: 100%; background: linear-gradient(90deg, #0d9488, #10b981); border-radius: 999px; }
        
        .badge-pill { display: inline-flex; align-items: center; gap: 6px; padding: 0.25rem 0.6rem; border-radius: 6px; font-size: 0.75rem; font-weight: 700; width: fit-content; }
        .badge-pill-success { background: rgba(16, 185, 129, 0.1); color: #059669; }
        .badge-pill-warning { background: rgba(245, 158, 11, 0.1); color: #d97706; }
        
        .profile-actions { display: grid; grid-template-columns: 1fr auto; gap: 0.75rem; width: 100%; margin-top: 1.25rem; border-top: 1px solid #f1f5f9; padding-top: 1.25rem; }
        .profile-btn { padding: 0.75rem 1rem; border-radius: 12px; font-size: 0.85rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s; border: none; font-family: inherit; }
        .profile-btn-primary { background: linear-gradient(135deg, #0d9488, #0f766e); color: #fff; box-shadow: 0 4px 12px rgba(13, 148, 136, 0.15); flex: 1; }
        .profile-btn-primary:hover { opacity: 0.95; transform: translateY(-1px); }
        .profile-btn-secondary { background: #f1f5f9; color: #475569; }
        .profile-btn-secondary:hover { background: #e2e8f0; color: #0f172a; }

        .import-modal-backdrop{position:fixed;inset:0;background:rgba(15,23,42,0.65);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;z-index:200;padding:1rem;}
        .import-modal{background:#fff;border-radius:24px;width:100%;max-width:920px;box-shadow:0 25px 60px rgba(0,0,0,0.25);animation:modalIn .25s cubic-bezier(.34,1.56,.64,1) both;display:flex;flex-direction:column;max-height:90vh;}
        .import-modal-header{padding:1.5rem 1.5rem 1rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #f1f5f9;}
        .import-modal-body{padding:1.5rem;overflow-y:auto;flex:1;}
        .import-modal-footer{padding:1.25rem 1.5rem;display:flex;justify-content:flex-end;gap:.75rem;border-top:1px solid #f1f5f9;background:#f8fafc;border-bottom-left-radius:24px;border-bottom-right-radius:24px;}
        
        .import-table{width:100%;border-collapse:collapse;text-align:left;font-size:.9rem;}
        .import-table th{background:#f8fafc;padding:.75rem 1rem;font-weight:700;color:#475569;border-bottom:2px solid #e2e8f0;font-size:.78rem;text-transform:uppercase;letter-spacing:.03em;}
        .import-table td{padding:.65rem 1rem;border-bottom:1px solid #e2e8f0;vertical-align:middle;}
        .import-table tr:hover{background:#f8fafc;}
        
        .import-input{width:100%;padding:.45rem .75rem;border:1.5px solid #e2e8f0;border-radius:8px;font-size:.85rem;outline:none;transition:border-color .2s;}
        .import-input:focus{border-color:#0d9488;}
        .import-input.warning{border-color:#f59e0b;background:#fffbeb;}
        
        .import-select{padding:.45rem .75rem;border:1.5px solid #e2e8f0;border-radius:8px;font-size:.85rem;outline:none;background:#fff;width:100%;}
        .import-select:focus{border-color:#0d9488;}
        .import-select.warning{border-color:#f59e0b;background:#fffbeb;color:#d97706;font-weight:600;}
        
        .stat-badge{display:inline-flex;align-items:center;gap:6px;padding:.35rem .75rem;border-radius:10px;font-size:.75rem;font-weight:700;}
        .stat-badge-total{background:#f1f5f9;color:#475569;}
        .stat-badge-warning{background:#fffbeb;color:#d97706;border:1px solid #fef3c7;}
        .stat-badge-valid{background:#f0fdfa;color:#0d9488;border:1px solid #ccfbf1;}
      `}</style>

      {/* Page Header */}
      <div className="page-header" style={{ flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '.75rem', flex: 1, minWidth: 300, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '2 1 200px' }}>
            <i className="fas fa-search" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '.9rem' }}></i>
            <input type="text" className="form-input" style={{ paddingLeft: '2.75rem', height: 44, borderRadius: 12, border: '1.5px solid #e2e8f0', width: '100%', fontSize: '.95rem' }} placeholder="Search learners..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <div style={{ position: 'relative', flex: '1 1 150px' }}>
            <select className="form-input" style={{ height: 44, borderRadius: 12, border: '1.5px solid #e2e8f0', appearance: 'none', paddingRight: '2rem', width: '100%', fontSize: '.95rem', background: '#fff' }} value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
              <option value="">All Classes (Active)</option>
              {classes?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="alumni">Graduated (Alumni)</option>
            </select>
            <i className="fas fa-chevron-down" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none', fontSize: '.8rem' }}></i>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <button 
            className="btn" 
            onClick={() => fileInputExcelRef.current?.click()} 
            disabled={importing}
            style={{ 
              borderRadius: 12, 
              padding: '0 1.25rem', 
              height: 44, 
              display: 'flex', 
              alignItems: 'center', 
              gap: '.5rem', 
              fontWeight: 700, 
              background: '#0d9488',
              color: '#fff',
              border: 'none',
              boxShadow: '0 4px 12px rgba(13,148,136,.15)', 
              whiteSpace: 'nowrap',
              cursor: 'pointer'
            }}
          >
            {importing ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-file-excel"></i>}
            <span>{importing ? 'Processing…' : 'Import Excel'}</span>
          </button>
          
          <input 
            ref={fileInputExcelRef}
            type="file" 
            accept=".xlsx, .xls, .csv" 
            style={{ display: 'none' }} 
            onChange={handleExcelImport} 
          />

          <button 
            type="button" 
            className="btn" 
            onClick={openReassignModal} 
            style={{ 
              borderRadius: 12, 
              padding: '0 1.25rem', 
              height: 44, 
              display: 'flex', 
              alignItems: 'center', 
              gap: '.5rem', 
              fontWeight: 700, 
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              boxShadow: '0 4px 12px rgba(59,130,246,.15)', 
              whiteSpace: 'nowrap',
              cursor: 'pointer'
            }}
          >
            <i className="fas fa-sort-numeric-down"></i><span>Reassign Numbers</span>
          </button>

          <button className="btn btn-accent" onClick={openModal} style={{ borderRadius: 12, padding: '0 1.25rem', height: 44, display: 'flex', alignItems: 'center', gap: '.5rem', fontWeight: 700, boxShadow: '0 4px 12px rgba(13,148,136,.2)', whiteSpace: 'nowrap' }}>
            <i className="fas fa-user-plus"></i><span>Register Learner</span>
          </button>
        </div>
      </div>

      <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '.85rem', color: '#64748b', fontWeight: 500 }}>
          Showing <strong style={{ color: '#0f172a' }}>{filtered?.length ?? 0}</strong> learner{filtered?.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* ── Cards Grid ── */}
      {filtered?.length > 0 ? (
        <div className="learners-grid">
          {filtered.map(l => (
            <div key={l.id} className="learner-card">
              <div className="lc-header">
                <div className="lc-photo-wrap">
                  <LearnerPhoto
                    photo={l.photo || l.photoUrl || null}
                    alt={l.fullName}
                    className="lc-photo"
                    style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="lc-name" title={l.fullName}>{l.fullName}</div>
                  <div className="lc-reg">{l.regNumber}</div>
                </div>
              </div>

              <div className="lc-details">
                <div className="lc-detail-item">
                  <span className="lc-detail-lbl">Class</span>
                  <span className="lc-detail-val">
                    <i className="fas fa-chalkboard" style={{ color: '#0d9488', fontSize: '.75rem' }}></i>
                    {getClass(l.currentClassId)}
                  </span>
                </div>
                <div className="lc-detail-item" style={{ alignItems: 'flex-end' }}>
                  <span className="lc-detail-lbl">Gender</span>
                  <span className="lc-detail-val">
                    {l.gender === 'Female' ? <i className="fas fa-venus" style={{ color: '#ec4899', fontSize: '.8rem' }}></i> : <i className="fas fa-mars" style={{ color: '#3b82f6', fontSize: '.8rem' }}></i>}
                    {l.gender}
                  </span>
                </div>
              </div>

              <div className="lc-actions">
                <button 
                  className="lc-btn lc-btn-view" 
                  title="View Profile" 
                  onClick={() => {
                    setProfileLearner(l);
                    setProfileTab('personal');
                  }}
                >
                  <i className="fas fa-eye"></i> View Profile
                </button>
                <button className="lc-btn lc-btn-edit" title="Edit details" onClick={() => openEditModal(l)}>
                  <i className="fas fa-edit"></i> Edit
                </button>
                <button className="lc-btn lc-btn-delete" title="Delete Learner" onClick={() => handleDeleteLearner(l)}>
                  <i className="fas fa-trash-alt"></i> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px dashed #cbd5e1', borderRadius: 20, padding: '4rem 2rem', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, background: '#f1f5f9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
            <i className="fas fa-user-slash" style={{ fontSize: '1.5rem', color: '#94a3b8' }}></i>
          </div>
          <h3 style={{ margin: '0 0 .5rem', color: '#0f172a', fontSize: '1.1rem' }}>No learners found</h3>
          <p style={{ margin: 0, color: '#64748b', fontSize: '.85rem' }}>
            {searchTerm || selectedClass ? 'Try adjusting your search or filter criteria.' : 'Register a learner to get started.'}
          </p>
        </div>
      )}

      {/* ── Registration Modal ───────────────────────────────────────── */}
      {isModalOpen && (
        <div className="reg-modal-backdrop" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="reg-modal">
            {/* Header */}
            <div className="reg-modal-header">
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, background: 'rgba(13,148,136,.1)', borderRadius: 10, marginRight: 10 }}>
                    <i className={editingId ? "fas fa-edit" : "fas fa-user-plus"} style={{ color: '#0d9488', fontSize: '.9rem' }}></i>
                  </span>
                  {editingId ? 'Edit Learner' : 'Register Learner'}
                </h2>
                <p style={{ margin: '4px 0 0 46px', fontSize: '.8rem', color: '#94a3b8' }}>
                  {editingId ? 'Modify the details of this learner.' : 'Fill in the details below to enrol a new learner.'}
                </p>
              </div>
              <button onClick={closeModal} style={{ background: '#f1f5f9', border: 'none', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: '1rem', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="reg-modal-body">
              <form onSubmit={handleRegister}>

                {/* ── Photo ── */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <label className="field-label"><i className="fas fa-camera" style={{ marginRight: 5 }}></i>Learner Photo</label>
                  <div className="mode-pill">
                    {[['upload','fa-upload','Upload'],['camera','fa-camera','Live Camera']].map(([m, ic, lbl]) => (
                      <button key={m} type="button" className={`mode-btn${photoMode===m?' active':''}`} onClick={async () => {
                        setPhotoMode(m); setPhotoPreview(null);
                        if (m === 'camera') {
                          const devs = await loadCameras();
                          setCameras(devs);
                          await startCameraDevice(devs[0]?.deviceId, 0, devs);
                        } else {
                          stopCamera();
                        }
                      }}>
                        <i className={`fas ${ic}`} style={{ marginRight: 4 }}></i>{lbl}
                      </button>
                    ))}
                  </div>

                  {photoPreview ? (
                    <div className="photo-preview-wrap">
                      <LearnerPhoto photo={photoPreview} alt="preview" className="photo-avatar" style={{ width: 100, height: 100, borderRadius: '50%', objectFit: 'cover', border: '3px solid #0d9488', boxShadow: '0 4px 14px rgba(13,148,136,.25)' }} />
                      <button type="button" onClick={() => { setPhotoPreview(null); setPhotoPreviewUrl(null); stopCamera(); }} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '.78rem', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                        <i className="fas fa-redo" style={{ marginRight: 4 }}></i>Retake / Change
                      </button>
                    </div>
                  ) : photoMode === 'camera' ? (
                    <div style={{ textAlign: 'center' }}>
                      {/* Camera viewport */}
                      <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', border: '2px solid #e2e8f0', background: '#000', maxWidth: 300, margin: '0 auto' }}>
                        <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', display: 'block', maxHeight: 200, objectFit: 'cover' }} />
                        {!cameraActive && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><i className="fas fa-circle-notch fa-spin" style={{ fontSize: '1.5rem', opacity: .6 }}></i></div>}
                        {/* Camera label badge */}
                        {cameraActive && cameras.length > 0 && (
                          <div style={{ position: 'absolute', bottom: 8, left: 8, background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: '.7rem', padding: '2px 8px', borderRadius: 999, backdropFilter: 'blur(4px)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <i className="fas fa-video" style={{ marginRight: 4 }}></i>
                            {cameras[activeCamIdx]?.label || `Camera ${activeCamIdx + 1}`}
                          </div>
                        )}
                      </div>
                      <canvas ref={canvasRef} style={{ display: 'none' }} />
                      {/* Camera controls row */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem', marginTop: '.75rem', flexWrap: 'wrap' }}>
                        {/* Switch prev */}
                        {cameras.length > 1 && (
                          <button type="button" onClick={() => switchCamera(-1)} title="Previous camera"
                            style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '50%', width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
                            <i className="fas fa-chevron-left"></i>
                          </button>
                        )}
                        {cameraActive && (
                          <button type="button" className="btn btn-accent" onClick={capturePhoto} style={{ padding: '.5rem 1.25rem' }}>
                            <i className="fas fa-camera"></i> Capture
                          </button>
                        )}
                        {/* Switch next */}
                        {cameras.length > 1 && (
                          <button type="button" onClick={() => switchCamera(1)} title="Next camera"
                            style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '50%', width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
                            <i className="fas fa-chevron-right"></i>
                          </button>
                        )}
                      </div>
                      {/* Camera count indicator */}
                      {cameras.length > 1 && (
                        <div style={{ marginTop: '.4rem', fontSize: '.72rem', color: '#94a3b8' }}>
                          Camera {activeCamIdx + 1} of {cameras.length} — use arrows to switch
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="photo-zone" onClick={() => fileInputRef.current?.click()}>
                      <i className="fas fa-cloud-upload-alt" style={{ fontSize: '2rem', color: '#0d9488', display: 'block', marginBottom: '.5rem' }}></i>
                      <p style={{ margin: 0, fontSize: '.85rem', color: '#64748b', fontWeight: 500 }}>Click to upload a photo</p>
                      <p style={{ margin: '4px 0 0', fontSize: '.72rem', color: '#94a3b8' }}>JPG, PNG or WEBP</p>
                      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} />
                    </div>
                  )}
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid #f1f5f9', margin: '1rem 0' }} />

                {/* ── Full Name ── */}
                <div style={{ marginBottom: '1rem' }}>
                  <label className="field-label">Full Name <span style={{ color: '#ef4444' }}>*</span></label>
                  <input type="text" className="field-input" required placeholder="e.g. Ama Mensah" value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} />
                </div>

                {/* ── Reg Number ── */}
                <div style={{ marginBottom: '1rem' }}>
                  <label className="field-label">Registration Number <span style={{ color: '#ef4444' }}>*</span></label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text" className="field-input" required
                      placeholder="e.g. STUD-0001, GES-0023, BK-0100"
                      value={form.regNumber}
                      onChange={e => setForm({ ...form, regNumber: e.target.value })}
                      style={{ paddingRight: 80, fontFamily: 'monospace', letterSpacing: '.04em' }}
                    />
                    <button type="button" className="gen-btn" onClick={() => setForm({ ...form, regNumber: peekNextRegNumber() })}>
                      <i className="fas fa-undo" style={{ marginRight: 4 }}></i>Auto
                    </button>
                  </div>
                  <div style={{ fontSize: '.72rem', color: '#94a3b8', marginTop: 4 }}>
                    Default format: <strong style={{ color: '#0d9488' }}>{getPrefix()}-XXXX</strong>. Type any format you like — your prefix is remembered for next time.
                  </div>
                </div>

                {/* ── Gender + Class ── */}
                <div className="field-row" style={{ marginBottom: '1rem' }}>
                  <div>
                    <label className="field-label">Gender <span style={{ color: '#ef4444' }}>*</span></label>
                    <select className="field-input" value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Assigned Class <span style={{ color: '#ef4444' }}>*</span></label>
                    <select className="field-input" required value={form.currentClassId} onChange={e => setForm({ ...form, currentClassId: e.target.value })}>
                      <option value="">— Select Class —</option>
                      {classes?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
                
                {/* ── Guardian Details Section ── */}
                <h3 style={{ fontSize: '0.85rem', color: '#0d9488', textTransform: 'uppercase', letterSpacing: '.06em', margin: '1.75rem 0 1rem', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem', fontWeight: 700 }}>
                  <i className="fas fa-users" style={{ fontSize: '0.95rem' }}></i> Guardian Information
                </h3>

                <div style={{ marginBottom: '1rem' }}>
                  <label className="field-label">Guardian's Full Name</label>
                  <input type="text" className="field-input" placeholder="e.g. John Mensah" value={form.guardianName} onChange={e => setForm({ ...form, guardianName: e.target.value })} />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label className="field-label">Guardian's Location / Address</label>
                  <input type="text" className="field-input" placeholder="e.g. House No. B24, Adenta, Accra" value={form.guardianLocation} onChange={e => setForm({ ...form, guardianLocation: e.target.value })} />
                </div>

                <div className="field-row" style={{ marginBottom: '1rem' }}>
                  <div>
                    <label className="field-label">Relation to Learner</label>
                    <select className="field-input" value={form.guardianRelation} onChange={e => setForm({ ...form, guardianRelation: e.target.value })}>
                      <option value="">— Select Relation —</option>
                      <option value="Father">Father</option>
                      <option value="Mother">Mother</option>
                      <option value="Uncle">Uncle</option>
                      <option value="Aunt">Aunt</option>
                      <option value="Grandparent">Grandparent</option>
                      <option value="Guardian">Guardian</option>
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Profession / Occupation</label>
                    <input type="text" className="field-input" placeholder="e.g. Teacher" value={form.guardianProfession} onChange={e => setForm({ ...form, guardianProfession: e.target.value })} />
                  </div>
                </div>

                <div className="field-row" style={{ marginBottom: '1rem' }}>
                  <div>
                    <label className="field-label">Primary Contact</label>
                    <input type="tel" className="field-input" placeholder="e.g. 0244123456" value={form.guardianContact1} onChange={e => setForm({ ...form, guardianContact1: e.target.value })} />
                  </div>
                  <div>
                    <label className="field-label">Secondary Contact</label>
                    <input type="tel" className="field-input" placeholder="e.g. 0200123456" value={form.guardianContact2} onChange={e => setForm({ ...form, guardianContact2: e.target.value })} />
                  </div>
                </div>

                {/* ── Sync Status ── */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <span className={`sync-chip ${navigator.onLine ? 'sync-online' : 'sync-offline'}`}>
                    <i className={`fas ${navigator.onLine ? 'fa-wifi' : 'fa-exclamation-triangle'}`}></i>
                    {navigator.onLine ? 'Online — will sync to cloud' : 'Offline — saved locally, will sync later'}
                  </span>
                </div>

                {/* ── Actions ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '.75rem' }}>
                  <button type="button" className="reg-btn-ghost" onClick={closeModal}>Cancel</button>
                  <button type="submit" className="reg-btn-primary" disabled={isSaving}>
                    {isSaving ? <i className="fas fa-spinner fa-spin"></i> : <i className={editingId ? "fas fa-save" : "fas fa-user-check"}></i>}
                    {isSaving ? 'Saving…' : editingId ? 'Save Changes' : 'Register Learner'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      {/* ── Learner Profile Modal ─────────────────────────────────────── */}
      {profileLearner && (
        <div className="profile-modal-backdrop" onClick={e => e.target === e.currentTarget && setProfileLearner(null)}>
          <div className="profile-modal">
            {/* Header Gradient */}
            <div className={`profile-header-grad ${profileLearner.gender === 'Female' ? 'female' : 'male'}`}>
              <button onClick={() => setProfileLearner(null)} className="profile-close-btn" title="Close Profile">
                <i className="fas fa-times"></i>
              </button>
            </div>

            {/* Profile Body */}
            <div className="profile-body">
              {/* Avatar */}
              <div className="profile-avatar-container">
                <LearnerPhoto
                  photo={profileLearner.photo || profileLearner.photoUrl || null}
                  alt={profileLearner.fullName}
                  className="profile-avatar-img"
                  style={{ width: 120, height: 120, borderRadius: '50%', objectFit: 'cover', border: '4px solid #0d9488', boxShadow: '0 8px 24px rgba(13,148,136,.3)' }}
                />
              </div>

              {/* Name & Reg Badge */}
              <h2 className="profile-name">{profileLearner.fullName}</h2>
              <div className="profile-reg-badge" style={{ marginBottom: '0.25rem' }}>
                <i className="fas fa-id-badge"></i>
                <span>{profileLearner.regNumber}</span>
              </div>

              {/* Tabs */}
              <div className="profile-tabs">
                <button 
                  type="button" 
                  className={`profile-tab-btn ${profileTab === 'personal' ? 'active' : ''}`}
                  onClick={() => setProfileTab('personal')}
                >
                  <i className="fas fa-user-circle" style={{ marginRight: 6 }}></i>Details
                </button>
                <button 
                  type="button" 
                  className={`profile-tab-btn ${profileTab === 'guardian' ? 'active' : ''}`}
                  onClick={() => setProfileTab('guardian')}
                >
                  <i className="fas fa-users" style={{ marginRight: 6 }}></i>Guardian
                </button>
                <button 
                  type="button" 
                  className={`profile-tab-btn ${profileTab === 'academic' ? 'active' : ''}`}
                  onClick={() => setProfileTab('academic')}
                >
                  <i className="fas fa-graduation-cap" style={{ marginRight: 6 }}></i>Academic
                </button>
              </div>

              {/* Tab Content */}
              <div className="profile-content">
                {profileTab === 'personal' ? (
                  <div className="profile-info-grid">
                    <div className="profile-info-card">
                      <span className="profile-info-label">Assigned Class</span>
                      <span className="profile-info-value">
                        <i className="fas fa-chalkboard" style={{ color: '#0d9488' }}></i>
                        {getClass(profileLearner.currentClassId)}
                      </span>
                    </div>
                    <div className="profile-info-card">
                      <span className="profile-info-label">Gender</span>
                      <span className="profile-info-value">
                        {profileLearner.gender === 'Female' ? (
                          <i className="fas fa-venus" style={{ color: '#ec4899' }}></i>
                        ) : (
                          <i className="fas fa-mars" style={{ color: '#3b82f6' }}></i>
                        )}
                        {profileLearner.gender}
                      </span>
                    </div>
                    <div className="profile-info-card">
                      <span className="profile-info-label">Status</span>
                      <span className="profile-info-value">
                        <span className="badge-pill badge-pill-success">
                          <i className="fas fa-circle" style={{ fontSize: '0.45rem' }}></i> Active
                        </span>
                      </span>
                    </div>
                    <div className="profile-info-card">
                      <span className="profile-info-label">Database Sync</span>
                      <span className="profile-info-value">
                        {profileLearner.synced ? (
                          <span className="badge-pill badge-pill-success" style={{ padding: '0.2rem 0.5rem' }}>
                            <i className="fas fa-cloud-upload-alt"></i> Synced
                          </span>
                        ) : (
                          <span className="badge-pill badge-pill-warning" style={{ padding: '0.2rem 0.5rem' }}>
                            <i className="fas fa-exclamation-circle"></i> Local
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="profile-info-card" style={{ gridColumn: 'span 2' }}>
                      <span className="profile-info-label">Enrollment Date</span>
                      <span className="profile-info-value">
                        <i className="fas fa-calendar-alt" style={{ color: '#64748b' }}></i>
                        {profileLearner.createdAt ? new Date(profileLearner.createdAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        }) : 'N/A'}
                      </span>
                    </div>
                  </div>
                ) : profileTab === 'guardian' ? (
                  <div className="profile-info-grid">
                    <div className="profile-info-card" style={{ gridColumn: 'span 2' }}>
                      <span className="profile-info-label">Guardian's Name</span>
                      <span className="profile-info-value">
                        <i className="fas fa-user" style={{ color: '#0d9488' }}></i>
                        {profileLearner.guardianName || 'Not Provided'}
                      </span>
                    </div>
                    <div className="profile-info-card" style={{ gridColumn: 'span 2' }}>
                      <span className="profile-info-label">Location / Address</span>
                      <span className="profile-info-value">
                        <i className="fas fa-map-marker-alt" style={{ color: '#ef4444' }}></i>
                        {profileLearner.guardianLocation || 'Not Provided'}
                      </span>
                    </div>
                    <div className="profile-info-card">
                      <span className="profile-info-label">Relation</span>
                      <span className="profile-info-value">
                        <i className="fas fa-heart" style={{ color: '#ec4899' }}></i>
                        {profileLearner.guardianRelation || 'Not Provided'}
                      </span>
                    </div>
                    <div className="profile-info-card">
                      <span className="profile-info-label">Profession</span>
                      <span className="profile-info-value">
                        <i className="fas fa-briefcase" style={{ color: '#3b82f6' }}></i>
                        {profileLearner.guardianProfession || 'Not Provided'}
                      </span>
                    </div>
                    <div className="profile-info-card">
                      <span className="profile-info-label">Primary Contact</span>
                      <span className="profile-info-value" style={{ fontSize: '.8rem' }}>
                        <i className="fas fa-phone-alt" style={{ color: '#10b981' }}></i>
                        {profileLearner.guardianContact1 ? (
                          <a href={`tel:${profileLearner.guardianContact1}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>
                            {profileLearner.guardianContact1}
                          </a>
                        ) : 'Not Provided'}
                      </span>
                    </div>
                    <div className="profile-info-card">
                      <span className="profile-info-label">Secondary Contact</span>
                      <span className="profile-info-value" style={{ fontSize: '.8rem' }}>
                        <i className="fas fa-phone-alt" style={{ color: '#64748b' }}></i>
                        {profileLearner.guardianContact2 ? (
                          <a href={`tel:${profileLearner.guardianContact2}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>
                            {profileLearner.guardianContact2}
                          </a>
                        ) : 'Not Provided'}
                      </span>
                    </div>
                    <div className="profile-info-card" style={{ gridColumn: 'span 2', marginTop: '.25rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span className="profile-info-label">Parent Portal Access</span>
                          <span className="profile-info-value" style={{ fontSize: '.8rem', color: '#64748b', fontWeight: 'normal' }}>
                            <i className="fas fa-mobile-alt" style={{ color: '#0d9488' }}></i>
                            Manage login access for this guardian's primary contact.
                          </span>
                        </div>
                        <button 
                          className="badge-pill badge-pill-warning" 
                          style={{ border: 'none', cursor: 'pointer', padding: '.4rem .8rem', transition: 'all 0.2s' }}
                          onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 2px 5px rgba(245, 158, 11, 0.2)'; }}
                          onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                          onClick={async () => {
                            if (!profileLearner.guardianContact1) {
                              alert("Please add a Primary Contact number for the guardian first.");
                              return;
                            }
                            if (await window.confirm("Are you sure you want to reset the parent portal password for " + profileLearner.guardianContact1 + "? It will be reset to a temporary default password '123456'.")) {
                              try {
                                await authService.resetParentPassword(profileLearner.guardianContact1);
                                alert("Password reset successfully. The parent's new temporary password is: 123456. Please advise them to log in and change it.");
                              } catch (e) {
                                alert("Failed to reset password: " + e.message);
                              }
                            }
                          }}
                        >
                          <i className="fas fa-key"></i> Reset Parent Password
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="academic-stats">
                    <div style={{ marginBottom: '0.75rem', fontSize: '0.75rem', color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <i className="fas fa-calendar-alt" style={{ color: '#0d9488' }}></i>
                      <span>Period: <strong>{activeAcademicYear || 'N/A'} — {activeTerm}</strong></span>
                    </div>
                    <div className="profile-info-grid" style={{ marginBottom: '0.5rem' }}>
                      <div className="profile-info-card">
                        <span className="profile-info-label">Attendance Rate</span>
                        <span className="profile-info-value" style={{ color: '#10b981', fontSize: '1rem', fontWeight: 800 }}>
                          {attendanceRate !== null ? `${attendanceRate}%` : 'N/A'}
                        </span>
                      </div>
                      <div className="profile-info-card">
                        <span className="profile-info-label">Current Average</span>
                        <span className="profile-info-value" style={{ color: '#0d9488', fontSize: '1rem', fontWeight: 800 }}>
                          {currentAverage !== null ? `${currentAverage}%` : 'N/A'}
                        </span>
                      </div>
                    </div>
                    
                    <div className="stat-bar-container">
                      <div className="stat-bar-header">
                        <span>Attendance Performance</span>
                        <span>{attendanceRate !== null ? `${attendanceRate}%` : 'N/A'}</span>
                      </div>
                      <div className="stat-bar-outer">
                        <div className="stat-bar-inner" style={{ width: attendanceRate !== null ? `${Math.min(100, Math.max(0, attendanceRate))}%` : '0%', background: 'linear-gradient(90deg, #10b981, #059669)' }}></div>
                      </div>
                    </div>
                    
                    <div className="stat-bar-container" style={{ marginTop: '0.5rem' }}>
                      <div className="stat-bar-header">
                        <span>Academic Performance Score</span>
                        <span>{currentAverage !== null ? `${currentAverage}%` : 'N/A'}</span>
                      </div>
                      <div className="stat-bar-outer">
                        <div className="stat-bar-inner" style={{ width: currentAverage !== null ? `${Math.min(100, Math.max(0, currentAverage))}%` : '0%', background: 'linear-gradient(90deg, #0d9488, #3b82f6)' }}></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="profile-actions">
                <button 
                  type="button" 
                  className="profile-btn profile-btn-primary"
                  onClick={() => {
                    const l = profileLearner;
                    setProfileLearner(null);
                    openEditModal(l);
                  }}
                >
                  <i className="fas fa-user-edit"></i> Edit Details
                </button>
                <button 
                  type="button" 
                  className="profile-btn profile-btn-secondary"
                  onClick={() => alert(`Report Card/ID PDF printing is offline for ${profileLearner.fullName}`)}
                  title="Print Student ID / Report Card"
                >
                  <i className="fas fa-print"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Excel Import Preview Modal ───────────────────────────────── */}
      {isImportModalOpen && (
        <div className="import-modal-backdrop" onClick={e => e.target === e.currentTarget && !isSaving && setIsImportModalOpen(false)}>
          <div className="import-modal">
            {/* Header */}
            <div className="import-modal-header">
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a', display: 'flex', alignItems: 'center' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, background: 'rgba(13,148,136,.1)', borderRadius: 10, marginRight: 10 }}>
                    <i className="fas fa-file-excel" style={{ color: '#0d9488', fontSize: '.9rem' }}></i>
                  </span>
                  Excel Bulk Registration Preview
                </h2>
                <p style={{ margin: '4px 0 0 46px', fontSize: '.8rem', color: '#94a3b8' }}>
                  Review and make final adjustments to learners before saving. Assign classes case-insensitively.
                </p>
              </div>
              <button onClick={() => !isSaving && setIsImportModalOpen(false)} style={{ background: '#f1f5f9', border: 'none', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: '1rem', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} disabled={isSaving}>
                <i className="fas fa-times"></i>
              </button>
            </div>

            {/* Statistics Bar */}
            <div style={{ display: 'flex', gap: '.75rem', padding: '1rem 1.5rem', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
              <div className="stat-badge stat-badge-total">
                <i className="fas fa-users"></i>
                Total Parsed: <strong>{importData.length}</strong>
              </div>
              
              {importData.filter(d => !d.classId).length > 0 && (
                <div className="stat-badge stat-badge-warning">
                  <i className="fas fa-exclamation-triangle"></i>
                  Unassigned Classes: <strong>{importData.filter(d => !d.classId).length}</strong> (Select below)
                </div>
              )}

              {importData.filter(d => !d.fullName).length > 0 && (
                <div className="stat-badge stat-badge-warning">
                  <i className="fas fa-user-slash"></i>
                  Missing Names: <strong>{importData.filter(d => !d.fullName).length}</strong>
                </div>
              )}

              {importData.filter(d => d.fullName && d.classId).length > 0 && (
                <div className="stat-badge stat-badge-valid">
                  <i className="fas fa-check-circle"></i>
                  Ready for Import: <strong>{importData.filter(d => d.fullName && d.classId).length}</strong>
                </div>
              )}
            </div>

            {/* Modal Body with Table */}
            <div className="import-modal-body">
              <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <table className="import-table">
                  <thead>
                    <tr>
                      <th style={{ width: 60, textAlign: 'center' }}>Status</th>
                      <th>Full Name <span style={{ color: '#ef4444' }}>*</span></th>
                      <th style={{ width: 140 }}>Reg Number</th>
                      <th style={{ width: 110 }}>Gender</th>
                      <th style={{ width: 180 }}>Assigned Class <span style={{ color: '#ef4444' }}>*</span></th>
                      <th>Guardian Info</th>
                      <th style={{ width: 60, textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importData.map((d, index) => {
                      const hasWarning = !d.fullName || !d.classId;
                      return (
                        <tr key={d.tempId} style={{ background: hasWarning ? 'rgba(245,158,11,.02)' : 'transparent' }}>
                          <td style={{ textAlign: 'center' }}>
                            {hasWarning ? (
                              <i className="fas fa-exclamation-triangle" style={{ color: '#f59e0b', fontSize: '1.05rem' }} title="Validation warning: Check name and class"></i>
                            ) : (
                              <i className="fas fa-check-circle" style={{ color: '#10b981', fontSize: '1.05rem' }}></i>
                            )}
                          </td>
                          <td>
                            <input 
                              type="text" 
                              className={`import-input${!d.fullName ? ' warning' : ''}`}
                              value={d.fullName} 
                              placeholder="e.g. John Doe"
                              onChange={e => {
                                const newName = e.target.value;
                                const updated = [...importData];
                                updated[index] = { 
                                  ...d, 
                                  fullName: newName,
                                  warningName: newName.trim() === ''
                                };
                                setImportData(updated);
                              }}
                            />
                          </td>
                          <td>
                            <input 
                              type="text" 
                              className="import-input"
                              value={d.regNumber} 
                              placeholder="Auto-generated"
                              style={{ fontFamily: 'monospace', letterSpacing: '.02em' }}
                              onChange={e => {
                                const updated = [...importData];
                                updated[index] = { ...d, regNumber: e.target.value };
                                setImportData(updated);
                              }}
                            />
                          </td>
                          <td>
                            <select 
                              className="import-select"
                              value={d.gender}
                              onChange={e => {
                                const updated = [...importData];
                                updated[index] = { ...d, gender: e.target.value };
                                setImportData(updated);
                              }}
                            >
                              <option value="Male">Male</option>
                              <option value="Female">Female</option>
                            </select>
                          </td>
                          <td>
                            <select 
                              className={`import-select${!d.classId ? ' warning' : ''}`}
                              value={d.classId}
                              onChange={e => {
                                const newClassId = e.target.value;
                                const updated = [...importData];
                                updated[index] = { 
                                  ...d, 
                                  classId: newClassId,
                                  warningClass: newClassId === ''
                                };
                                setImportData(updated);
                              }}
                            >
                              <option value="">— Select Class —</option>
                              {classes?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </td>
                          <td>
                            <div style={{ fontSize: '.78rem', display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ color: '#1e293b', fontWeight: 600 }}>{d.guardianName || <span style={{ color: '#94a3b8', fontWeight: 'normal', fontStyle: 'italic' }}>No guardian name</span>}</span>
                              <span style={{ color: '#64748b' }}>{d.guardianContact1 || d.guardianContact2 || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>No contact</span>}</span>
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button 
                              type="button" 
                              onClick={() => {
                                const updated = importData.filter((_, i) => i !== index);
                                setImportData(updated);
                                if (updated.length === 0) {
                                  setIsImportModalOpen(false);
                                }
                              }} 
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '.4rem', fontSize: '.9rem' }}
                              title="Remove row"
                            >
                              <i className="fas fa-trash-alt"></i>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer */}
            <div className="import-modal-footer">
              <button 
                type="button" 
                className="reg-btn-ghost" 
                onClick={() => setIsImportModalOpen(false)} 
                style={{ width: 'auto', padding: '.65rem 1.5rem', borderRadius: 10 }}
                disabled={isSaving}
              >
                Cancel
              </button>
              
              <button 
                type="button" 
                className="reg-btn-primary" 
                onClick={handleConfirmImport}
                style={{ width: 'auto', padding: '.65rem 1.75rem', borderRadius: 10, background: 'linear-gradient(135deg,#0d9488,#0f766e)' }}
                disabled={isSaving || importData.some(d => !d.fullName || !d.classId)}
              >
                {isSaving ? <i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }}></i> : <i className="fas fa-user-check" style={{ marginRight: 6 }}></i>}
                {isSaving ? 'Registering...' : `Confirm Import (${importData.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reassign Registration Numbers Modal ──────────────────────── */}
      {isReassignModalOpen && (
        <div className="reg-modal-backdrop" onClick={e => e.target === e.currentTarget && !isReassigning && setIsReassignModalOpen(false)}>
          <div className="reg-modal" style={{ maxWidth: '440px' }}>
            {/* Header */}
            <div className="reg-modal-header" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '1.25rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a', display: 'flex', alignItems: 'center' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, background: 'rgba(59,130,246,.1)', borderRadius: 10, marginRight: 10 }}>
                    <i className="fas fa-sort-numeric-down" style={{ color: '#3b82f6', fontSize: '.9rem' }}></i>
                  </span>
                  Reassign Reg Numbers
                </h2>
                <p style={{ margin: '4px 0 0 46px', fontSize: '.8rem', color: '#94a3b8' }}>
                  Reassign sequentially based on alphabetical name order.
                </p>
              </div>
              <button onClick={() => !isReassigning && setIsReassignModalOpen(false)} style={{ background: '#f1f5f9', border: 'none', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: '1rem', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} disabled={isReassigning}>
                <i className="fas fa-times"></i>
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleReassignRegNumbers} style={{ padding: '1.5rem' }}>
              {reassignStatus ? (
                <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', minHeight: '120px' }}>
                  <i className="fas fa-spinner fa-spin" style={{ fontSize: '1.8rem', color: '#3b82f6' }}></i>
                  <div style={{ fontSize: '.85rem', color: '#475569', fontWeight: 600, textAlign: 'center' }}>{reassignStatus}</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div style={{ fontSize: '.85rem', color: '#475569', background: 'rgba(59,130,246,0.06)', padding: '.75rem 1rem', borderRadius: 10, border: '1px solid rgba(59,130,246,0.15)', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <i className="fas fa-info-circle" style={{ color: '#3b82f6', marginTop: '2px' }}></i>
                    <span>
                      This will sequentially reassign new numbers to the <strong>{filtered?.length ?? 0}</strong> currently displayed learners in their sorted alphabetical name order.
                    </span>
                  </div>

                  <div className="form-group">
                    <label className="field-label">Registration Prefix</label>
                    <input 
                      type="text" 
                      className="field-input" 
                      placeholder="e.g. STUD, GES, BKS"
                      value={reassignPrefix}
                      onChange={e => setReassignPrefix(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())}
                      required
                      maxLength={12}
                    />
                  </div>

                  <div className="form-group">
                    <label className="field-label">Starting Sequential Number</label>
                    <input 
                      type="number" 
                      className="field-input" 
                      placeholder="e.g. 1"
                      value={reassignStartNum}
                      onChange={e => setReassignStartNum(e.target.value.replace(/[^0-9]/g, ''))}
                      required
                      min="1"
                    />
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '.75rem', marginTop: '1rem', borderTop: '1px solid #f1f5f9', paddingTop: '1.25rem' }}>
                    <button 
                      type="button" 
                      className="reg-btn-ghost" 
                      onClick={() => setIsReassignModalOpen(false)} 
                      style={{ flex: 1, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="reg-btn-primary" 
                      style={{ flex: 1, height: 44, background: 'linear-gradient(135deg,#3b82f6,#2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    >
                      <i className="fas fa-check"></i>
                      <span>Apply & Sync</span>
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default LearnerList;
