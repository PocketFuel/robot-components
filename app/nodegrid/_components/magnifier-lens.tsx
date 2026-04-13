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

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type DepthLayer = {
  /** Parallax multiplier: negative = farther, positive = closer */
  parallax: number;
  /** Multiplier on source sample size (larger = see more world = feels farther) */
  sizeScale: number;
  /** Draw opacity */
  alpha: number;
  /** Blend mode for stacking */
  composite: GlobalCompositeOperation;
};

const DEPTH_LAYERS: DepthLayer[] = [
  { parallax: -0.65, sizeScale: 1.16, alpha: 0.42, composite: 'source-over' },
  { parallax: 0, sizeScale: 1, alpha: 1, composite: 'source-over' },
  { parallax: 0.78, sizeScale: 0.88, alpha: 0.32, composite: 'screen' },
];

/**
 * Overlay canvas: circular lens with stacked parallax grid samples + glass lighting
 * (fixed screen light → specular / gradients slide as the lens moves).
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

      /** Fixed “studio” light in screen space (does not follow the lens). */
      const lightX = w * 0.22;
      const lightY = h * 0.16;
      let tlx = lightX - mx;
      let tly = lightY - my;
      const tlen = Math.hypot(tlx, tly) || 1;
      tlx /= tlen;
      tly /= tlen;

      const destX = mx - R;
      const destY = my - R;
      const destW = 2 * R;
      const destH = 2 * R;

      const parallaxStrength = 0.052;
      const cx = w * 0.5;
      const cy = h * 0.5;

      ctx.save();
      ctx.beginPath();
      ctx.arc(mx, my, R, 0, Math.PI * 2);
      ctx.clip();

      for (let i = 0; i < DEPTH_LAYERS.length; i++) {
        const layer = DEPTH_LAYERS[i];
        const baseHalf = R / z;
        const halfSpan = baseHalf * layer.sizeScale;
        const sSize = halfSpan * 2;

        const pdx = (mx - cx) * parallaxStrength * layer.parallax;
        const pdy = (my - cy) * parallaxStrength * layer.parallax;

        let sx = mx - halfSpan + pdx;
        let sy = my - halfSpan + pdy;
        sx = clamp(sx, 0, src.width - sSize);
        sy = clamp(sy, 0, src.height - sSize);

        ctx.globalCompositeOperation = layer.composite;
        ctx.globalAlpha = layer.alpha;
        try {
          ctx.drawImage(src, sx, sy, sSize, sSize, destX, destY, destW, destH);
        } catch {
          // ignore
        }
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      /** Subtle “bowl” + cool fill so stacked grids read more volumetric */
      const innerGlow = ctx.createRadialGradient(mx, my, R * 0.08, mx, my, R * 0.92);
      innerGlow.addColorStop(0, 'rgba(80, 140, 255, 0.14)');
      innerGlow.addColorStop(0.45, 'rgba(40, 90, 200, 0.06)');
      innerGlow.addColorStop(0.82, 'rgba(0, 0, 0, 0)');
      innerGlow.addColorStop(1, 'rgba(5, 12, 40, 0.28)');
      ctx.fillStyle = innerGlow;
      ctx.fillRect(destX, destY, destW, destH);

      /** Ambient shadow on side away from fixed light (lens occludes) */
      const shadeAngle = Math.atan2(tly, tlx);
      const gx = mx + Math.cos(shadeAngle + Math.PI) * R * 0.55;
      const gy = my + Math.sin(shadeAngle + Math.PI) * R * 0.55;
      const shade = ctx.createRadialGradient(gx, gy, 0, gx, gy, R * 1.05);
      shade.addColorStop(0, 'rgba(0, 8, 24, 0.38)');
      shade.addColorStop(0.55, 'rgba(0, 0, 0, 0.12)');
      shade.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = shade;
      ctx.fillRect(destX, destY, destW, destH);

      /** Primary specular: slides on the glass as the lens moves under fixed light */
      const specK = 0.44;
      const specCx = mx + tlx * R * specK;
      const specCy = my + tly * R * specK;
      const specR = R * 0.42;
      const spec = ctx.createRadialGradient(specCx, specCy, 0, specCx, specCy, specR);
      spec.addColorStop(0, 'rgba(255, 255, 255, 0.62)');
      spec.addColorStop(0.18, 'rgba(255, 255, 255, 0.22)');
      spec.addColorStop(0.45, 'rgba(200, 230, 255, 0.08)');
      spec.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = spec;
      ctx.beginPath();
      ctx.arc(specCx, specCy, specR, 0, Math.PI * 2);
      ctx.fill();

      /** Secondary glint (skew Fresnel) */
      const spec2x = mx + tlx * R * 0.12 + (-tly) * R * 0.18;
      const spec2y = my + tly * R * 0.12 + (tlx) * R * 0.18;
      const g2 = ctx.createRadialGradient(spec2x, spec2y, 0, spec2x, spec2y, R * 0.16);
      g2.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
      g2.addColorStop(0.5, 'rgba(255, 255, 255, 0.05)');
      g2.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(spec2x, spec2y, R * 0.16, 0, Math.PI * 2);
      ctx.fill();

      /** Rim scatter opposite the main highlight */
      const rimX = mx - tlx * R * 0.72;
      const rimY = my - tly * R * 0.72;
      const rim = ctx.createRadialGradient(rimX, rimY, R * 0.15, rimX, rimY, R * 0.55);
      rim.addColorStop(0, 'rgba(120, 180, 255, 0.2)');
      rim.addColorStop(1, 'rgba(120, 180, 255, 0)');
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.arc(rimX, rimY, R * 0.55, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      /** Fresnel edge: brighter where surface normal faces the fixed light */
      ctx.save();
      ctx.beginPath();
      ctx.arc(mx, my, R + 0.5, 0, Math.PI * 2);
      const fx = mx + tlx * R;
      const fy = my + tly * R;
      const fres = ctx.createLinearGradient(mx - tly * R, my + tlx * R, fx, fy);
      fres.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
      fres.addColorStop(0.35, 'rgba(255, 255, 255, 0.38)');
      fres.addColorStop(0.7, 'rgba(200, 220, 255, 0.22)');
      fres.addColorStop(1, 'rgba(255, 255, 255, 0.1)');
      ctx.strokeStyle = fres;
      ctx.lineWidth = 2.8;
      ctx.stroke();
      ctx.restore();

      /** Crisp outer ring */
      ctx.beginPath();
      ctx.arc(mx, my, R + 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.52)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

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
