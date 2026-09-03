import React, { useState, useEffect } from "react";

/**
 * LearnerPhoto
 * Safely renders a student photo from any source with dual-tier support:
 *   - A local Blob (IndexedDB blob field) → creates an ObjectURL, cleans up on unmount
 *   - A remote HTTP/HTTPS URL string → uses directly as <img src>
 *   - A legacy Base64 data: string → uses directly (backward compat)
 *   - null / undefined → shows a beautiful gender-aware initials placeholder
 *
 * Dual-tier props:
 *   - photo:     Full-resolution Blob, URL, or legacy Base64 string
 *   - thumbnail: Micro-thumbnail Blob or URL (optional)
 *   - size:      'thumb' | 'full' | 'auto' (default: 'auto')
 *                'thumb' → prefer thumbnail, fallback to photo
 *                'full'  → always use photo
 *                'auto'  → use thumbnail if available, else photo
 */
const LearnerPhoto = ({ photo, thumbnail, size = "auto", alt = "", gender = "", className = "", style = {} }) => {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    // Determine which source to use based on size prop
    let activeSource = null;

    if (size === "full") {
      activeSource = photo || null;
    } else if (size === "thumb") {
      activeSource = thumbnail || photo || null;
    } else {
      // auto: prefer thumbnail when available
      activeSource = thumbnail || photo || null;
    }

    if (!activeSource) {
      setSrc(null);
      return;
    }

    if (activeSource instanceof Blob) {
      const url = URL.createObjectURL(activeSource);
      setSrc(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    }

    if (typeof activeSource === "string") {
      setSrc(activeSource);
    } else {
      setSrc(null);
    }
  }, [photo, thumbnail, size]);

  if (!src) {
    const initials = alt
      ? alt
          .split(" ")
          .filter(Boolean)
          .map((n) => n[0])
          .join("")
          .slice(0, 2)
          .toUpperCase()
      : "?";

    // Premium gender-aware backgrounds
    let bg = "linear-gradient(135deg, #f1f5f9, #cbd5e1)";
    let textColor = "#475569";
    
    const cleanGender = String(gender).toLowerCase();
    if (cleanGender === "female") {
      bg = "linear-gradient(135deg, #fff1f2, #fecdd3)"; // Soft rose gradient
      textColor = "#db2777"; // Rose-600
    } else if (cleanGender === "male") {
      bg = "linear-gradient(135deg, #eff6ff, #bfdbfe)"; // Soft blue gradient
      textColor = "#2563eb"; // Blue-600
    }

    return (
      <div
        className={className}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: bg,
          color: textColor,
          fontWeight: 700,
          boxSizing: "border-box",
          ...style,
        }}
      >
        {initials}
      </div>
    );
  }

  const imgStyle = {
    objectFit: "cover",
    objectPosition: "center top",
    boxSizing: "border-box",
    ...style,
  };

  // Only set default 100% width/height if no className AND no explicit inline size were provided
  if (!className && !style.width && !style.height) {
    imgStyle.width = "100%";
    imgStyle.height = "100%";
  }

  return (
    <img
      src={src}
      alt={alt || "Student Photo"}
      className={className}
      style={imgStyle}
    />
  );
};

export default LearnerPhoto;

