'use client';

import { useEffect, useRef, type MutableRefObject, type ReactNode } from 'react';

type MagnifierDomLensProps = {
  mousePosRef: MutableRefObject<{ x: number; y: number } | null>;
  sourceCanvas: HTMLCanvasElement | null;
  radius: number;
  zoom: number;
  /** Magnified copy of hero / foreground (non-interactive recommended). */
  children: ReactNode;
};

/**
 * True viewport magnifier: scaled duplicate of the scene (canvas mirror + DOM children)
 * aligned so the point under the cursor stays centered. Sharp grid via non-smoothed mirror blit + CSS crisp-edges.
 */
export const MagnifierDomLens = ({ mousePosRef, sourceCanvas, radius, zoom, children }: MagnifierDomLensProps) => {
  const shellRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef(sourceCanvas);
  sourceRef.current = sourceCanvas;

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const pos = mousePosRef.current;
      const shell = shellRef.current;
      const inner = innerRef.current;
      const mirror = mirrorRef.current;
      const src = sourceRef.current;
      const R = radius;
      const z = Math.max(1.01, zoom);

      if (pos && shell && inner) {
        const { x: mx, y: my } = pos;
        shell.style.left = `${mx - R}px`;
        shell.style.top = `${my - R}px`;
        inner.style.transform = `translate(${R - mx * z}px, ${R - my * z}px) scale(${z})`;
      }

      if (mirror && src && src.width > 0 && src.height > 0) {
        if (mirror.width !== src.width || mirror.height !== src.height) {
          mirror.width = src.width;
          mirror.height = src.height;
        }
        const ctx = mirror.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = false;
          ctx.clearRect(0, 0, mirror.width, mirror.height);
          try {
            ctx.drawImage(src, 0, 0);
          } catch {
            // ignore
          }
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mousePosRef, radius, zoom]);

  const d = radius * 2;

  return (
    <div
      ref={shellRef}
      aria-hidden
      style={{
        position: 'fixed',
        width: d,
        height: d,
        borderRadius: '50%',
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 5,
        /** Flat coin rim — no soft drop shadow or bright inset glow (avoids “rounded glass” read). */
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.55), 0 0 0 1px rgba(140,140,145,0.95)',
      }}
    >
      <div
        ref={innerRef}
        style={{
          width: '100vw',
          height: '100vh',
          transformOrigin: '0 0',
          position: 'relative',
          willChange: 'transform',
        }}
      >
        <canvas
          ref={mirrorRef}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100vw',
            height: '100vh',
            pointerEvents: 'none',
            imageRendering: 'crisp-edges',
            zIndex: 0,
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            pointerEvents: 'none',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};
