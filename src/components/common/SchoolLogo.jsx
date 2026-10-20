import React, { useState, useEffect } from 'react';
import { db } from '../../lib/db';
import { downloadImageAsBlob } from '../../utils/imageUtils';

/**
 * SchoolLogo
 * 
 * Bulletproof, offline-first school crest/logo component.
 * Features:
 *  - Supports binary Blob from IndexedDB (`logoBlob`), creating an ObjectURL and safely revoking it on unmount.
 *  - Supports remote URL (`logoUrl`, `logo_url`, `src`).
 *  - Prevents broken image icons: if network fails, CORS blocks, or image 404s, `onError` gracefully switches to fallback.
 *  - Ignores stale `blob:` URLs across reloads.
 *  - Resolves school from `school` prop, or automatically looks up from Dexie by `schoolId`.
 *  - Background self-healing: if an HTTP logoUrl loads and no `logoBlob` is cached, downloads and saves the Blob in IndexedDB.
 */
const SchoolLogo = ({
  school = null,
  schoolId = null,
  src: explicitSrc = null,
  alt = '',
  className = '',
  style = {},
  fallback = null,
  fallbackClassName = '',
  fallbackStyle = {},
  imgStyle = {}
}) => {
  const [resolvedSchool, setResolvedSchool] = useState(school);
  const [imgSrc, setImgSrc] = useState(null);
  const [hasError, setHasError] = useState(false);

  // Sync or look up school if schoolId is provided without school object
  useEffect(() => {
    let isMounted = true;
    if (school) {
      setResolvedSchool(school);
    } else if (schoolId) {
      db.schools.get(schoolId).then(s => {
        if (isMounted) setResolvedSchool(s || null);
      }).catch(() => {});
    } else {
      setResolvedSchool(null);
    }
    return () => { isMounted = false; };
  }, [school, schoolId]);

  // Determine active logo source (Blob > DataURL > Remote URL)
  const activeSource = explicitSrc || resolvedSchool?.logoBlob || resolvedSchool?.logoUrl || resolvedSchool?.logo_url || null;

  useEffect(() => {
    setHasError(false);

    if (!activeSource) {
      setImgSrc(null);
      return;
    }

    // 1. Binary Blob: Instant offline rendering via ObjectURL
    if (activeSource instanceof Blob) {
      const objectUrl = URL.createObjectURL(activeSource);
      setImgSrc(objectUrl);
      return () => {
        URL.revokeObjectURL(objectUrl);
      };
    }

    // 2. String (URL or Data URI)
    if (typeof activeSource === 'string' && activeSource.trim().length > 0) {
      // Reject stale blob: URLs that cannot be accessed across reloads
      if (activeSource.startsWith('blob:')) {
        setHasError(true);
        setImgSrc(null);
        return;
      }

      setImgSrc(activeSource);

      // Self-heal: If it's a valid remote HTTP URL and we don't have a local Blob yet, download & cache
      if (
        navigator.onLine &&
        activeSource.startsWith('http') &&
        resolvedSchool?.id &&
        !resolvedSchool.logoBlob
      ) {
        downloadImageAsBlob(activeSource, 400).then(blob => {
          if (blob && resolvedSchool.id) {
            db.schools.update(resolvedSchool.id, { logoBlob: blob }).catch(() => {});
          }
        }).catch(() => {});
      }
    } else {
      setImgSrc(null);
    }
  }, [activeSource, resolvedSchool?.id, resolvedSchool?.logoBlob]);

  // Clean fallback when there's an error or no valid source
  if (hasError || !imgSrc) {
    if (fallback) return fallback;
    return (
      <div
        className={fallbackClassName || className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          ...fallbackStyle,
          ...style
        }}
        title={alt || resolvedSchool?.name || 'School Logo'}
      >
        <i className="fas fa-school" />
      </div>
    );
  }

  return (
    <img
      src={imgSrc}
      alt={alt || resolvedSchool?.name || 'School Logo'}
      className={className}
      style={{
        objectFit: 'cover',
        ...imgStyle,
        ...style
      }}
      onError={() => {
        setHasError(true);
      }}
    />
  );
};

export default SchoolLogo;
