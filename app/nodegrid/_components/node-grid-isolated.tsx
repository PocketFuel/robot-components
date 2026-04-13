'use client';

import React, { useEffect } from 'react';
import type { GridType } from '../grid-types';
import { DotGridCanvas, NoiseOverlay } from './dot-grid-canvas';
import '../grid.css';

export type NodeGridIsolatedProps = {
  gridType: GridType;
  theme?: 'dark' | 'light';
  accentHex?: string;
  /** Film-grain WebGL overlay (same as full playground) */
  withNoiseOverlay?: boolean;
};

const handleCutAnimationCompleteNoop = () => {};

/**
 * Background-only node grid (no floating panels, no HUD). Used by /nodegrid/[slug]
 * and meant to be copied into other apps with the same files as the playground.
 */
export const NodeGridIsolated = ({
  gridType,
  theme = 'dark',
  accentHex = '#2563eb',
  withNoiseOverlay = true,
}: NodeGridIsolatedProps) => {
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
    document.documentElement.classList.add('no-zoom');
    return () => {
      document.documentElement.classList.remove('no-zoom');
    };
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--app-bg)',
        color: 'var(--app-fg)',
        position: 'relative',
      }}
    >
      {withNoiseOverlay ? <NoiseOverlay /> : null}
      <DotGridCanvas
        key={gridType}
        panelX={-9999}
        panelY={-9999}
        panelWidth={0}
        panelHeight={0}
        pulses={[]}
        mousePos={null}
        panels={[]}
        connections={[]}
        connectionDrag={null}
        sliceTrail={[]}
        cutConnections={[]}
        onCutAnimationComplete={handleCutAnimationCompleteNoop}
        gridType={gridType}
        theme={theme}
        accentHex={accentHex}
      />
    </div>
  );
};
