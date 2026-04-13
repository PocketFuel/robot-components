'use client';

import { useEffect, useRef, type MutableRefObject } from 'react';

export type MagnifierGridOcclusionProps = {
  mousePosRef: MutableRefObject<{ x: number; y: number } | null>;
  radius: number;
  theme: 'dark' | 'light';
};

/**
 * Paints the page background color over the dot grid in a circle under the lens,
 * so only the magnified resample (drawn above) reads as “through the glass”.
 */
export const MagnifierGridOcclusion = ({ mousePosRef, radius, theme }: MagnifierGridOcclusionProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = mousePosRef;
  const themeRef = useRef(theme);
  themeRef.current = theme;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const rafRef = { id: 0 };
    const resolveBg = (): string => {
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--app-bg').trim();
      if (raw && (raw.startsWith('#') || raw.startsWith('rgb'))) return raw;
      return themeRef.current === 'light' ? '#f7f7f7' : '#171717';
    };

    const tick = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        rafRef.id = requestAnimationFrame(tick);
        return;
      }
      const w = canvas.width;
      const h = canvas.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const pos = mouseRef.current;
      if (!pos || radius < 4) {
        rafRef.id = requestAnimationFrame(tick);
        return;
      }

      /** Slightly larger than the lens to hide grid anti-alias at the rim */
      const R = radius + 2;
      ctx.fillStyle = resolveBg();
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, R, 0, Math.PI * 2);
      ctx.fill();

      rafRef.id = requestAnimationFrame(tick);
    };

    rafRef.id = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(rafRef.id);
    };
  }, [radius, theme]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 3,
      }}
    />
  );
};
