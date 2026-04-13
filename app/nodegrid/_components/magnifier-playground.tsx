'use client';

import '../grid.css';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { soundEffects } from '../../../src/utils/SoundEffects';
import {
  DEFAULT_GRID_CELL_SIZE,
  DEFAULT_STROKE_SCALE,
  GRID_CELL_SIZE_MAX,
  GRID_CELL_SIZE_MIN,
  NODE_GRID_ORDER,
  STROKE_SCALE_MAX,
  STROKE_SCALE_MIN,
  gridTypeLabel,
  type GridType,
} from '../grid-types';
import { DotGridCanvas, NoiseOverlay } from './dot-grid-canvas';
import { MagnifierGridOcclusion } from './magnifier-grid-occlusion';
import { MagnifierLens } from './magnifier-lens';

const clampNumber = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

const handleCutNoop = () => {};

export const MagnifierPlayground = () => {
  const router = useRouter();
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [gridCanvas, setGridCanvas] = useState<HTMLCanvasElement | null>(null);
  const [canvasResetKey, setCanvasResetKey] = useState(0);
  const [gridType, setGridType] = useState<GridType>('rectangular');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [accentHex, setAccentHex] = useState('#2563eb');
  const [gridCellSize, setGridCellSize] = useState(DEFAULT_GRID_CELL_SIZE);
  const [strokeScale, setStrokeScale] = useState(DEFAULT_STROKE_SCALE);
  const [lensRadius, setLensRadius] = useState(110);
  const [lensZoom, setLensZoom] = useState(2.25);
  const exportCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    document.documentElement.classList.add('no-zoom');
    return () => {
      document.documentElement.classList.remove('no-zoom');
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const hex = (accentHex || '').trim();
    const m = hex.match(/^#?([0-9a-fA-F]{6})$/);
    if (!m) return;
    const v = m[1].toLowerCase();
    const normalized = `#${v}`;
    const r = parseInt(v.slice(0, 2), 16);
    const g = parseInt(v.slice(2, 4), 16);
    const b = parseInt(v.slice(4, 6), 16);
    document.documentElement.style.setProperty('--accent', normalized);
    document.documentElement.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
  }, [accentHex]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  const exportImage = useCallback(async (format: 'png' | 'jpeg') => {
    const canvas = exportCanvasRef.current;
    if (!canvas) return;
    const mime = format === 'png' ? 'image/png' : 'image/jpeg';
    const ext = format === 'png' ? 'png' : 'jpg';
    const fileName = `grid-magnifier-${gridType}-${Date.now()}.${ext}`;
    const blob: Blob | null = await new Promise((resolve) => {
      if ('toBlob' in canvas) {
        canvas.toBlob((b) => resolve(b), mime, 0.92);
      } else {
        resolve(null);
      }
    });
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    const dataUrl = canvas.toDataURL(mime, 0.92);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = fileName;
    a.click();
  }, [gridType]);

  return (
    <div
      style={{
        minHeight: '100vh',
        color: 'var(--app-fg)',
        position: 'relative',
        backgroundColor: 'var(--app-bg)',
        cursor: 'none',
      }}
      role="presentation"
    >
      <DotGridCanvas
        key={`${canvasResetKey}-${gridCellSize}-${strokeScale}`}
        panelX={-9999}
        panelY={-9999}
        panelWidth={0}
        panelHeight={0}
        pulses={[]}
        mousePos={mousePos}
        panels={[]}
        connections={[]}
        connectionDrag={null}
        sliceTrail={[]}
        cutConnections={[]}
        onCutAnimationComplete={handleCutNoop}
        gridType={gridType}
        theme={theme}
        accentHex={accentHex}
        gridCellSize={gridCellSize}
        strokeScale={strokeScale}
        onCanvasReady={(c) => {
          exportCanvasRef.current = c;
          setGridCanvas(c);
        }}
      />

      <MagnifierGridOcclusion mousePos={mousePos} radius={lensRadius} theme={theme} />

      <NoiseOverlay overlayZIndex={2} />

      <MagnifierLens sourceCanvas={gridCanvas} mousePos={mousePos} radius={lensRadius} zoom={lensZoom} />

      <div style={{ position: 'fixed', top: 32, left: 32, zIndex: 10, cursor: 'default' }}>
        <button
          type="button"
          onClick={() => {
            soundEffects.playQuickStartClick();
            router.push('/');
          }}
          onMouseEnter={() => soundEffects.playHoverSound('logo')}
          className="btn-skin"
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 0 0 1px var(--app-bg)',
            cursor: 'pointer',
          }}
          aria-label="Home"
        >
          <span
            style={{
              display: 'block',
              width: 20,
              height: 20,
              backgroundImage: 'url(/images/new-robot-logo.svg)',
              backgroundSize: 'contain',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }}
          />
        </button>
      </div>

      <div
        style={{
          position: 'fixed',
          top: 32,
          right: 32,
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          alignItems: 'flex-end',
          cursor: 'default',
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              soundEffects.playQuickStartClick();
              setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
            }}
            onMouseEnter={() => soundEffects.playHoverSound('theme')}
            style={{
              padding: '6px 10px',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--app-fg)',
              backgroundColor: 'rgba(255,255,255,0.06)',
              border: `1px solid var(--btn-outline)`,
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            {theme === 'dark' ? 'Dark' : 'Light'}
          </button>
          <input
            type="color"
            value={(() => {
              const m = (accentHex || '').trim().match(/^#?([0-9a-fA-F]{6})$/);
              return m ? `#${m[1].toLowerCase()}` : '#2563eb';
            })()}
            onChange={(e) => setAccentHex(e.target.value)}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: `1px solid var(--btn-outline)`,
              background: 'transparent',
              padding: 0,
              cursor: 'pointer',
            }}
            aria-label="Accent color"
          />
          <input
            value={accentHex}
            onChange={(e) => setAccentHex(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            placeholder="#2563eb"
            style={{
              width: 96,
              padding: '6px 8px',
              fontSize: 11,
              color: 'var(--app-fg)',
              backgroundColor: 'rgba(255,255,255,0.06)',
              border: `1px solid var(--btn-outline)`,
              borderRadius: 8,
              outline: 'none',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
            aria-label="Accent hex"
          />
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            alignItems: 'flex-end',
            padding: '8px 10px',
            borderRadius: 8,
            border: `1px solid var(--btn-outline)`,
            backgroundColor: 'rgba(255,255,255,0.04)',
          }}
        >
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--muted-fg)', cursor: 'pointer' }}
            htmlFor="mag-cell"
          >
            <span style={{ width: 52 }}>Cell</span>
            <input
              id="mag-cell"
              type="range"
              min={GRID_CELL_SIZE_MIN}
              max={GRID_CELL_SIZE_MAX}
              step={2}
              value={gridCellSize}
              onChange={(e) => {
                soundEffects.playHoverSound('grid-type');
                setGridCellSize(clampNumber(Number(e.target.value), GRID_CELL_SIZE_MIN, GRID_CELL_SIZE_MAX));
                setCanvasResetKey((k) => k + 1);
              }}
              style={{ width: 120 }}
            />
            <span style={{ width: 36, textAlign: 'right', fontFamily: 'monospace', color: 'var(--app-fg)' }}>{gridCellSize}</span>
          </label>
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--muted-fg)', cursor: 'pointer' }}
            htmlFor="mag-stroke"
          >
            <span style={{ width: 52 }}>Stroke</span>
            <input
              id="mag-stroke"
              type="range"
              min={25}
              max={400}
              step={5}
              value={Math.round(strokeScale * 100)}
              onChange={(e) => {
                soundEffects.playHoverSound('grid-type');
                setStrokeScale(clampNumber(Number(e.target.value) / 100, STROKE_SCALE_MIN, STROKE_SCALE_MAX));
                setCanvasResetKey((k) => k + 1);
              }}
              style={{ width: 120 }}
            />
            <span style={{ width: 36, textAlign: 'right', fontFamily: 'monospace', color: 'var(--app-fg)' }}>{strokeScale.toFixed(2)}×</span>
          </label>
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--muted-fg)', cursor: 'pointer' }}
            htmlFor="mag-radius"
          >
            <span style={{ width: 52 }}>Lens</span>
            <input
              id="mag-radius"
              type="range"
              min={56}
              max={200}
              step={2}
              value={lensRadius}
              onChange={(e) => setLensRadius(clampNumber(Number(e.target.value), 56, 200))}
              style={{ width: 120 }}
            />
            <span style={{ width: 36, textAlign: 'right', fontFamily: 'monospace', color: 'var(--app-fg)' }}>{lensRadius}</span>
          </label>
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--muted-fg)', cursor: 'pointer' }}
            htmlFor="mag-zoom"
          >
            <span style={{ width: 52 }}>Zoom</span>
            <input
              id="mag-zoom"
              type="range"
              min={115}
              max={400}
              step={5}
              value={Math.round(lensZoom * 100)}
              onChange={(e) => setLensZoom(clampNumber(Number(e.target.value) / 100, 1.15, 4))}
              style={{ width: 120 }}
            />
            <span style={{ width: 36, textAlign: 'right', fontFamily: 'monospace', color: 'var(--app-fg)' }}>{lensZoom.toFixed(2)}×</span>
          </label>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              exportImage('png');
            }}
            onMouseEnter={() => soundEffects.playHoverSound('export-png')}
            style={{
              padding: '6px 10px',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--app-fg)',
              backgroundColor: 'rgba(255,255,255,0.06)',
              border: `1px solid var(--btn-outline)`,
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            PNG
          </button>
          <Link
            href="/nodegrid"
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={() => soundEffects.playHoverSound('copy-code')}
            style={{
              padding: '6px 10px',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--app-fg)',
              backgroundColor: 'rgba(255,255,255,0.06)',
              border: `1px solid var(--btn-outline)`,
              borderRadius: 8,
              cursor: 'pointer',
              textDecoration: 'none',
            }}
          >
            Panel mode
          </Link>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 4,
            justifyContent: 'flex-end',
            maxWidth: 420,
            backgroundColor: 'rgba(255,255,255,0.05)',
            padding: 4,
            borderRadius: 8,
            border: `1px solid var(--btn-outline)`,
          }}
        >
          {NODE_GRID_ORDER.map((type) => {
            const label =
              type === 'web_one' ? 'Web One' :
              type === 'quantum_web' ? 'Quantum Web' :
              type === 'triangular' ? 'Truss' :
              type === 'mesh' ? 'Mesh' :
              type === 'flux' ? 'Flux' :
              type === 'constellation' ? 'Constellation' :
              type === 'floral' ? 'Floral' :
              type === 'waves' ? 'Waves' :
              type === 'spiral' ? 'Spiral' :
              type === 'organic' ? 'Organic' :
              type === 'automate' ? 'Automate' :
              type.charAt(0).toUpperCase() + type.slice(1);
            return (
              <button
                key={type}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  soundEffects.playQuickStartClick();
                  setGridType(type);
                  setCanvasResetKey((k) => k + 1);
                }}
                onMouseEnter={() => soundEffects.playHoverSound('grid-type')}
                style={{
                  padding: '6px 10px',
                  fontSize: 11,
                  fontWeight: gridType === type ? 600 : 400,
                  color: gridType === type ? 'var(--app-fg)' : 'var(--muted-fg)',
                  backgroundColor: gridType === type ? 'rgba(var(--accent-rgb), 0.25)' : 'transparent',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        style={{
          position: 'fixed',
          bottom: 32,
          left: 32,
          maxWidth: 360,
          zIndex: 10,
          cursor: 'default',
        }}
      >
        <h1 style={{ fontSize: 19, fontWeight: 600, color: 'var(--app-fg)' }}>Node grid magnifier</h1>
        <p style={{ fontSize: 14, color: 'var(--muted-fg)', marginTop: 6, lineHeight: 1.57 }}>
          Circular lens follows your pointer and enlarges the live grid ({gridTypeLabel(gridType)}). No floating panels — use{' '}
          <Link href="/nodegrid" style={{ color: 'var(--app-fg)', textDecoration: 'underline' }}>
            Node Editor Canvas
          </Link>{' '}
          for windows and connections. Cursor is hidden so the glass stays centered on the dot field.
        </p>
      </div>
    </div>
  );
};
