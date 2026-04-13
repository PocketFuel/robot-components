'use client';

import { useEffect, useRef } from 'react';

export type MagnifierLensProps = {
  sourceCanvas: HTMLCanvasElement | null;
  mousePos: { x: number; y: number } | null;
  /** Radius in CSS pixels */
  radius?: number;
  /** Zoom factor inside the lens (>1 = magnification) */
  zoom?: number;
};

/**
 * Full-viewport overlay canvas: draws a circular magnified sample of `sourceCanvas`
 * centered on the cursor. Main grid canvas stays pointer-events: none underneath.
 */
export const MagnifierLens = ({
  sourceCanvas,
  mousePos,
  radius = 110,
  zoom = 2.25,
}: MagnifierLensProps) => {
  const lensRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef(mousePos);
  const srcRef = useRef(sourceCanvas);
  mouseRef.current = mousePos;
  srcRef.current = sourceCanvas;

  useEffect(() => {
    const lens = lensRef.current;
    if (!lens) return;

    const resize = () => {
      lens.width = window.innerWidth;
      lens.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const rafRef = { id: 0 };
    const tick = () => {
      const ctx = lens.getContext('2d');
      if (!ctx) {
        rafRef.id = requestAnimationFrame(tick);
        return;
      }
      const src = srcRef.current;
      const pos = mouseRef.current;
      const w = lens.width;
      const h = lens.height;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);

      if (!src || !pos || src.width < 8 || src.height < 8) {
        rafRef.id = requestAnimationFrame(tick);
        return;
      }

      const mx = pos.x;
      const my = pos.y;
      const R = radius;
      const z = Math.max(1.05, zoom);
      const halfSpan = R / z;
      let sx = mx - halfSpan;
      let sy = my - halfSpan;
      const sSize = (2 * R) / z;
      sx = Math.max(0, Math.min(src.width - sSize, sx));
      sy = Math.max(0, Math.min(src.height - sSize, sy));

      ctx.save();
      ctx.beginPath();
      ctx.arc(mx, my, R, 0, Math.PI * 2);
      ctx.clip();
      try {
        ctx.drawImage(src, sx, sy, sSize, sSize, mx - R, my - R, 2 * R, 2 * R);
      } catch {
        // ignore readback edge cases
      }
      ctx.restore();

      ctx.beginPath();
      ctx.arc(mx, my, R + 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(mx - R * 0.38, my - R * 0.4, R * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(mx + R * 0.25, my + R * 0.32, R * 0.08, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.fill();

      rafRef.id = requestAnimationFrame(tick);
    };

    rafRef.id = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(rafRef.id);
    };
  }, [radius, zoom]);

  return (
    <canvas
      ref={lensRef}
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 2,
      }}
    />
  );
};
