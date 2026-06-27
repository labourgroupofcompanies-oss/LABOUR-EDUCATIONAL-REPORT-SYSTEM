import React, { useState, useEffect } from "react";

/**
 * LearnerPhoto
 * Safely renders a student photo from any source:
 *   - A local Blob (IndexedDB blob field) → creates an ObjectURL, cleans up on unmount
 *   - A remote HTTP/HTTPS URL string → uses directly as <img src>
 *   - A legacy Base64 data: string → uses directly (backward compat)
 *   - null / undefined → shows a beautiful gender-aware initials placeholder
 */
const LearnerPhoto = ({ photo, alt = "", gender = "", className = "", style = {} }) => {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    if (!photo) {
      setSrc(null);
      return;
    }

    if (photo instanceof Blob) {
      const url = URL.createObjectURL(photo);
      setSrc(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    }

    if (typeof photo === "string") {
      setSrc(photo);
    } else {
      setSrc(null);
    }
  }, [photo]);

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
          ...style,
        }}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt || "Student Photo"}
      className={className}
      style={style}
    />
  );
};

export default LearnerPhoto;
