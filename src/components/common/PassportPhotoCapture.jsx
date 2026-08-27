import React, { useState, useRef, useEffect, useCallback } from 'react';
import LearnerPhoto from './LearnerPhoto';
import { processPassportPhoto } from '../../utils/imageUtils';

/**
 * PassportPhotoCapture (Automated One-Tap Version)
 *
 * Super simple & fast:
 * 1. Live Camera with Head & Shoulders Alignment Oval
 * 2. One-click "Capture Photo" button
 * 3. Automatically crops to a passport photo (450x600 px)
 * 4. Front/Back camera switcher for mobile devices
 */
const PassportPhotoCapture = ({
  currentPhoto = null,
  gender = 'Male',
  onPhotoSelected,
  onPhotoCleared
}) => {
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [photoBlob, setPhotoBlob] = useState(currentPhoto);

  const [cameras, setCameras] = useState([]);
  const [activeCamIdx, setActiveCamIdx] = useState(0);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [isMirrored, setIsMirrored] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (currentPhoto !== photoBlob) {
      setPhotoBlob(currentPhoto);
    }
  }, [currentPhoto]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const loadCameraDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      let videoDevices = all.filter(d => d.kind === 'videoinput');
      
      if (videoDevices.length === 0 || !videoDevices.some(d => d.label)) {
        try {
          const probe = await navigator.mediaDevices.getUserMedia({ video: true });
          probe.getTracks().forEach(t => t.stop());
          const refreshed = await navigator.mediaDevices.enumerateDevices();
          videoDevices = refreshed.filter(d => d.kind === 'videoinput');
        } catch (_) {}
      }
      return videoDevices.length > 0 ? videoDevices : [{ deviceId: '', label: 'Camera' }];
    } catch {
      return [{ deviceId: '', label: 'Camera' }];
    }
  }, []);

  const startCamera = useCallback(async (deviceId, idx, camList) => {
    stopCamera();
    setCameraError(null);
    await new Promise(r => setTimeout(r, 120));

    try {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const constraints = deviceId
        ? {
            video: {
              deviceId: { exact: deviceId },
              width: { ideal: 1280 },
              height: { ideal: 960 }
            }
          }
        : {
            video: {
              facingMode: isMobile ? 'environment' : 'user',
              width: { ideal: 1280 },
              height: { ideal: 960 }
            }
          };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(() => {});
        };
      }

      setCameraActive(true);
      setActiveCamIdx(idx);
      setCameras(camList || []);

      const label = (camList?.[idx]?.label || '').toLowerCase();
      setIsMirrored(label.includes('front') || label.includes('user') || label.includes('facetime'));
    } catch (err) {
      console.warn('[PassportCamera] Camera start failed:', err);
      setCameraError('Unable to open camera. Please ensure camera permissions are allowed.');
      setCameraActive(false);
    }
  }, [stopCamera]);

  const handleOpenLiveCamera = async () => {
    setIsCameraOpen(true);
    setCameraError(null);
    const devs = await loadCameraDevices();
    setCameras(devs);
    await startCamera(devs[0]?.deviceId, 0, devs);
  };

  const switchCamera = async () => {
    if (cameras.length < 2) return;
    const nextIdx = (activeCamIdx + 1) % cameras.length;
    await startCamera(cameras[nextIdx]?.deviceId, nextIdx, cameras);
  };

  // ─── Automated One-Tap Capture ────────────────────────────────────────────────
  const handleAutoCapture = async () => {
    const video = videoRef.current;
    if (!video || !cameraActive || isProcessing) return;

    setIsProcessing(true);

    try {
      const vw = video.videoWidth || 1280;
      const vh = video.videoHeight || 960;

      // Target aspect ratio: 3 / 4 (0.75)
      const targetRatio = 3 / 4;
      const srcRatio = vw / vh;

      let cropW, cropH, cropX, cropY;

      if (srcRatio > targetRatio) {
        // Video is wider than 3:4 → crop horizontal center
        cropH = vh;
        cropW = Math.round(vh * targetRatio);
        cropX = Math.round((vw - cropW) / 2);
        cropY = 0;
      } else {
        // Video is taller than 3:4 → crop vertical with top-bias for face
        cropW = vw;
        cropH = Math.round(vw / targetRatio);
        cropX = 0;
        cropY = Math.max(0, Math.round((vh - cropH) * 0.15));
      }

      const targetW = 450;
      const targetH = 600;

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Mirror if front camera
      if (isMirrored) {
        ctx.translate(targetW, 0);
        ctx.scale(-1, 1);
      }

      ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, targetW, targetH);

      stopCamera();
      setIsCameraOpen(false);

      canvas.toBlob((blob) => {
        setIsProcessing(false);
        if (blob) {
          setPhotoBlob(blob);
          if (onPhotoSelected) onPhotoSelected(blob);
        }
      }, 'image/webp', 0.92);

    } catch (err) {
      console.warn('[PassportCamera] Auto-capture failed:', err);
      setIsProcessing(false);
    }
  };

  // ─── File Upload with Auto-Crop ──────────────────────────────────────────────
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const autoPassportBlob = await processPassportPhoto(file, 450, 600, 0.92);
      setPhotoBlob(autoPassportBlob);
      if (onPhotoSelected) onPhotoSelected(autoPassportBlob);
    } catch (err) {
      setPhotoBlob(file);
      if (onPhotoSelected) onPhotoSelected(file);
    }
    e.target.value = '';
  };

  const handleRemovePhoto = () => {
    setPhotoBlob(null);
    if (onPhotoCleared) onPhotoCleared();
  };

  return (
    <div style={{ width: '100%' }}>
      {/* ── 1. ACTIVE LIVE CAMERA VIEW ── */}
      {isCameraOpen ? (
        <div style={{
          background: '#09090B',
          borderRadius: 20,
          padding: '1.25rem 1rem',
          color: '#fff',
          border: '1px solid #27272A',
          boxShadow: '0 12px 36px rgba(0,0,0,0.4)',
          position: 'relative'
        }}>
          {/* Top Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '.75rem',
            padding: '0 .25rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: cameraActive ? '#22C55E' : '#EF4444',
                boxShadow: cameraActive ? '0 0 10px #22C55E' : 'none'
              }}></span>
              <span style={{ fontSize: '.85rem', fontWeight: 700 }}>
                Passport Camera
              </span>
            </div>

            <button
              type="button"
              onClick={() => { stopCamera(); setIsCameraOpen(false); }}
              style={{
                background: '#27272A',
                border: 'none',
                color: '#A1A1AA',
                width: 28,
                height: 28,
                borderRadius: '50%',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '.8rem'
              }}
            >
              <i className="fas fa-times"></i>
            </button>
          </div>

          {/* Viewfinder with Passport Oval Guide */}
          <div style={{
            position: 'relative',
            width: '100%',
            maxWidth: 300,
            aspectRatio: '3 / 4',
            margin: '0 auto',
            borderRadius: 16,
            overflow: 'hidden',
            background: '#000',
            border: '2px solid #3B82F6'
          }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: isMirrored ? 'scaleX(-1)' : 'none'
              }}
            />

            {!cameraActive && !cameraError && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                <i className="fas fa-circle-notch fa-spin" style={{ fontSize: '1.5rem', opacity: .6 }}></i>
              </div>
            )}

            {/* Passport Oval Guidance Overlay */}
            <svg
              viewBox="0 0 300 400"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 4
              }}
            >
              <defs>
                <mask id="passportGuideHole">
                  <rect width="300" height="400" fill="white" />
                  <ellipse cx="150" cy="165" rx="72" ry="92" fill="black" />
                  <path d="M 60 380 Q 150 280 240 380 Z" fill="black" />
                </mask>
              </defs>

              <rect
                width="300"
                height="400"
                fill="rgba(9, 9, 11, 0.45)"
                mask="url(#passportGuideHole)"
              />

              {/* Head Oval Guide */}
              <ellipse
                cx="150"
                cy="165"
                rx="72"
                ry="92"
                fill="none"
                stroke="#3B82F6"
                strokeWidth="2.5"
                strokeDasharray="6 4"
              />

              {/* Shoulders Guide */}
              <path
                d="M 60 380 Q 150 280 240 380"
                fill="none"
                stroke="#38BDF8"
                strokeWidth="2"
                strokeDasharray="4 4"
              />
            </svg>

            {/* Top Guidance Banner */}
            <div style={{
              position: 'absolute',
              top: 10,
              left: 10,
              right: 10,
              background: 'rgba(15, 23, 42, 0.85)',
              color: '#F1F5F9',
              fontSize: '.72rem',
              fontWeight: 600,
              padding: '5px 10px',
              borderRadius: 20,
              textAlign: 'center',
              backdropFilter: 'blur(6px)',
              border: '1px solid rgba(255,255,255,0.1)',
              zIndex: 5
            }}>
              <i className="fas fa-user-circle" style={{ color: '#60A5FA', marginRight: 5 }}></i>
              Align learner's face inside the oval
            </div>

            {cameraError && (
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(9,9,11,0.9)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1.5rem',
                textAlign: 'center',
                zIndex: 8
              }}>
                <i className="fas fa-exclamation-triangle" style={{ fontSize: '2rem', color: '#EF4444', marginBottom: 10 }}></i>
                <div style={{ fontSize: '.85rem', color: '#fff', fontWeight: 600 }}>{cameraError}</div>
              </div>
            )}
          </div>

          {/* Simple Controls */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            marginTop: '1rem'
          }}>
            {/* Switch camera button (if device has multiple) */}
            {cameras.length > 1 && (
              <button
                type="button"
                onClick={switchCamera}
                title="Switch Camera (Front/Back)"
                style={{
                  background: '#27272A',
                  border: 'none',
                  color: '#fff',
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1rem'
                }}
              >
                <i className="fas fa-rotate"></i>
              </button>
            )}

            {/* One-Tap Capture Button */}
            <button
              type="button"
              onClick={handleAutoCapture}
              disabled={!cameraActive || isProcessing}
              style={{
                padding: '.65rem 1.5rem',
                background: '#2563EB',
                color: '#fff',
                border: 'none',
                borderRadius: 12,
                fontWeight: 700,
                fontSize: '.9rem',
                cursor: cameraActive ? 'pointer' : 'not-allowed',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
                opacity: cameraActive ? 1 : 0.6
              }}
            >
              {isProcessing ? (
                <>
                  <i className="fas fa-circle-notch fa-spin"></i>
                  <span>Cropping...</span>
                </>
              ) : (
                <>
                  <i className="fas fa-camera"></i>
                  <span>Capture Photo</span>
                </>
              )}
            </button>
          </div>
        </div>
      ) : photoBlob ? (

        /* ── 2. PHOTO PREVIEW (READY & FORMATTED) ── */
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem',
          padding: '1.25rem',
          background: '#F8FAFC',
          borderRadius: 16,
          border: '1px solid #E2E8F0'
        }}>
          <div style={{ position: 'relative' }}>
            <LearnerPhoto
              photo={photoBlob}
              alt="Learner passport photo"
              gender={gender}
              style={{
                width: 120,
                height: 150,
                borderRadius: 16,
                objectFit: 'cover',
                border: '3px solid #2563EB',
                boxShadow: '0 8px 24px rgba(37, 99, 235, 0.2)'
              }}
            />
            <div style={{
              position: 'absolute',
              bottom: -6,
              right: -6,
              background: '#16A34A',
              color: '#fff',
              borderRadius: '50%',
              width: 26,
              height: 26,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '.75rem',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
              border: '2px solid #fff'
            }}>
              <i className="fas fa-check"></i>
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '.88rem', fontWeight: 700, color: '#0F172A' }}>
              Passport Photo Ready
            </div>
            <div style={{ fontSize: '.75rem', color: '#64748B', marginTop: 2 }}>
              Formatted 3:4 portrait • Fits learner cards & report cards
            </div>
          </div>

          <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={handleOpenLiveCamera}
              style={{
                padding: '.45rem .9rem',
                background: '#09090B',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                fontSize: '.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <i className="fas fa-camera"></i> Retake Photo
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: '.45rem .9rem',
                background: '#F1F5F9',
                color: '#334155',
                border: '1px solid #CBD5E1',
                borderRadius: 10,
                fontSize: '.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <i className="fas fa-upload"></i> Upload File
            </button>
            <button
              type="button"
              onClick={handleRemovePhoto}
              style={{
                padding: '.45rem .9rem',
                background: 'transparent',
                color: '#DC2626',
                border: 'none',
                fontSize: '.8rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (

        /* ── 3. CHOOSE SOURCE BUTTONS (IDLE) ── */
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '.75rem'
        }}>
          {/* Live Passport Camera Button */}
          <div
            onClick={handleOpenLiveCamera}
            style={{
              padding: '1.25rem 1rem',
              background: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)',
              border: '2px dashed #3B82F6',
              borderRadius: 16,
              textAlign: 'center',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <div style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: '#2563EB',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.2rem',
              marginBottom: 8,
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
            }}>
              <i className="fas fa-camera"></i>
            </div>
            <div style={{ fontSize: '.88rem', fontWeight: 800, color: '#1E3A8A' }}>
              Live Camera
            </div>
            <div style={{ fontSize: '.72rem', color: '#3B82F6', marginTop: 2 }}>
              With Head Guide
            </div>
          </div>

          {/* Upload File Button */}
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: '1.25rem 1rem',
              background: '#F8FAFC',
              border: '2px dashed #CBD5E1',
              borderRadius: 16,
              textAlign: 'center',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <div style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: '#F1F5F9',
              color: '#475569',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.2rem',
              marginBottom: 8,
              border: '1px solid #CBD5E1'
            }}>
              <i className="fas fa-cloud-arrow-up"></i>
            </div>
            <div style={{ fontSize: '.88rem', fontWeight: 800, color: '#1E293B' }}>
              Upload Image
            </div>
            <div style={{ fontSize: '.72rem', color: '#64748B', marginTop: 2 }}>
              Auto-Crop to Passport
            </div>
          </div>
        </div>
      )}

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />
    </div>
  );
};

export default PassportPhotoCapture;