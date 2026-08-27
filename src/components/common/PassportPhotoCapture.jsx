import React, { useState, useRef, useEffect, useCallback } from 'react';
import LearnerPhoto from './LearnerPhoto';

/**
 * PassportPhotoCapture
 * 
 * Studio-grade passport photo capture & crop tool.
 * Features:
 *  1. Live Camera with Head & Shoulders Alignment Oval & crosshairs guide
 *  2. Digital Zoom (1x - 3x) for distance compensation
 *  3. Front / Back camera switching
 *  4. 3-second pose countdown timer
 *  5. Interactive Crop, Zoom, Pan & Rotate editor for perfect framing
 *  6. Seamless integration with file upload & existing photos
 */
const PassportPhotoCapture = ({
  currentPhoto = null,
  gender = 'Male',
  onPhotoSelected,
  onPhotoCleared
}) => {
  const [mode, setMode] = useState(currentPhoto ? 'preview' : 'idle');
  const [photoBlob, setPhotoBlob] = useState(currentPhoto);

  const [cameras, setCameras] = useState([]);
  const [activeCamIdx, setActiveCamIdx] = useState(0);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [isMirrored, setIsMirrored] = useState(false);
  const [digitalZoom, setDigitalZoom] = useState(1.0);
  const [countdown, setCountdown] = useState(null);
  const [isFlashing, setIsFlashing] = useState(false);

  const [rawImageSrc, setRawImageSrc] = useState(null);
  const [cropZoom, setCropZoom] = useState(1.0);
  const [cropPan, setCropPan] = useState({ x: 0, y: 0 });
  const [cropRotation, setCropRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageElementRef = useRef(null);

  useEffect(() => {
    if (currentPhoto && !photoBlob) {
      setPhotoBlob(currentPhoto);
      setMode('preview');
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
      return videoDevices.length > 0 ? videoDevices : [{ deviceId: '', label: 'Default Camera' }];
    } catch {
      return [{ deviceId: '', label: 'Default Camera' }];
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
      console.warn('[PassportCamera] Camera init failed:', err);
      setCameraError('Unable to access camera. Please check browser permissions.');
      setCameraActive(false);
    }
  }, [stopCamera]);

  const handleOpenLiveCamera = async () => {
    setMode('camera');
    setDigitalZoom(1.0);
    setCameraError(null);
    const devs = await loadCameraDevices();
    setCameras(devs);
    await startCamera(devs[0]?.deviceId, 0, devs);
  };

  const switchCamera = async (direction) => {
    if (cameras.length < 2) return;
    const nextIdx = (activeCamIdx + direction + cameras.length) % cameras.length;
    await startCamera(cameras[nextIdx]?.deviceId, nextIdx, cameras);
  };

  const triggerCapture = () => {
    if (countdown !== null) return;
    executeCapture();
  };

  const triggerCountdownCapture = () => {
    if (countdown !== null) return;
    setCountdown(3);
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev === 1) {
          clearInterval(timer);
          setTimeout(() => {
            executeCapture();
            setCountdown(null);
          }, 400);
          return '📸';
        }
        return prev - 1;
      });
    }, 900);
  };

  const executeCapture = () => {
    const video = videoRef.current;
    if (!video || !cameraActive) return;

    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 200);

    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;

    const canvas = document.createElement('canvas');
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext('2d');

    if (isMirrored) {
      ctx.translate(vw, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, vw, vh);

    const capturedDataUrl = canvas.toDataURL('image/jpeg', 0.95);
    stopCamera();

    setRawImageSrc(capturedDataUrl);
    setCropZoom(digitalZoom);
    setCropPan({ x: 0, y: 0 });
    setCropRotation(0);
    setMode('crop');
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setRawImageSrc(reader.result);
      setCropZoom(1.0);
      setCropPan({ x: 0, y: 0 });
      setCropRotation(0);
      setMode('crop');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handlePointerDown = (e) => {
    setIsDragging(true);
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    setDragStart({ x: clientX - cropPan.x, y: clientY - cropPan.y });
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    setCropPan({
      x: clientX - dragStart.x,
      y: clientY - dragStart.y
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const handleRotate = () => {
    setCropRotation(prev => (prev + 90) % 360);
  };

  const applyCropAndConfirm = async () => {
    if (!rawImageSrc) return;

    try {
      const img = new Image();
      img.src = rawImageSrc;
      await new Promise(r => { img.onload = r; });

      const targetW = 450;
      const targetH = 600;

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(0, 0, targetW, targetH);

      ctx.save();
      ctx.translate(targetW / 2 + cropPan.x * 1.5, targetH / 2 + cropPan.y * 1.5);
      ctx.rotate((cropRotation * Math.PI) / 180);

      const isRotated90 = cropRotation % 180 !== 0;
      const effectiveImgW = isRotated90 ? img.height : img.width;
      const effectiveImgH = isRotated90 ? img.width : img.height;

      const scale = Math.max(targetW / effectiveImgW, targetH / effectiveImgH) * cropZoom;
      const drawW = img.width * scale;
      const drawH = img.height * scale;

      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        setPhotoBlob(blob);
        setMode('preview');
        if (onPhotoSelected) {
          onPhotoSelected(blob);
        }
      }, 'image/webp', 0.92);

    } catch (err) {
      console.warn('[PassportCamera] Error cropping photo:', err);
    }
  };

  const handleClearPhoto = () => {
    setPhotoBlob(null);
    setRawImageSrc(null);
    setMode('idle');
    if (onPhotoCleared) {
      onPhotoCleared();
    }
  };

  return (
    <div style={{ width: '100%' }}>
      {mode === 'preview' && photoBlob ? (
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
              Formatted 3:4 portrait • Fits learner cards & report cards perfectly
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
              <i className="fas fa-camera"></i> Retake
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
              <i className="fas fa-upload"></i> Upload Another
            </button>
            <button
              type="button"
              onClick={handleClearPhoto}
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
      ) : mode === 'camera' ? (
        <div style={{
          background: '#09090B',
          borderRadius: 20,
          padding: '1.25rem 1rem',
          color: '#fff',
          border: '1px solid #27272A',
          boxShadow: '0 12px 36px rgba(0,0,0,0.4)',
          position: 'relative'
        }}>
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
              <span style={{ fontSize: '.85rem', fontWeight: 700, letterSpacing: '.02em' }}>
                Passport Studio Camera
              </span>
            </div>

            <button
              type="button"
              onClick={() => { stopCamera(); setMode('idle'); }}
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

          <div style={{
            position: 'relative',
            width: '100%',
            maxWidth: 320,
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
                transform: `${isMirrored ? 'scaleX(-1)' : 'scaleX(1)'} scale(${digitalZoom})`,
                transition: 'transform 0.15s ease-out'
              }}
            />

            {isFlashing && (
              <div style={{
                position: 'absolute',
                inset: 0,
                background: '#fff',
                opacity: 0.9,
                zIndex: 10
              }}></div>
            )}

            {countdown !== null && (
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,0,0,0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '4rem',
                fontWeight: 900,
                color: '#FBBF24',
                zIndex: 9,
                textShadow: '0 4px 20px rgba(0,0,0,0.8)'
              }}>
                {countdown}
              </div>
            )}

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
                <mask id="passportHole">
                  <rect width="300" height="400" fill="white" />
                  <ellipse cx="150" cy="165" rx="72" ry="92" fill="black" />
                  <path d="M 60 380 Q 150 280 240 380 Z" fill="black" />
                </mask>
              </defs>

              <rect
                width="300"
                height="400"
                fill="rgba(9, 9, 11, 0.45)"
                mask="url(#passportHole)"
              />

              <ellipse
                cx="150"
                cy="165"
                rx="72"
                ry="92"
                fill="none"
                stroke="#3B82F6"
                strokeWidth="2.5"
                strokeDasharray="6 4"
                opacity="0.9"
              />

              <path
                d="M 60 380 Q 150 280 240 380"
                fill="none"
                stroke="#38BDF8"
                strokeWidth="2"
                strokeDasharray="4 4"
                opacity="0.75"
              />

              <line x1="85" y1="150" x2="215" y2="150" stroke="#FBBF24" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
              <line x1="150" y1="80" x2="150" y2="250" stroke="#FBBF24" strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
            </svg>

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
              Fit head in oval & shoulders on line
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
                <button
                  type="button"
                  onClick={handleOpenLiveCamera}
                  style={{
                    marginTop: 12,
                    padding: '.45rem 1rem',
                    background: '#2563EB',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: '.8rem',
                    cursor: 'pointer'
                  }}
                >
                  Retry Camera
                </button>
              </div>
            )}
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            marginTop: '.75rem',
            background: 'rgba(255,255,255,0.05)',
            padding: '6px 12px',
            borderRadius: 12,
            maxWidth: 320,
            margin: '.75rem auto 0'
          }}>
            <span style={{ fontSize: '.72rem', color: '#A1A1AA', fontWeight: 600 }}>Zoom:</span>
            {[1.0, 1.4, 1.8, 2.2].map(z => (
              <button
                key={z}
                type="button"
                onClick={() => setDigitalZoom(z)}
                style={{
                  padding: '3px 8px',
                  background: digitalZoom === z ? '#2563EB' : 'transparent',
                  color: digitalZoom === z ? '#fff' : '#A1A1AA',
                  border: digitalZoom === z ? 'none' : '1px solid #3F3F46',
                  borderRadius: 6,
                  fontSize: '.72rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {z.toFixed(1)}x
              </button>
            ))}
            <input
              type="range"
              min="1.0"
              max="2.5"
              step="0.1"
              value={digitalZoom}
              onChange={e => setDigitalZoom(parseFloat(e.target.value))}
              style={{ width: 70, cursor: 'pointer', accentColor: '#3B82F6' }}
            />
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1.25rem',
            marginTop: '1rem'
          }}>
            <button
              type="button"
              onClick={() => setIsMirrored(prev => !prev)}
              title="Flip Horizontal"
              style={{
                background: isMirrored ? '#3B82F6' : '#27272A',
                border: 'none',
                color: '#fff',
                width: 40,
                height: 40,
                borderRadius: '50%',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '.9rem'
              }}
            >
              <i className="fas fa-arrows-left-right"></i>
            </button>

            <button
              type="button"
              onClick={triggerCapture}
              disabled={!cameraActive}
              title="Capture Photo"
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: '#fff',
                border: '4px solid #3B82F6',
                boxShadow: '0 0 20px rgba(59, 130, 246, 0.6)',
                cursor: cameraActive ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'transform 0.1s',
                opacity: cameraActive ? 1 : 0.5
              }}
            >
              <div style={{
                width: 46,
                height: 46,
                borderRadius: '50%',
                background: '#2563EB'
              }}></div>
            </button>

            <button
              type="button"
              onClick={triggerCountdownCapture}
              title="3-Second Timer"
              style={{
                background: '#27272A',
                border: 'none',
                color: '#FBBF24',
                width: 40,
                height: 40,
                borderRadius: '50%',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '.9rem'
              }}
            >
              <i className="fas fa-stopwatch"></i>
            </button>

            {cameras.length > 1 && (
              <button
                type="button"
                onClick={() => switchCamera(1)}
                title="Switch Camera (Front/Back)"
                style={{
                  background: '#27272A',
                  border: 'none',
                  color: '#fff',
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '.9rem'
                }}
              >
                <i className="fas fa-rotate"></i>
              </button>
            )}
          </div>
        </div>
      ) : mode === 'crop' && rawImageSrc ? (
        <div style={{
          background: '#FFFFFF',
          borderRadius: 20,
          padding: '1.25rem',
          border: '1px solid #E2E8F0',
          boxShadow: '0 10px 30px rgba(0,0,0,0.08)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '.75rem'
          }}>
            <div>
              <div style={{ fontSize: '.9rem', fontWeight: 800, color: '#0F172A' }}>
                Adjust & Frame Photo
              </div>
              <div style={{ fontSize: '.75rem', color: '#64748B' }}>
                Drag to center face inside the oval • Zoom to fit
              </div>
            </div>
            <button
              type="button"
              onClick={handleRotate}
              title="Rotate 90 degrees"
              style={{
                padding: '.35rem .7rem',
                background: '#F1F5F9',
                border: '1px solid #CBD5E1',
                borderRadius: 8,
                fontSize: '.75rem',
                fontWeight: 600,
                color: '#334155',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5
              }}
            >
              <i className="fas fa-rotate-right"></i> Rotate
            </button>
          </div>

          <div
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 280,
              aspectRatio: '3 / 4',
              margin: '0 auto',
              borderRadius: 16,
              overflow: 'hidden',
              background: '#0F172A',
              border: '2px solid #2563EB',
              cursor: isDragging ? 'grabbing' : 'grab',
              userSelect: 'none',
              touchAction: 'none'
            }}
          >
            <img
              ref={imageElementRef}
              src={rawImageSrc}
              alt="Raw capture"
              draggable={false}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                transform: `translate(${cropPan.x}px, ${cropPan.y}px) scale(${cropZoom}) rotate(${cropRotation}deg)`,
                transformOrigin: 'center center',
                transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                pointerEvents: 'none'
              }}
            />

            <svg
              viewBox="0 0 300 400"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 2
              }}
            >
              <defs>
                <mask id="cropMask">
                  <rect width="300" height="400" fill="white" />
                  <ellipse cx="150" cy="165" rx="72" ry="92" fill="black" />
                </mask>
              </defs>
              <rect
                width="300"
                height="400"
                fill="rgba(15, 23, 42, 0.4)"
                mask="url(#cropMask)"
              />
              <ellipse
                cx="150"
                cy="165"
                rx="72"
                ry="92"
                fill="none"
                stroke="#2563EB"
                strokeWidth="2.5"
                strokeDasharray="6 4"
              />
            </svg>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            marginTop: '1rem',
            padding: '0 .5rem'
          }}>
            <i className="fas fa-magnifying-glass-minus" style={{ color: '#64748B', fontSize: '.85rem' }}></i>
            <input
              type="range"
              min="0.8"
              max="3.0"
              step="0.05"
              value={cropZoom}
              onChange={e => setCropZoom(parseFloat(e.target.value))}
              style={{ flex: 1, maxWidth: 200, accentColor: '#2563EB', cursor: 'pointer' }}
            />
            <i className="fas fa-magnifying-glass-plus" style={{ color: '#64748B', fontSize: '.85rem' }}></i>
            <span style={{ fontSize: '.75rem', fontWeight: 700, color: '#334155', minWidth: 32 }}>
              {cropZoom.toFixed(1)}x
            </span>
          </div>

          <div style={{
            display: 'flex',
            gap: '.6rem',
            marginTop: '1.25rem',
            justifyContent: 'center'
          }}>
            <button
              type="button"
              onClick={handleOpenLiveCamera}
              style={{
                flex: 1,
                padding: '.6rem',
                background: '#F1F5F9',
                border: '1px solid #CBD5E1',
                borderRadius: 10,
                fontWeight: 700,
                fontSize: '.85rem',
                color: '#475569',
                cursor: 'pointer'
              }}
            >
              <i className="fas fa-redo" style={{ marginRight: 6 }}></i> Retake
            </button>
            <button
              type="button"
              onClick={applyCropAndConfirm}
              style={{
                flex: 1.5,
                padding: '.6rem',
                background: '#2563EB',
                border: 'none',
                borderRadius: 10,
                fontWeight: 700,
                fontSize: '.85rem',
                color: '#FFFFFF',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
              }}
            >
              <i className="fas fa-check" style={{ marginRight: 6 }}></i> Use This Photo
            </button>
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '.75rem'
        }}>
          <div
            onClick={handleOpenLiveCamera}
            style={{
              padding: '1.25rem 1rem',
              background: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)',
              border: '2px dashed #3B82F6',
              borderRadius: 16,
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
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
              Live Passport Camera
            </div>
            <div style={{ fontSize: '.72rem', color: '#3B82F6', marginTop: 2 }}>
              With Head Guide & Zoom
            </div>
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: '1.25rem 1rem',
              background: '#F8FAFC',
              border: '2px dashed #CBD5E1',
              borderRadius: 16,
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
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
              Upload Image File
            </div>
            <div style={{ fontSize: '.72rem', color: '#64748B', marginTop: 2 }}>
              Auto-Crop to Passport
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  );
};

export default PassportPhotoCapture;