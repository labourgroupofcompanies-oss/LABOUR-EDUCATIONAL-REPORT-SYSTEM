import React, { useState, useEffect } from "react";

/**
 * LearnerPhoto
 * Safely renders a student photo from any source:
 *   - A local Blob (IndexedDB blob field) → creates an ObjectURL, cleans up on unmount
 *   - A remote HTTP/HTTPS URL string → uses directly as <img src>
 *   - A legacy Base64 data: string → uses directly (backward compat)
 *   - null / undefined → shows an initials-based avatar placeholder
 */
const LearnerPhoto = ({ photo, alt = "", className = "", style = {} }) => {
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
          .map((n) => n[0])
          .join("")
          .slice(0, 2)
          .toUpperCase()
      : "?";
    return (
      <div
        className={className}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #e2e8f0, #cbd5e1)",
          color: "#64748b",
          fontSize: "1rem",
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
