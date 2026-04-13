'use client';

import '../grid.css';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Instrument_Serif } from 'next/font/google';
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
import { MAG_MODE_LLM_RECIPE } from '../mag-mode-recipe';
import { DotGridCanvas, NoiseOverlay } from './dot-grid-canvas';
import { MagnifierDomLens } from './magnifier-dom-lens';
import { MagnifierGridOcclusion } from './magnifier-grid-occlusion';

const instrumentSerif = Instrument_Serif({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
});

const clampNumber = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

const handleCutNoop = () => {};

type MagNode = { id: string; x: number; y: number };

type MagnifierHeroBlockProps = {
  variant: 'primary' | 'clone';
  heroTitle: string;
  onHeroTitleChange: (value: string) => void;
  theme: 'dark' | 'light';
  onHide: () => void;
};

const MagnifierHeroBlock = ({
  variant,
  heroTitle,
  onHeroTitleChange,
  theme,
  onHide,
}: MagnifierHeroBlockProps) => {
  const isClone = variant === 'clone';
  const cardBg = theme === 'dark' ? 'rgba(14, 14, 18, 0.58)' : 'rgba(255, 255, 255, 0.78)';

  const outerStyle: React.CSSProperties = isClone
    ? {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }
    : {
        position: 'fixed',
        inset: 0,
        zIndex: 2,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'default',
      };

  return (
    <div style={outerStyle}>
      <div
        style={{
          pointerEvents: isClone ? 'none' : 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
          maxWidth: 'min(92vw, 520px)',
          padding: '28px 32px',
          borderRadius: 16,
          backgroundColor: cardBg,
          border: '1px solid var(--btn-outline)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
          backdropFilter: isClone ? 'none' : 'blur(10px)',
        }}
      >
        {isClone ? (
          <p
            className={instrumentSerif.className}
            style={{
              width: '100%',
              margin: 0,
              textAlign: 'center',
              fontSize: 'clamp(28px, 4.5vw, 44px)',
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
              color: 'var(--app-fg)',
            }}
          >
            {heroTitle}
          </p>
        ) : (
          <input
            id="mag-hero-title"
            type="text"
            value={heroTitle}
            onChange={(e) => onHeroTitleChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className={instrumentSerif.className}
            style={{
              width: '100%',
              textAlign: 'center',
              fontSize: 'clamp(28px, 4.5vw, 44px)',
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
              color: 'var(--app-fg)',
              background: 'transparent',
              border: 'none',
              outline: 'none',
            }}
            aria-label="Hero title text"
          />
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
          {isClone ? (
            <>
              <span
                style={{
                  padding: '10px 20px',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#fff',
                  backgroundColor: 'rgb(var(--accent-rgb))',
                  display: 'inline-block',
                }}
              >
                Primary
              </span>
              <span
                style={{
                  padding: '10px 20px',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'var(--app-fg)',
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  border: `1px solid var(--btn-outline)`,
                  display: 'inline-block',
                }}
              >
                Secondary
              </span>
              <span
                style={{
                  padding: '10px 16px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--muted-fg)',
                  backgroundColor: 'transparent',
                  border: `1px dashed var(--btn-outline)`,
                  display: 'inline-block',
                }}
              >
                Hide
              </span>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn-skin"
                onClick={(e) => {
                  e.stopPropagation();
                  soundEffects.playQuickStartClick();
                }}
                onMouseEnter={() => soundEffects.playHoverSound('logo')}
                style={{
                  padding: '10px 20px',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#fff',
                  backgroundColor: 'rgb(var(--accent-rgb))',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Primary
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  soundEffects.playQuickStartClick();
                }}
                onMouseEnter={() => soundEffects.playHoverSound('theme')}
                style={{
                  padding: '10px 20px',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'var(--app-fg)',
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  border: `1px solid var(--btn-outline)`,
                  cursor: 'pointer',
                }}
              >
                Secondary
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  soundEffects.playQuickStartClick();
                  onHide();
                }}
                onMouseEnter={() => soundEffects.playHoverSound('grid-type')}
                style={{
                  padding: '10px 16px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--muted-fg)',
                  backgroundColor: 'transparent',
                  border: `1px dashed var(--btn-outline)`,
                  cursor: 'pointer',
                }}
              >
                Hide
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export const MagnifierPlayground = () => {
  const router = useRouter();
  const mousePosRef = useRef<{ x: number; y: number } | null>(null);
  const [gridCanvas, setGridCanvas] = useState<HTMLCanvasElement | null>(null);
  const [canvasResetKey, setCanvasResetKey] = useState(0);
  const [gridType, setGridType] = useState<GridType>('rectangular');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [accentHex, setAccentHex] = useState('#2563eb');
  const [gridCellSize, setGridCellSize] = useState(DEFAULT_GRID_CELL_SIZE);
  const [strokeScale, setStrokeScale] = useState(DEFAULT_STROKE_SCALE);
  const [lensRadius, setLensRadius] = useState(64);
  const [lensZoom, setLensZoom] = useState(1.25);
  const [heroTitle, setHeroTitle] = useState('Background Canvas');
  const [heroVisible, setHeroVisible] = useState(true);
  const [magNodes, setMagNodes] = useState<MagNode[]>([]);
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
    mousePosRef.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const onMove = (e: MouseEvent) => {
      mousePosRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  const handleCanvasReady = useCallback((canvas: HTMLCanvasElement | null) => {
    exportCanvasRef.current = canvas;
    setGridCanvas((prev) => (prev === canvas ? prev : canvas));
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

  const copyMagModeRecipe = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(MAG_MODE_LLM_RECIPE);
      soundEffects.playQuickStartClick();
    } catch {
      // ignore
    }
  }, []);

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
        mousePos={null}
        externalMousePosRef={mousePosRef}
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
        onCanvasReady={handleCanvasReady}
      />

      <div
        role="presentation"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1,
          pointerEvents: 'auto',
          cursor: 'none',
        }}
        onClick={(e) => {
          if (e.target !== e.currentTarget) return;
          soundEffects.playQuickStartClick();
          setMagNodes((prev) => [
            ...prev,
            { id: `mag-node-${Date.now()}-${prev.length}`, x: e.clientX, y: e.clientY },
          ]);
        }}
      />

      {heroVisible ? (
        <MagnifierHeroBlock
          variant="primary"
          heroTitle={heroTitle}
          onHeroTitleChange={setHeroTitle}
          theme={theme}
          onHide={() => setHeroVisible(false)}
        />
      ) : null}

      {!heroVisible ? (
        <div
          style={{
            position: 'fixed',
            bottom: 120,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            cursor: 'default',
          }}
        >
          <button
            type="button"
            onClick={() => {
              soundEffects.playQuickStartClick();
              setHeroVisible(true);
            }}
            onMouseEnter={() => soundEffects.playHoverSound('grid-type')}
            style={{
              padding: '8px 14px',
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--app-fg)',
              backgroundColor: 'rgba(255,255,255,0.08)',
              border: `1px solid var(--btn-outline)`,
              cursor: 'pointer',
            }}
          >
            Show hero
          </button>
        </div>
      ) : null}

      <MagnifierGridOcclusion mousePosRef={mousePosRef} radius={lensRadius} theme={theme} />

      <NoiseOverlay overlayZIndex={4} />

      <MagnifierDomLens
        mousePosRef={mousePosRef}
        sourceCanvas={gridCanvas}
        radius={lensRadius}
        zoom={lensZoom}
      >
        {heroVisible ? (
          <MagnifierHeroBlock
            variant="clone"
            heroTitle={heroTitle}
            onHeroTitleChange={setHeroTitle}
            theme={theme}
            onHide={() => setHeroVisible(false)}
          />
        ) : null}
      </MagnifierDomLens>

      <div style={{ position: 'fixed', inset: 0, zIndex: 6, pointerEvents: 'none' }} aria-hidden={magNodes.length === 0}>
        {magNodes.map((n) => (
          <div
            key={n.id}
            style={{
              position: 'absolute',
              left: n.x,
              top: n.y,
              width: 14,
              height: 14,
              marginLeft: -7,
              marginTop: -7,
              borderRadius: 999,
              backgroundColor: 'rgba(var(--accent-rgb), 0.35)',
              border: '2px solid rgb(var(--accent-rgb))',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.35)',
              pointerEvents: 'none',
            }}
          />
        ))}
      </div>

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
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void copyMagModeRecipe();
            }}
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
            }}
            title="Copy MAG MODE recipe for LLMs (files, z-order, pointer ref pattern, lens transform)"
          >
            Copy recipe
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
          The lens is a live scaled copy of the viewport: the dot grid (mirrored from the canvas each frame) plus the hero
          card, so you see the same background and typography magnified together ({gridTypeLabel(gridType)}). No floating
          panels — use{' '}
          <Link href="/nodegrid" style={{ color: 'var(--app-fg)', textDecoration: 'underline' }}>
            Node Editor Canvas
          </Link>{' '}
          for windows and connections. Cursor is hidden so the glass stays centered on the field.
        </p>
      </div>
    </div>
  );
};
