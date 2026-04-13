'use client';

import { useEffect, useRef, type MutableRefObject } from 'react';

export type MagnifierLensProps = {
  sourceCanvas: HTMLCanvasElement | null;
  mousePosRef: MutableRefObject<{ x: number; y: number } | null>;
  /** Radius in CSS pixels */
  radius?: number;
  /** Zoom factor inside the lens (>1 = magnification) */
  zoom?: number;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Overlay canvas: one clean magnified sample + light glass accents (fixed screen light).
 * Uses a supersampled intermediate blit to reduce upscale blur; no multi-layer stack.
 */
export const MagnifierLens = ({
  sourceCanvas,
  mousePosRef,
  radius = 64,
  zoom = 1.25,
}: MagnifierLensProps) => {
  const lensRef = useRef<HTMLCanvasElement>(null);
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = mousePosRef;
  const srcRef = useRef(sourceCanvas);
  srcRef.current = sourceCanvas;

  useEffect(() => {
    const lens = lensRef.current;
    if (!lens) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      lens.width = Math.floor(window.innerWidth * dpr);
      lens.height = Math.floor(window.innerHeight * dpr);
      lens.style.width = `${window.innerWidth}px`;
      lens.style.height = `${window.innerHeight}px`;
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
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      if (!src || !pos || src.width < 8 || src.height < 8) {
        rafRef.id = requestAnimationFrame(tick);
        return;
      }

      const mx = pos.x;
      const my = pos.y;
      const R = radius;
      const z = Math.max(1.05, zoom);

      const lightX = window.innerWidth * 0.22;
      const lightY = window.innerHeight * 0.16;
      let tlx = lightX - mx;
      let tly = lightY - my;
      const tlen = Math.hypot(tlx, tly) || 1;
      tlx /= tlen;
      tly /= tlen;

      const destX = mx - R;
      const destY = my - R;
      const destW = 2 * R;
      const destH = 2 * R;

      const halfSpan = R / z;
      const sSize = halfSpan * 2;
      let sx = mx - halfSpan;
      let sy = my - halfSpan;
      sx = clamp(sx, 0, src.width - sSize);
      sy = clamp(sy, 0, src.height - sSize);

      /** Intermediate at 2× side: upscale in denser buffer, then scale once into the lens (sharper than one big jump). */
      const superK = 2;
      const iw = Math.ceil(destW * superK);
      let scratch = scratchRef.current;
      if (!scratch || scratch.width !== iw || scratch.height !== iw) {
        scratch = document.createElement('canvas');
        scratch.width = iw;
        scratch.height = iw;
        scratchRef.current = scratch;
      }
      const ictx = scratch.getContext('2d');
      if (!ictx) {
        rafRef.id = requestAnimationFrame(tick);
        return;
      }
      ictx.imageSmoothingEnabled = true;
      ictx.imageSmoothingQuality = 'high';
      ictx.clearRect(0, 0, iw, iw);
      try {
        ictx.drawImage(src, sx, sy, sSize, sSize, 0, 0, iw, iw);
      } catch {
        // ignore
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(mx, my, R, 0, Math.PI * 2);
      ctx.clip();

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      try {
        ctx.drawImage(scratch, 0, 0, iw, iw, destX, destY, destW, destH);
      } catch {
        try {
          ctx.drawImage(src, sx, sy, sSize, sSize, destX, destY, destW, destH);
        } catch {
          // ignore
        }
      }

      /** Very light depth tint — keep grid lines crisp */
      const innerGlow = ctx.createRadialGradient(mx, my, R * 0.12, mx, my, R * 0.92);
      innerGlow.addColorStop(0, 'rgba(80, 140, 255, 0.045)');
      innerGlow.addColorStop(0.55, 'rgba(40, 90, 200, 0.02)');
      innerGlow.addColorStop(0.88, 'rgba(0, 0, 0, 0)');
      innerGlow.addColorStop(1, 'rgba(5, 12, 40, 0.1)');
      ctx.fillStyle = innerGlow;
      ctx.fillRect(destX, destY, destW, destH);

      const shadeAngle = Math.atan2(tly, tlx);
      const gx = mx + Math.cos(shadeAngle + Math.PI) * R * 0.55;
      const gy = my + Math.sin(shadeAngle + Math.PI) * R * 0.55;
      const shade = ctx.createRadialGradient(gx, gy, 0, gx, gy, R * 1.05);
      shade.addColorStop(0, 'rgba(0, 8, 24, 0.16)');
      shade.addColorStop(0.55, 'rgba(0, 0, 0, 0.06)');
      shade.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = shade;
      ctx.fillRect(destX, destY, destW, destH);

      const specK = 0.44;
      const specCx = mx + tlx * R * specK;
      const specCy = my + tly * R * specK;
      const specR = R * 0.42;
      const spec = ctx.createRadialGradient(specCx, specCy, 0, specCx, specCy, specR);
      spec.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
      spec.addColorStop(0.2, 'rgba(255, 255, 255, 0.1)');
      spec.addColorStop(0.45, 'rgba(200, 230, 255, 0.04)');
      spec.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = spec;
      ctx.beginPath();
      ctx.arc(specCx, specCy, specR, 0, Math.PI * 2);
      ctx.fill();

      const spec2x = mx + tlx * R * 0.12 + (-tly) * R * 0.18;
      const spec2y = my + tly * R * 0.12 + tlx * R * 0.18;
      const g2 = ctx.createRadialGradient(spec2x, spec2y, 0, spec2x, spec2y, R * 0.16);
      g2.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
      g2.addColorStop(0.5, 'rgba(255, 255, 255, 0.03)');
      g2.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(spec2x, spec2y, R * 0.16, 0, Math.PI * 2);
      ctx.fill();

      const rimX = mx - tlx * R * 0.72;
      const rimY = my - tly * R * 0.72;
      const rim = ctx.createRadialGradient(rimX, rimY, R * 0.15, rimX, rimY, R * 0.55);
      rim.addColorStop(0, 'rgba(120, 180, 255, 0.07)');
      rim.addColorStop(1, 'rgba(120, 180, 255, 0)');
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.arc(rimX, rimY, R * 0.55, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.arc(mx, my, R + 0.5, 0, Math.PI * 2);
      const fx = mx + tlx * R;
      const fy = my + tly * R;
      const fres = ctx.createLinearGradient(mx - tly * R, my + tlx * R, fx, fy);
      fres.addColorStop(0, 'rgba(255, 255, 255, 0.06)');
      fres.addColorStop(0.35, 'rgba(255, 255, 255, 0.22)');
      fres.addColorStop(0.7, 'rgba(200, 220, 255, 0.12)');
      fres.addColorStop(1, 'rgba(255, 255, 255, 0.06)');
      ctx.strokeStyle = fres;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(mx, my, R + 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1.1;
      ctx.stroke();

      /** Hard circular alpha mask so strokes / gradients cannot tint pixels outside the lens. */
      ctx.save();
      ctx.globalCompositeOperation = 'destination-in';
      ctx.beginPath();
      ctx.arc(mx, my, R, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();

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
        zIndex: 5,
      }}
    />
  );
};
