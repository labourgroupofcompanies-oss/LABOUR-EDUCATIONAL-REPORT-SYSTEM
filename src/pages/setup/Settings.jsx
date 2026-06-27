import React, { useState, useEffect } from 'react';
import Layout from '../../components/layout/Layout';
import { db } from '../../lib/db';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../store/AuthContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { enqueueSync } from '../../services/syncEngine';
import { compressImageToBlob } from '../../utils/imageUtils';

const Settings = () => {
  const { user, updateProfile } = useAuth();
  const globalSettings = useLiveQuery(() => db.settings.get('global'), []);
  const schoolData = useLiveQuery(() => user?.schoolId ? db.schools.get(user.schoolId) : null, [user]);
  
  const [profileName, setProfileName] = useState('');
  const [profileStaffId, setProfileStaffId] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    if (user) {
      setProfileName(user.fullName || '');
      setProfileStaffId(user.staffId || '');
    }
  }, [user]);

  const [settings, setSettings] = useState({
    caWeight: 30,
    examWeight: 70,
    caModel: 'simple_mean',
    caBestNCount: '',
    caBreakdown: [
      { id: 'exercises', label: 'Class Exercises', count: 4, maxScore: 10, enabled: true },
      { id: 'tests', label: 'Class Tests', count: 2, maxScore: 15, enabled: true },
      { id: 'assignments', label: 'Assignments', count: 2, maxScore: 10, enabled: true },
      { id: 'projects', label: 'Project Work', count: 1, maxScore: 10, enabled: true }
    ],
    gradingScale: []
  });

  const [school, setSchool] = useState({
    name: '',
    motto: '',
    logoUrl: '',
    location: '',
    district: '',
    region: '',
    circuit: '',
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
        // 1. Hydrate grading & assessment settings
        const { data: settingsList, error: settingsError } = await supabase
          .from('report_settings')
          .select('*')
          .eq('id', user.schoolId);
        const settingsData = settingsList?.[0];

        if (settingsData && !settingsError) {
          await db.settings.put({
            id: 'global',
            caWeight: settingsData.ca_weight,
            examWeight: settingsData.exam_weight,
            caModel: settingsData.ca_model,
            caBestNCount: settingsData.ca_best_n || '',
            caBreakdown: settingsData.ca_breakdown || [],
            gradingScale: settingsData.grading_scale || []
          });
        }

        // 2. Hydrate school motto, logo, dates
        const { data: remoteSchoolList, error: schoolError } = await supabase
          .from('report_schools')
          .select('*')
          .eq('id', user.schoolId);
        const remoteSchool = remoteSchoolList?.[0];

        if (remoteSchool && !schoolError) {
          await db.schools.put({
            id: user.schoolId,
            name: remoteSchool.name || '',
            location: remoteSchool.location || '',
            district: remoteSchool.district || '',
            region: remoteSchool.region || '',
            circuit: remoteSchool.circuit || '',
            motto: remoteSchool.motto || '',
            logoUrl: remoteSchool.logo_url || '',
            currentAcademicYear: remoteSchool.current_academic_year || '',
            currentTerm: remoteSchool.current_term || 'Term 1',
            vacationDate: remoteSchool.vacation_date || '',
            nextTermBegins: remoteSchool.next_term_begins || '',
            phone: remoteSchool.phone || '',
            email: remoteSchool.email || ''
          });
        }
      } catch (err) {
        console.error('Failed to sync global settings or school from cloud:', err);
      }
    };
    fetchCloudSettings();
  }, [user]);

  // Sync local changes to states
  useEffect(() => {
    if (globalSettings) {
      const safeSettings = { ...globalSettings };
      if (!safeSettings.caBreakdown || safeSettings.caBreakdown.length === 0) {
        safeSettings.caBreakdown = [
          { id: 'exercises', label: 'Class Exercises', count: 4, maxScore: 10, enabled: true },
          { id: 'tests', label: 'Class Tests', count: 2, maxScore: 15, enabled: true },
          { id: 'assignments', label: 'Assignments', count: 2, maxScore: 10, enabled: true },
          { id: 'projects', label: 'Project Work', count: 1, maxScore: 10, enabled: true }
        ];
      }
      setSettings(safeSettings);
    }
  }, [globalSettings]);

  useEffect(() => {
    if (schoolData) {
      setSchool({
        name: schoolData.name || '',
        motto: schoolData.motto || '',
        logoUrl: schoolData.logoUrl || '',
        location: schoolData.location || '',
        district: schoolData.district || '',
        region: schoolData.region || '',
        circuit: schoolData.circuit || '',
        currentAcademicYear: schoolData.currentAcademicYear || '',
        currentTerm: schoolData.currentTerm || 'Term 1',
        vacationDate: schoolData.vacationDate || '',
        nextTermBegins: schoolData.nextTermBegins || '',
        phone: schoolData.phone || '',
        email: schoolData.email || ''
      });
    }
  }, [schoolData]);

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Accept ANY image format — we convert everything to WebP regardless.
    // No arbitrary file-size cap: compressImageToBlob will scale it down to
    // at most 500×500 px, so even a 20 MB RAW photo becomes a tiny WebP.
    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file (JPEG, PNG, GIF, WebP, BMP, AVIF, SVG, etc.).');
      return;
    }

    setIsUploadingLogo(true);
    try {
      // Step 1: Decode + resize + convert to WebP Blob — zero base64 in this pipeline
      const webpBlob = await compressImageToBlob(file, 500, 500, 0.85);

      // Step 2: Upload the Blob directly to Supabase Storage
      const fileName = `${user?.schoolId ?? 'logo'}_logo_${Date.now()}.webp`;
      const { error: uploadError } = await supabase.storage
        .from('school-logos')
        .upload(fileName, webpBlob, { upsert: true, contentType: 'image/webp' });

      if (uploadError) {
        console.error('Logo upload error:', uploadError);
        alert('Failed to upload logo: ' + uploadError.message);
        return;
      }

      // Step 3: Save only the public URL — never a base64 string
      const { data } = supabase.storage.from('school-logos').getPublicUrl(fileName);
      const publicUrl = data?.publicUrl || '';
      setSchool(prev => ({ ...prev, logoUrl: publicUrl }));
      alert('School logo uploaded successfully!');
    } catch (err) {
      console.error('Logo processing error:', err);
      alert('Failed to process image: ' + err.message + '\nPlease try a different image file.');
    } finally {
      setIsUploadingLogo(false);
      // Reset the input so the same file can be re-selected if needed
      e.target.value = '';
    }
  };


  const handleSave = async (e) => {
    e.preventDefault();
    if (Number(settings.caWeight) + Number(settings.examWeight) !== 100) {
      alert("CA and Exam weights must add up to 100.");
      return;
    }
    
    setIsSaving(true);
    
    // Sort gradingScale before saving so it's clean and sorted descending in the database/IndexedDB.
    // Also resolve any blank values to their calculated defaults so the backend has valid numbers.
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
    
    // Save assessment settings locally
    await db.settings.put(updatedSettings);

    // Save school profile locally
    if (user?.schoolId) {
      await db.schools.put({ ...school, id: user.schoolId });
    }

    // Sync to Cloud
    if (user?.schoolId) {
      try {
        // Sync report_settings
        await enqueueSync('upsert', 'report_settings', {
          id: user.schoolId,
          school_id: user.schoolId,
          ca_weight: settings.caWeight,
          exam_weight: settings.examWeight,
          ca_model: settings.caModel,
          ca_best_n: settings.caBestNCount || null,
          ca_breakdown: settings.caBreakdown,
          grading_scale: finalScale,
          updated_at: new Date().toISOString()
        }, user.schoolId);

        // Sync report_schools — use upsert so it works even if fields were null before
        await enqueueSync('upsert', 'report_schools', {
          id: user.schoolId,
          name: school.name,
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
        console.error('Failed to sync settings or school to cloud:', err);
      }
    }

    setIsSaving(false);
    alert('All school settings saved and synchronized successfully!');
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!profileName.trim()) {
      alert('Full Name is required.');
      return;
    }
    
    setIsSavingProfile(true);
    try {
      const updatedFields = {
        fullName: profileName.trim(),
        staffId: profileStaffId.trim()
      };
      
      // 1. Update locally in Dexie
      await db.profiles.update(user.id, updatedFields);

      // 2. Update context state
      updateProfile(updatedFields);

      // 3. Enqueue sync for cloud update
      await enqueueSync('update', 'report_profiles', {
        filter: { id: user.id },
        data: {
          full_name: updatedFields.fullName,
          staff_id: updatedFields.staffId,
          updated_at: new Date().toISOString()
        }
      }, user.schoolId);

      // 4. Update Supabase Auth user metadata
      if (navigator.onLine) {
        try {
          await supabase.auth.updateUser({
            data: { 
              full_name: updatedFields.fullName,
              staff_id: updatedFields.staffId
            }
          });
        } catch (authErr) {
          console.warn('Failed to update auth metadata:', authErr);
        }
      }

      alert('Profile details updated successfully!');
    } catch (err) {
      console.error('Failed to save profile:', err);
      alert('Failed to update profile: ' + err.message);
    } finally {
      setIsSavingProfile(false);
    }
  };


  const updateGradingScale = (index, field, value) => {
    const newScale = [...settings.gradingScale];
    if (field === 'min' || field === 'max') {
       newScale[index][field] = value === '' ? '' : Number(value);
    } else {
       newScale[index][field] = value;
    }
    setSettings({ ...settings, gradingScale: newScale });
  };

  const addGradingRow = () => {
    setSettings({
      ...settings,
      gradingScale: [...settings.gradingScale, { min: '', max: '', grade: '', remark: '' }]
    });
  };

  const removeGradingRow = (index) => {
    const newScale = settings.gradingScale.filter((_, i) => i !== index);
    setSettings({ ...settings, gradingScale: newScale });
  };

  return (
    <Layout title="Portal Setup & School Settings">
      <div className="fade-in">
        <form onSubmit={handleSave}>
          
          {/* Headteacher Profile Card */}
          <div className="card" style={{ marginBottom: '2rem' }}>
            <h3 style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fas fa-user-cog" style={{ color: 'var(--accent)' }}></i>
              Headteacher Profile Settings
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Full Name</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. John Doe"
                  value={profileName} 
                  onChange={(e) => setProfileName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Email Address (Read-only)</label>
                <input 
                  type="email" 
                  className="form-input" 
                  value={user?.email || ''} 
                  disabled
                  style={{ background: 'var(--background)', color: 'var(--text-muted)', cursor: 'not-allowed' }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Staff ID</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. HT-001"
                  value={profileStaffId} 
                  onChange={(e) => setProfileStaffId(e.target.value)}
                />
              </div>
            </div>
            
            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-start' }}>
              <button 
                type="button" 
                className="btn btn-accent" 
                onClick={handleSaveProfile}
                disabled={isSavingProfile}
                style={{ 
                  background: 'var(--accent)', 
                  color: 'white', 
                  padding: '0.6rem 1.25rem', 
                  border: 'none', 
                  borderRadius: '8px', 
                  fontWeight: 'bold', 
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {isSavingProfile ? <i className="fas fa-spinner fa-spin"></i> : null}
                <span>Save Profile Details</span>
              </button>
            </div>
          </div>
          
          {/* School Profile & Term Settings Card */}
          <div className="card" style={{ marginBottom: '2rem' }}>
            <h3 style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fas fa-school" style={{ color: 'var(--accent)' }}></i>
              School Profile & Academic Term Setup
            </h3>

            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
              {/* Logo Upload Circle */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', flex: '0 0 150px' }}>
                <div style={{
                  width: '120px',
                  height: '120px',
                  borderRadius: '50%',
                  border: '3px solid var(--accent-light)',
                  background: 'var(--background)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  position: 'relative',
                  boxShadow: 'var(--shadow-sm)'
                }}>
                  {school.logoUrl ? (
                    <img src={school.logoUrl} alt="School Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <i className="fas fa-university" style={{ fontSize: '3rem', color: 'var(--text-muted)', opacity: 0.5 }}></i>
                  )}
                </div>
                <label 
                  className="btn" 
                  style={{ 
                    padding: '0.35rem 0.75rem', 
                    fontSize: '0.75rem', 
                    background: isUploadingLogo ? 'var(--text-muted)' : 'var(--accent)', 
                    color: 'white', 
                    cursor: isUploadingLogo ? 'not-allowed' : 'pointer', 
                    borderRadius: '6px', 
                    fontWeight: 600,
                    opacity: isUploadingLogo ? 0.7 : 1
                  }}
                >
                  {isUploadingLogo 
                    ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: '4px' }}></i>Uploading...</>
                    : <><i className="fas fa-camera" style={{ marginRight: '4px' }}></i>Upload Logo</>
                  }
                  {/* Accept all image formats — we convert to WebP internally */}
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleLogoUpload} 
                    disabled={isUploadingLogo}
                    style={{ display: 'none' }} 
                  />
                </label>
              </div>

              {/* School Details Grid */}
              <div style={{ flex: '1 1 400px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">School Name</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. Labour Edu Academy"
                    value={school.name} 
                    onChange={(e) => setSchool({ ...school, name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">School Motto</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. Knowledge is Power"
                    value={school.motto} 
                    onChange={(e) => setSchool({ ...school, motto: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Location / Address</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. Accra Central"
                    value={school.location} 
                    onChange={(e) => setSchool({ ...school, location: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">District</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. Ashiedu Keteke"
                    value={school.district} 
                    onChange={(e) => setSchool({ ...school, district: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Region</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. Greater Accra"
                    value={school.region} 
                    onChange={(e) => setSchool({ ...school, region: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Circuit</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. Circuit 4"
                    value={school.circuit} 
                    onChange={(e) => setSchool({ ...school, circuit: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Support Phone Number</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. 054 220 2200"
                    value={school.phone} 
                    onChange={(e) => setSchool({ ...school, phone: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Support Email Address</label>
                  <input 
                    type="email" 
                    className="form-input" 
                    placeholder="e.g. support@school.edu"
                    value={school.email} 
                    onChange={(e) => setSchool({ ...school, email: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Term dates configuration */}
            <div style={{ 
              borderTop: '1px dashed var(--border)', 
              paddingTop: '1.5rem', 
              marginTop: '1.5rem', 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
              gap: '1.25rem' 
            }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Active Academic Year</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. 2025/2026"
                  value={school.currentAcademicYear} 
                  onChange={(e) => setSchool({ ...school, currentAcademicYear: e.target.value })}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Active Term</label>
                <select 
                  className="form-input"
                  style={{ cursor: 'pointer' }}
                  value={school.currentTerm} 
                  onChange={(e) => setSchool({ ...school, currentTerm: e.target.value })}
                >
                  <option value="Term 1">Term 1</option>
                  <option value="Term 2">Term 2</option>
                  <option value="Term 3">Term 3</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Vacation Date</label>
                <input 
                  type="date" 
                  className="form-input" 
                  value={school.vacationDate} 
                  onChange={(e) => setSchool({ ...school, vacationDate: e.target.value })}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Next Term Resumes</label>
                <input 
                  type="date" 
                  className="form-input" 
                  value={school.nextTermBegins} 
                  onChange={(e) => setSchool({ ...school, nextTermBegins: e.target.value })}
                />
              </div>
            </div>
          </div>
          
          {/* Assessment Weighting */}
          <div className="card" style={{ marginBottom: '2rem' }}>
            <h3 style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
              <i className="fas fa-balance-scale" style={{ color: 'var(--accent)', marginRight: '8px' }}></i>
              Assessment Weighting
            </h3>
            
            <div className="two-col-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Continuous Assessment (CA) %</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={settings.caWeight} 
                  onChange={(e) => setSettings({ ...settings, caWeight: Number(e.target.value) })}
                  min="0" max="100"
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Examination %</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={settings.examWeight} 
                  onChange={(e) => setSettings({ ...settings, examWeight: Number(e.target.value) })}
                  min="0" max="100"
                />
              </div>
            </div>
            {Number(settings.caWeight) + Number(settings.examWeight) !== 100 && (
              <div style={{ color: 'var(--error)', fontSize: '0.85rem', marginTop: '-0.5rem' }}>
                <i className="fas fa-exclamation-triangle" style={{ marginRight: '5px' }}></i>
                Weights must add up to exactly 100%. (Current: {Number(settings.caWeight) + Number(settings.examWeight)}%)
              </div>
            )}
          </div>

          {/* CA Calculation Model & Structure */}
          <div className="card" style={{ marginBottom: '2rem' }}>
            <h3 style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
              <i className="fas fa-calculator" style={{ color: 'var(--accent)', marginRight: '8px' }}></i>
              Continuous Assessment Structure
            </h3>
            
            <div className="two-col-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
               <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Calculation Model</label>
                <select 
                  className="form-input" 
                  value={settings.caModel} 
                  onChange={(e) => setSettings({ ...settings, caModel: e.target.value })}
                >
                  <option value="simple_mean">Simple Mean (Average of all CA components)</option>
                  <option value="best_n">Best 'N' Model (Average of highest scoring components)</option>
                </select>
              </div>

              {settings.caModel === 'best_n' && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Select Best 'N' Components</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    placeholder="e.g. 3"
                    value={settings.caBestNCount || ''} 
                    onChange={(e) => setSettings({ ...settings, caBestNCount: e.target.value ? Number(e.target.value) : '' })}
                    min="1"
                  />
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>How many of the top components to count.</div>
                </div>
              )}
            </div>

            <h4 style={{ fontSize: '0.9rem', marginBottom: '1rem', color: 'var(--text)' }}>CA Component Breakdown</h4>
            <div className="table-wrapper">
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                <thead style={{ background: 'var(--background)' }}>
                  <tr>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Component Type</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Count Per Term</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Max Raw Score</th>
                  </tr>
                </thead>
                <tbody>
                  {settings.caBreakdown?.map((item, index) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600, fontSize: '0.85rem' }}>{item.label}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <input 
                          type="number" 
                          className="form-input" 
                          style={{ textAlign: 'center', margin: '0 auto', maxWidth: '80px' }}
                          value={item.count || ''}
                          onChange={(e) => {
                            const newBreakdown = [...settings.caBreakdown];
                            newBreakdown[index].count = e.target.value ? Number(e.target.value) : '';
                            // Automatically ensure it's marked as enabled if they add a count
                            newBreakdown[index].enabled = newBreakdown[index].count > 0;
                            setSettings({ ...settings, caBreakdown: newBreakdown });
                          }}
                        />
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <input 
                          type="number" 
                          className="form-input" 
                          style={{ textAlign: 'center', margin: '0 auto', maxWidth: '80px' }}
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

            <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--background)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>
              <strong>How it works:</strong> Teachers will enter scores based on the active components above. 
              The system will convert each entered score into a percentage.
              {settings.caModel === 'simple_mean' ? 
                ` It will then average all these percentages, and scale the result to your ${settings.caWeight}% CA weight.` : 
                ` It will then select the highest ${settings.caBestNCount || 'N'} percentages, average them, and scale the result to your ${settings.caWeight}% CA weight.`
              }
            </div>
          </div>

          {/* Grading System */}
          <div style={{ marginBottom: '2rem', background: 'var(--surface)', padding: '2rem 1rem', borderRadius: 'var(--radius-lg)' }}>
            <h3 style={{ margin: '0 0 1rem 0', color: '#1e293b', fontSize: '1.25rem', fontWeight: 'bold' }}>
              Grading System
            </h3>
            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', marginBottom: '1.5rem' }} />
            
            <div style={{ overflowX: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr 50px', gap: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)', marginBottom: '1rem', minWidth: '600px' }}>
                <div style={{ fontWeight: '600', color: '#94a3b8', fontSize: '0.85rem' }}>Min</div>
                <div style={{ fontWeight: '600', color: '#94a3b8', fontSize: '0.85rem' }}>Max</div>
                <div style={{ fontWeight: '600', color: '#94a3b8', fontSize: '0.85rem' }}>Grade</div>
                <div style={{ fontWeight: '600', color: '#94a3b8', fontSize: '0.85rem' }}>Remark</div>
                <div style={{ fontWeight: '600', color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center' }}>Del</div>
              </div>

              <div style={{ minWidth: '600px' }}>
                {settings.gradingScale.map((scale, index) => (
                  <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr 50px', gap: '1.5rem', alignItems: 'center', marginBottom: '1rem' }}>
                    <input 
                      type="number" 
                      style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: 'none', background: '#f8fafc', fontWeight: 'bold', width: '100%', outline: 'none', color: '#1e293b', fontSize: '0.95rem' }}
                      value={scale.min === 0 ? 0 : (scale.min || '')}
                      placeholder="0"
                      onChange={(e) => updateGradingScale(index, 'min', e.target.value)}
                    />
                    <input 
                      type="number" 
                      style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: 'none', background: '#f8fafc', fontWeight: 'bold', width: '100%', outline: 'none', color: '#1e293b', fontSize: '0.95rem' }}
                      value={scale.max === 0 ? 0 : (scale.max || '')}
                      placeholder={index === 0 ? "100" : (settings.gradingScale[index - 1]?.min !== '' && settings.gradingScale[index - 1]?.min !== undefined ? String(Number(settings.gradingScale[index - 1]?.min) - 1) : "Max score")}
                      onChange={(e) => updateGradingScale(index, 'max', e.target.value)}
                    />
                    <input 
                      type="text" 
                      style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: 'none', background: '#f8fafc', fontWeight: 'bold', width: '100%', outline: 'none', color: '#1e293b', fontSize: '0.95rem' }}
                      value={scale.grade}
                      placeholder="Grade"
                      onChange={(e) => updateGradingScale(index, 'grade', e.target.value)}
                    />
                    <input 
                      type="text" 
                      style={{ padding: '0.75rem 1rem', borderRadius: '8px', border: 'none', background: '#f8fafc', fontWeight: 'bold', width: '100%', outline: 'none', color: '#1e293b', fontSize: '0.95rem' }}
                      value={scale.remark}
                      placeholder="Remark"
                      onChange={(e) => updateGradingScale(index, 'remark', e.target.value)}
                    />
                    <button 
                      type="button" 
                      style={{ background: 'none', border: 'none', color: '#ff4d4f', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }} 
                      onClick={() => removeGradingRow(index)}
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>
                ))}
              </div>
            </div>
            
            <button type="button" style={{ background: 'none', border: 'none', color: '#0084ff', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', marginTop: '1.5rem', padding: 0, fontSize: '0.9rem' }} onClick={addGradingRow}>
              + Add Grade Range
            </button>
            
            <div style={{ marginTop: '2.5rem' }}>
              <button type="submit" style={{ background: '#0084ff', color: 'white', padding: '0.8rem 1.5rem', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem' }} disabled={isSaving}>
                 {isSaving ? <i className="fas fa-spinner fa-spin"></i> : null}
                 <span>Save Academic Settings</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </Layout>
  );
};

export default Settings;
