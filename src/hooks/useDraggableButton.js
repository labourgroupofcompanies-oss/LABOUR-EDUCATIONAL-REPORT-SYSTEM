/**
 * useDraggableButton.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Smooth Draggable Floating Button Hook
 *
 * Enables free dragging of floating launcher buttons on both desktop (mouse)
 * and mobile (touch) screens, preventing accidental button clicks on drag,
 * clamping within viewport edges, and persisting custom placement in localStorage.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useRef, useEffect, useCallback } from 'react';

export const useDraggableButton = (storageKey = 'copilot_button_pos') => {
  const buttonRef = useRef(null);
  const dragInfoRef = useRef({
    isDragging: false,
    hasMoved: false,
    startX: 0,
    startY: 0,
    initialLeft: 0,
    initialTop: 0
  });

  // Load saved coordinates if available
  const [position, setPosition] = useState(() => {
    try {
      if (typeof window === 'undefined') return null;
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          return parsed;
        }
      }
    } catch (_) {}
    return null;
  });

  const [isActivelyDragging, setIsActivelyDragging] = useState(false);

  // Clamp position to viewport bounds
  const clampCoordinates = useCallback((x, y) => {
    const btn = buttonRef.current;
    const width = btn ? btn.offsetWidth : 54;
    const height = btn ? btn.offsetHeight : 54;
    const padding = 12;

    const minX = padding;
    const maxX = Math.max(minX, window.innerWidth - width - padding);
    const minY = padding;
    const maxY = Math.max(minY, window.innerHeight - height - padding);

    return {
      x: Math.min(Math.max(x, minX), maxX),
      y: Math.min(Math.max(y, minY), maxY)
    };
  }, []);

  // Re-clamp position on window resize
  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => {
        if (!prev) return null;
        return clampCoordinates(prev.x, prev.y);
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [clampCoordinates]);

  // Pointer Down (Mouse or Touch)
  const startDrag = useCallback((clientX, clientY) => {
    const btn = buttonRef.current;
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    dragInfoRef.current = {
      isDragging: true,
      hasMoved: false,
      startX: clientX,
      startY: clientY,
      initialLeft: rect.left,
      initialTop: rect.top
    };
  }, []);

  // Pointer Move (Mouse or Touch)
  const onMove = useCallback((clientX, clientY) => {
    const info = dragInfoRef.current;
    if (!info.isDragging) return;

    const dx = clientX - info.startX;
    const dy = clientY - info.startY;
    const distance = Math.hypot(dx, dy);

    // If moved more than 6 pixels, enter drag state
    if (!info.hasMoved && distance > 6) {
      info.hasMoved = true;
      setIsActivelyDragging(true);
    }

    if (info.hasMoved) {
      const newX = info.initialLeft + dx;
      const newY = info.initialTop + dy;
      const clamped = clampCoordinates(newX, newY);
      setPosition(clamped);
    }
  }, [clampCoordinates]);

  // Pointer Up / End
  const endDrag = useCallback(() => {
    const info = dragInfoRef.current;
    if (!info.isDragging) return;

    if (info.hasMoved && position) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(position));
      } catch (_) {}
    }

    info.isDragging = false;
    // Keep isActivelyDragging slightly to prevent immediate onClick firing
    setTimeout(() => {
      setIsActivelyDragging(false);
      info.hasMoved = false;
    }, 50);
  }, [position, storageKey]);

  // Mouse Listeners
  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return; // Only primary mouse button
    startDrag(e.clientX, e.clientY);

    const handleMouseMove = (moveEvt) => {
      onMove(moveEvt.clientX, moveEvt.clientY);
    };

    const handleMouseUp = () => {
      endDrag();
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [startDrag, onMove, endDrag]);

  // Touch Listeners
  const handleTouchStart = useCallback((e) => {
    if (!e.touches || e.touches.length === 0) return;
    const touch = e.touches[0];
    startDrag(touch.clientX, touch.clientY);

    const handleTouchMove = (moveEvt) => {
      if (!moveEvt.touches || moveEvt.touches.length === 0) return;
      const t = moveEvt.touches[0];
      onMove(t.clientX, t.clientY);
    };

    const handleTouchEnd = () => {
      endDrag();
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };

    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);
  }, [startDrag, onMove, endDrag]);

  // Check if click should be prevented because user was dragging
  const preventClickIfDragged = useCallback((e) => {
    if (dragInfoRef.current.hasMoved || isActivelyDragging) {
      e.preventDefault();
      e.stopPropagation();
      return true;
    }
    return false;
  }, [isActivelyDragging]);

  // Reset to default corner placement
  const resetPosition = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch (_) {}
    setPosition(null);
  }, [storageKey]);

  return {
    buttonRef,
    position,
    isActivelyDragging,
    handleMouseDown,
    handleTouchStart,
    preventClickIfDragged,
    resetPosition
  };
};

export default useDraggableButton;
