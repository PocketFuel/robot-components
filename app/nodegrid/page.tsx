'use client';

import './grid.css';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { Loader2, Check, CircleCheck, ChevronUp, ChevronDown, GripVertical, Sparkles } from 'lucide-react';
import { soundEffects } from '../../src/utils/SoundEffects';
import {
  NODEGRID_GITHUB_BASE,
  NODE_GRID_ORDER,
  gridTypeLabel,
  gridTypeToSlug,
  type GridType,
} from './grid-types';
import { panelSounds } from './_components/panel-sounds';
import { DotGridCanvas, NoiseOverlay, type ConnectionDrag, type CutConnection, type FloatingPanelData, type PanelConnection, type PulseEvent, type SlicePoint } from './_components/dot-grid-canvas';

// ============================================================================
// TYPES
// ============================================================================

interface PhysicsConfig {
  boundaryMargin: number;
  maxVelocity: number;
  baseFriction: number;
  highSpeedFriction: number;
  bounceDamping: number;
  bounceFrictionBoost: number;
  minVelocity: number;
  momentumThreshold: number;
  velocitySampleCount: number;
  dragScale: number;
  panelWidth: number;
  soundEnabled: boolean;
  soundMinVolume: number;
  soundMaxVolume: number;
  // Shadow settings
  idleShadowY: number;
  idleShadowBlur: number;
  idleShadowSpread: number;
  idleShadowOpacity: number;
  dragShadowY: number;
  dragShadowBlur: number;
  dragShadowSpread: number;
  dragShadowOpacity: number;
}

interface DummyJob {
  id: string;
  name: string;
  status: 'completed' | 'processing';
  size: string;
  gradient: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const HEADER_HEIGHT = 48;
const JOB_ROW_HEIGHT = 52;

const DEFAULT_CONFIG: PhysicsConfig = {
  boundaryMargin: 8,
  maxVelocity: 40,
  baseFriction: 0.975,
  highSpeedFriction: 0.94,
  bounceDamping: 0.45,
  bounceFrictionBoost: 0.85,
  minVelocity: 0.15,
  momentumThreshold: 1.5,
  velocitySampleCount: 6,
  dragScale: 1.018,
  panelWidth: 280,
  soundEnabled: true,
  soundMinVolume: 0.015,
  soundMaxVolume: 0.15,
  // Shadow settings (idle)
  idleShadowY: 24,
  idleShadowBlur: 24,
  idleShadowSpread: -12,
  idleShadowOpacity: 0.25,
  // Shadow settings (drag)
  dragShadowY: 32,
  dragShadowBlur: 40,
  dragShadowSpread: -8,
  dragShadowOpacity: 0.55,
};

// Greyscale gradients for thumbnails
const GRADIENTS = [
  'linear-gradient(135deg, #3a3a3a 0%, #2a2a2a 100%)',
  'linear-gradient(135deg, #4a4a4a 0%, #333333 100%)',
  'linear-gradient(135deg, #383838 0%, #282828 100%)',
  'linear-gradient(135deg, #454545 0%, #303030 100%)',
  'linear-gradient(135deg, #404040 0%, #2d2d2d 100%)',
  'linear-gradient(135deg, #3d3d3d 0%, #2b2b2b 100%)',
  'linear-gradient(135deg, #484848 0%, #323232 100%)',
  'linear-gradient(135deg, #3b3b3b 0%, #292929 100%)',
  'linear-gradient(135deg, #434343 0%, #2e2e2e 100%)',
  'linear-gradient(135deg, #3f3f3f 0%, #2c2c2c 100%)',
];

const DUMMY_NAMES = [
  'cosmic-nebula',
  'azure-crystal',
  'midnight-bloom',
  'solar-flare',
  'ocean-depths',
  'aurora-burst',
  'velvet-storm',
  'golden-hour',
  'neon-dreams',
  'frost-peak',
];

// Generate dummy jobs
const generateDummyJobs = (count: number): DummyJob[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: `job-${i}`,
    name: DUMMY_NAMES[i % DUMMY_NAMES.length],
    status: i < 2 ? 'processing' : 'completed',
    size: `${(Math.random() * 50 + 1).toFixed(1)} MB`,
    gradient: GRADIENTS[i % GRADIENTS.length],
  }));
};

// ============================================================================
// PHYSICS PANEL COMPONENT
// ============================================================================

function PhysicsPanel({ config, jobs, onPositionChange, onSizeChange, onBounce }: { config: PhysicsConfig; jobs: DummyJob[]; onPositionChange?: (x: number, y: number) => void; onSizeChange?: (width: number, height: number) => void; onBounce?: (x: number, y: number, intensity: number) => void }) {
  const [position, setPosition] = useState(() => ({
    x: typeof window !== 'undefined' ? window.innerWidth / 2 - config.panelWidth / 2 : 400,
    y: typeof window !== 'undefined' ? window.innerHeight / 2 - HEADER_HEIGHT / 2 : 300,
  }));

  const [isExpanded, setIsExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const innerPanelRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const velocitySamplesRef = useRef<Array<{ x: number; y: number; t: number }>>([]);
  const isAnimatingRef = useRef(false);
  const justBouncedRef = useRef({ x: false, y: false });
  const bounceControls = useAnimation();

  // Track panel size changes with ResizeObserver
  useEffect(() => {
    const inner = innerPanelRef.current;
    if (!inner) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        onSizeChange?.(width, height);
      }
    });

    observer.observe(inner);
    return () => observer.disconnect();
  }, [onSizeChange]);

  // Visual feedback constants
  const DRAG_TRANSITION = 'transform 0.15s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.15s cubic-bezier(0.4, 0, 0.2, 1)';

  // Generate shadow strings from config
  const IDLE_SHADOW = `0 ${config.idleShadowY}px ${config.idleShadowBlur}px ${config.idleShadowSpread}px rgba(0, 0, 0, ${config.idleShadowOpacity})`;
  const DRAG_SHADOW = `0 ${config.dragShadowY}px ${config.dragShadowBlur}px ${config.dragShadowSpread}px rgba(0, 0, 0, ${config.dragShadowOpacity})`;

  // Initialize sound on mount
  useEffect(() => {
    panelSounds.initialize();
  }, []);

  // Get viewport bounds
  const getViewportBounds = useCallback((scale: number, panelWidth: number, panelHeight: number) => {
    const effectiveWidth = window.innerWidth / scale;
    const effectiveHeight = window.innerHeight / scale;
    return {
      minX: config.boundaryMargin,
      maxX: effectiveWidth - panelWidth - config.boundaryMargin,
      minY: config.boundaryMargin,
      maxY: effectiveHeight - panelHeight - config.boundaryMargin,
    };
  }, [config.boundaryMargin]);

  // Clamp velocity
  const clampVelocity = useCallback((vx: number, vy: number) => {
    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed > config.maxVelocity) {
      const ratio = config.maxVelocity / speed;
      return { vx: vx * ratio, vy: vy * ratio };
    }
    return { vx, vy };
  }, [config.maxVelocity]);

  // Calculate velocity from samples
  const calculateVelocityFromSamples = useCallback((): { x: number; y: number } => {
    const samples = velocitySamplesRef.current;
    if (samples.length < 2) return { x: 0, y: 0 };

    const now = performance.now();
    const maxAge = 80;

    const lastSample = samples[samples.length - 1];
    if (now - lastSample.t > maxAge) {
      return { x: 0, y: 0 };
    }

    let totalWeight = 0;
    let weightedVelX = 0;
    let weightedVelY = 0;

    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1];
      const curr = samples[i];
      const dt = curr.t - prev.t;
      const age = now - curr.t;

      if (age <= maxAge && dt >= 8 && dt < 100) {
        const weight = i / samples.length;
        const velX = ((curr.x - prev.x) / dt) * 16.67;
        const velY = ((curr.y - prev.y) / dt) * 16.67;
        weightedVelX += velX * weight;
        weightedVelY += velY * weight;
        totalWeight += weight;
      }
    }

    if (totalWeight === 0) return { x: 0, y: 0 };
    return {
      x: weightedVelX / totalWeight,
      y: weightedVelY / totalWeight,
    };
  }, []);

  // Animate momentum
  const animateMomentum = useCallback((
    startX: number,
    startY: number,
    velX: number,
    velY: number,
    scale: number,
    panelWidth: number,
    panelHeight: number
  ) => {
    const panel = panelRef.current;
    if (!panel) return;

    const clamped = clampVelocity(velX, velY);
    let x = startX;
    let y = startY;
    let vx = clamped.vx;
    let vy = clamped.vy;

    isAnimatingRef.current = true;
    justBouncedRef.current = { x: false, y: false };

    const animate = () => {
      const bounds = getViewportBounds(scale, panelWidth, panelHeight);

      const speed = Math.sqrt(vx * vx + vy * vy);
      const speedRatio = Math.min(speed / config.maxVelocity, 1);
      const friction = config.baseFriction - (speedRatio * (config.baseFriction - config.highSpeedFriction));

      const bounceMultiplierX = justBouncedRef.current.x ? config.bounceFrictionBoost : 1;
      const bounceMultiplierY = justBouncedRef.current.y ? config.bounceFrictionBoost : 1;

      vx *= friction * bounceMultiplierX;
      vy *= friction * bounceMultiplierY;

      justBouncedRef.current = { x: false, y: false };

      x += vx;
      y += vy;

      let didBounce = false;
      const preBounceSpeeed = Math.sqrt(vx * vx + vy * vy);

      // Calculate normalized impact force (0-1) based on pre-bounce speed
      const impactForce = Math.min(preBounceSpeeed / config.maxVelocity, 1);

      if (x < bounds.minX) {
        x = bounds.minX;
        vx = Math.abs(vx) * config.bounceDamping;
        justBouncedRef.current.x = true;
        didBounce = true;
        // Trigger pulse from left edge impact point
        onBounce?.(x, y + panelHeight / 2, impactForce);
      } else if (x > bounds.maxX) {
        x = bounds.maxX;
        vx = -Math.abs(vx) * config.bounceDamping;
        justBouncedRef.current.x = true;
        didBounce = true;
        // Trigger pulse from right edge impact point
        onBounce?.(x + panelWidth, y + panelHeight / 2, impactForce);
      }

      if (y < bounds.minY) {
        y = bounds.minY;
        vy = Math.abs(vy) * config.bounceDamping;
        justBouncedRef.current.y = true;
        didBounce = true;
        // Trigger pulse from top edge impact point
        onBounce?.(x + panelWidth / 2, y, impactForce);
      } else if (y > bounds.maxY) {
        y = bounds.maxY;
        vy = -Math.abs(vy) * config.bounceDamping;
        justBouncedRef.current.y = true;
        didBounce = true;
        // Trigger pulse from bottom edge impact point
        onBounce?.(x + panelWidth / 2, y + panelHeight, impactForce);
      }

      // Play bounce sound
      if (didBounce && preBounceSpeeed > 0.5 && config.soundEnabled) {
        const normalizedSpeed = Math.min(preBounceSpeeed / config.maxVelocity, 1);
        const impactVolume = config.soundMinVolume + (normalizedSpeed * normalizedSpeed) * (config.soundMaxVolume - config.soundMinVolume);
        panelSounds.play(impactVolume);
      }

      panel.style.left = x + 'px';
      panel.style.top = y + 'px';
      onPositionChange?.(x, y);

      const currentSpeed = Math.sqrt(vx * vx + vy * vy);
      if (currentSpeed > config.minVelocity) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        isAnimatingRef.current = false;
        animationFrameRef.current = null;
        setPosition({ x, y });
        onPositionChange?.(x, y);
      }
    };

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = requestAnimationFrame(animate);
  }, [config, clampVelocity, getViewportBounds]);

  // Handle mouse down
  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-no-drag]')) return;

    const panel = panelRef.current;
    if (!panel) return;

    const wasAnimating = animationFrameRef.current !== null;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
      isAnimatingRef.current = false;
    }

    const innerPanel = panel.querySelector('[data-panel-inner]') as HTMLElement;
    const rect = panel.getBoundingClientRect();
    const scale = rect.width / config.panelWidth;

    let startCssX: number;
    let startCssY: number;
    if (wasAnimating) {
      startCssX = parseFloat(panel.style.left) || position.x;
      startCssY = parseFloat(panel.style.top) || position.y;
      setPosition({ x: startCssX, y: startCssY });
    } else {
      startCssX = position.x;
      startCssY = position.y;
    }

    const grabOffsetX = e.clientX - rect.left;
    const grabOffsetY = e.clientY - rect.top;
    const startRectLeft = rect.left;
    const startRectTop = rect.top;

    let hasMoved = false;
    let finalX = startCssX;
    let finalY = startCssY;

    velocitySamplesRef.current = [{ x: startCssX, y: startCssY, t: performance.now() }];

    const applyDragStyle = () => {
      if (innerPanel) {
        innerPanel.style.transition = DRAG_TRANSITION;
        innerPanel.style.transform = `scale(${config.dragScale})`;
        innerPanel.style.boxShadow = DRAG_SHADOW;
      }
      panel.style.cursor = 'grabbing';
      document.body.style.cursor = 'grabbing';
    };

    const removeDragStyle = () => {
      if (innerPanel) {
        innerPanel.style.transition = DRAG_TRANSITION;
        innerPanel.style.transform = 'scale(1)';
        innerPanel.style.boxShadow = IDLE_SHADOW;
      }
      panel.style.cursor = '';
      document.body.style.cursor = '';
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const targetViewportX = moveEvent.clientX - grabOffsetX;
      const targetViewportY = moveEvent.clientY - grabOffsetY;
      const viewportDeltaX = targetViewportX - startRectLeft;
      const viewportDeltaY = targetViewportY - startRectTop;
      const cssDeltaX = viewportDeltaX / scale;
      const cssDeltaY = viewportDeltaY / scale;

      if (!hasMoved && (Math.abs(cssDeltaX) > 2 || Math.abs(cssDeltaY) > 2)) {
        hasMoved = true;
        applyDragStyle();
      }

      if (hasMoved) {
        const currentRect = panel.getBoundingClientRect();
        const panelHeight = currentRect.height / scale;
        const panelWidth = currentRect.width / scale;
        const bounds = getViewportBounds(scale, panelWidth, panelHeight);

        finalX = Math.max(bounds.minX, Math.min(bounds.maxX, startCssX + cssDeltaX));
        finalY = Math.max(bounds.minY, Math.min(bounds.maxY, startCssY + cssDeltaY));
        panel.style.left = finalX + 'px';
        panel.style.top = finalY + 'px';
        onPositionChange?.(finalX, finalY);

        const now = performance.now();
        velocitySamplesRef.current.push({ x: finalX, y: finalY, t: now });

        if (velocitySamplesRef.current.length > config.velocitySampleCount) {
          velocitySamplesRef.current.shift();
        }
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      removeDragStyle();

      if (hasMoved) {
        setIsDragging(true);
        setTimeout(() => setIsDragging(false), 50);

        const velocity = calculateVelocityFromSamples();
        const clamped = clampVelocity(velocity.x, velocity.y);
        const speed = Math.sqrt(clamped.vx * clamped.vx + clamped.vy * clamped.vy);

        if (speed > config.momentumThreshold) {
          const currentRect = panel.getBoundingClientRect();
          const panelHeight = currentRect.height / scale;
          const panelWidth = currentRect.width / scale;
          animateMomentum(finalX, finalY, clamped.vx, clamped.vy, scale, panelWidth, panelHeight);
        } else {
          setPosition({ x: finalX, y: finalY });
        }
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Handle touch start (mobile support)
  const handleTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-no-drag]')) return;

    const panel = panelRef.current;
    if (!panel) return;

    const touch = e.touches[0];

    const wasAnimating = animationFrameRef.current !== null;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
      isAnimatingRef.current = false;
    }

    const innerPanel = panel.querySelector('[data-panel-inner]') as HTMLElement;
    const rect = panel.getBoundingClientRect();
    const scale = rect.width / config.panelWidth;

    let startCssX: number;
    let startCssY: number;
    if (wasAnimating) {
      startCssX = parseFloat(panel.style.left) || position.x;
      startCssY = parseFloat(panel.style.top) || position.y;
      setPosition({ x: startCssX, y: startCssY });
    } else {
      startCssX = position.x;
      startCssY = position.y;
    }

    const grabOffsetX = touch.clientX - rect.left;
    const grabOffsetY = touch.clientY - rect.top;
    const startRectLeft = rect.left;
    const startRectTop = rect.top;

    let hasMoved = false;
    let finalX = startCssX;
    let finalY = startCssY;

    velocitySamplesRef.current = [{ x: startCssX, y: startCssY, t: performance.now() }];

    const applyDragStyle = () => {
      if (innerPanel) {
        innerPanel.style.transition = DRAG_TRANSITION;
        innerPanel.style.transform = `scale(${config.dragScale})`;
        innerPanel.style.boxShadow = DRAG_SHADOW;
      }
    };

    const removeDragStyle = () => {
      if (innerPanel) {
        innerPanel.style.transition = DRAG_TRANSITION;
        innerPanel.style.transform = 'scale(1)';
        innerPanel.style.boxShadow = IDLE_SHADOW;
      }
    };

    const handleTouchMove = (moveEvent: TouchEvent) => {
      moveEvent.preventDefault(); // Prevent scrolling while dragging
      const moveTouch = moveEvent.touches[0];

      const targetViewportX = moveTouch.clientX - grabOffsetX;
      const targetViewportY = moveTouch.clientY - grabOffsetY;
      const viewportDeltaX = targetViewportX - startRectLeft;
      const viewportDeltaY = targetViewportY - startRectTop;
      const cssDeltaX = viewportDeltaX / scale;
      const cssDeltaY = viewportDeltaY / scale;

      if (!hasMoved && (Math.abs(cssDeltaX) > 2 || Math.abs(cssDeltaY) > 2)) {
        hasMoved = true;
        applyDragStyle();
      }

      if (hasMoved) {
        const currentRect = panel.getBoundingClientRect();
        const panelHeight = currentRect.height / scale;
        const panelWidth = currentRect.width / scale;
        const bounds = getViewportBounds(scale, panelWidth, panelHeight);

        finalX = Math.max(bounds.minX, Math.min(bounds.maxX, startCssX + cssDeltaX));
        finalY = Math.max(bounds.minY, Math.min(bounds.maxY, startCssY + cssDeltaY));
        panel.style.left = finalX + 'px';
        panel.style.top = finalY + 'px';
        onPositionChange?.(finalX, finalY);

        const now = performance.now();
        velocitySamplesRef.current.push({ x: finalX, y: finalY, t: now });

        if (velocitySamplesRef.current.length > config.velocitySampleCount) {
          velocitySamplesRef.current.shift();
        }
      }
    };

    const handleTouchEnd = () => {
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);

      removeDragStyle();

      if (hasMoved) {
        setIsDragging(true);
        setTimeout(() => setIsDragging(false), 50);

        const velocity = calculateVelocityFromSamples();
        const clamped = clampVelocity(velocity.x, velocity.y);
        const speed = Math.sqrt(clamped.vx * clamped.vx + clamped.vy * clamped.vy);

        if (speed > config.momentumThreshold) {
          const currentRect = panel.getBoundingClientRect();
          const panelHeight = currentRect.height / scale;
          const panelWidth = currentRect.width / scale;
          animateMomentum(finalX, finalY, clamped.vx, clamped.vy, scale, panelWidth, panelHeight);
        } else {
          setPosition({ x: finalX, y: finalY });
        }
      }
    };

    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
  };

  // Handle toggle
  const handleToggle = () => {
    if (isDragging) return;
    soundEffects.playClickSound();
    setIsExpanded(!isExpanded);
    bounceControls.start({
      scale: [1, 1.015, 1],
      transition: { duration: 0.3, ease: 'easeOut' },
    });
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Calculate heights
  const activeCount = jobs.filter(j => j.status === 'processing').length;
  const jobsListHeight = jobs.length > 4 ? (4.5 * JOB_ROW_HEIGHT) + 14 : (jobs.length * JOB_ROW_HEIGHT) + 14;
  const expandedHeight = HEADER_HEIGHT + jobsListHeight;
  const currentHeight = isExpanded ? expandedHeight : HEADER_HEIGHT;

  const getHeaderText = () => {
    if (activeCount > 0) {
      return `${activeCount} job${activeCount !== 1 ? 's' : ''} processing`;
    }
    return `${jobs.length} job${jobs.length !== 1 ? 's' : ''} completed`;
  };

  return (
    <motion.div
      ref={panelRef}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{
        opacity: { duration: 0.15 },
        scale: { type: 'spring', stiffness: 400, damping: 25 },
        y: { type: 'spring', stiffness: 400, damping: 25 },
      }}
      style={{
        position: 'fixed',
        zIndex: 2147483647,
        userSelect: 'none',
        touchAction: 'none',
        left: position.x,
        top: position.y,
        width: config.panelWidth,
        cursor: 'grab',
      }}
    >
      <motion.div
        animate={bounceControls}
        style={{
          width: '100%',
          willChange: 'transform',
          backfaceVisibility: 'hidden',
          transform: 'translateZ(0)',
        }}
      >
        <motion.div
          ref={innerPanelRef}
          data-panel-inner
          initial={false}
          animate={{ height: currentHeight }}
          transition={{
            height: { type: 'spring', stiffness: 400, damping: 28 },
          }}
          style={{
            borderRadius: 12,
            border: '1px solid rgba(255, 255, 255, 0.1)',
            overflow: 'hidden',
            backgroundColor: '#262626', /* neutral-800 */
            boxShadow: IDLE_SHADOW,
          }}
        >
          {/* Header */}
          <button
            onClick={handleToggle}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 16px',
              cursor: 'pointer',
              transition: 'background-color 0.15s',
              height: HEADER_HEIGHT,
              backgroundColor: '#262626', /* neutral-800 */
              border: 'none',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(64, 64, 64, 0.3)'; /* neutral-700/30 */ }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#262626'; /* neutral-800 */ }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {activeCount > 0 ? (
                <Loader2 size={15} style={{ color: '#2563eb', animation: 'spin 1s linear infinite' }} />
              ) : (
                <CircleCheck size={15} style={{ color: '#4ade80' }} />
              )}
              <span style={{ fontSize: 13, fontWeight: 500, color: '#e5e5e5' }}>
                {getHeaderText()}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                data-no-drag
                style={{
                  fontSize: 11,
                  padding: '4px 8px',
                  borderRadius: 6,
                  transition: 'all 0.2s',
                  color: '#737373',
                  cursor: 'pointer',
                  opacity: isExpanded ? 1 : 0,
                  pointerEvents: isExpanded ? 'auto' : 'none',
                }}
              >
                Clear
              </span>
              <GripVertical size={14} style={{ color: '#525252' }} />
              <ChevronUp
                size={13}
                style={{
                  color: '#525252',
                  transition: 'transform 0.3s ease-out',
                  transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                }}
              />
            </div>
          </button>

          {/* Jobs List */}
          <div style={{ position: 'relative' }}>
            <div
              style={{
                height: jobsListHeight,
                paddingTop: 6,
                paddingBottom: 8,
                overflowY: 'auto',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
              }}
            >
            {jobs.map((job) => (
              <div
                key={job.id}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  borderRadius: 5,
                  cursor: 'pointer',
                  position: 'relative',
                  height: JOB_ROW_HEIGHT,
                  padding: '6px 16px 6px 12px',
                }}
              >
                {/* Thumbnail */}
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    flexShrink: 0,
                    transition: 'all 0.15s',
                    background: job.gradient,
                  }}
                />

                {/* Info */}
                <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 13,
                          fontWeight: 500,
                          color: '#fafafa', /* neutral-50 */
                          maxWidth: 150,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {job.name}
                      </span>
                    </div>
                    <span
                      data-no-drag
                      style={{
                        opacity: 0,
                        transition: 'opacity 0.15s',
                        fontSize: 11,
                        color: '#737373', /* neutral-500 */
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      Clear
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {job.status === 'processing' ? (
                      <span style={{ fontSize: 11, color: '#737373' /* neutral-500 */ }}>
                        Generating...
                      </span>
                    ) : (
                      <>
                        <Check size={11} style={{ flexShrink: 0, color: '#737373' /* neutral-500 */ }} />
                        <span style={{ fontSize: 11, color: '#737373' /* neutral-500 */ }}>
                          Generated • {job.size}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
            </div>
            {/* Bottom gradient mask */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: 40,
                background: 'linear-gradient(to top, #262626 0%, transparent 100%)',
                pointerEvents: 'none',
              }}
            />
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

// ============================================================================
// SIMPLE FLOATING PANEL (Spawnable)
// ============================================================================

const FLOATING_PANEL_SIZE = { width: 160, height: 160 }; // 4x4 grid units (40px each)

type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | null;

const GRID_CELL_SIZE = 40; // Grid cell size in pixels

function FloatingPanel({
  id,
  initialX,
  initialY,
  initialWidth,
  initialHeight,
  gridType,
  config,
  isTopPanel,
  isExiting,
  onPositionChange,
  onSizeChange,
  onBounce,
  onDragStart,
  onDragEnd,
  onDismiss,
  onConnectionDragStart,
  onConnectionDragMove,
  onConnectionDragEnd,
  isConnectionTarget,
  hasOutgoingConnection,
  hasIncomingConnection,
  onConnectionDelete
}: {
  id: string;
  initialX: number;
  initialY: number;
  initialWidth: number;
  initialHeight: number;
  gridType: GridType;
  config: PhysicsConfig;
  isTopPanel?: boolean;
  isExiting?: boolean;
  onPositionChange?: (id: string, x: number, y: number) => void;
  onSizeChange?: (id: string, width: number, height: number) => void;
  onBounce?: (x: number, y: number, intensity: number) => void;
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
  onDismiss?: (id: string) => void;
  onConnectionDragStart?: (fromPanelId: string, startX: number, startY: number) => void;
  onConnectionDragMove?: (x: number, y: number) => void;
  onConnectionDragEnd?: (fromPanelId: string, toPanelId: string | null, dropX: number, dropY: number) => void;
  isConnectionTarget?: boolean;
  hasOutgoingConnection?: boolean;
  hasIncomingConnection?: boolean;
  onConnectionDelete?: (panelId: string) => void;
}) {
  const [position, setPosition] = useState({ x: initialX, y: initialY });
  const [size, setSize] = useState({ width: initialWidth, height: initialHeight });
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [resizeEdge, setResizeEdge] = useState<ResizeEdge>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const innerPanelRef = useRef<HTMLDivElement>(null);
  const originalSizeRef = useRef({ width: initialWidth, height: initialHeight });
  const animationFrameRef = useRef<number | null>(null);
  const velocitySamplesRef = useRef<Array<{ x: number; y: number; t: number }>>([]);
  const isAnimatingRef = useRef(false);
  const justBouncedRef = useRef({ x: false, y: false });
  const touchedGridCellsRef = useRef<Set<string>>(new Set());
  const lastGridSoundTimeRef = useRef(0);

  const panelWidth = size.width;
  const panelHeight = size.height;

  const DRAG_TRANSITION = 'transform 0.15s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.15s cubic-bezier(0.4, 0, 0.2, 1)';
  const IDLE_SHADOW = `0 ${config.idleShadowY}px ${config.idleShadowBlur}px ${config.idleShadowSpread}px rgba(0, 0, 0, ${config.idleShadowOpacity})`;
  const DRAG_SHADOW = `0 ${config.dragShadowY}px ${config.dragShadowBlur}px ${config.dragShadowSpread}px rgba(0, 0, 0, ${config.dragShadowOpacity})`;

  const EDGE_THRESHOLD = 12; // Pixels from edge to trigger resize
  const MIN_SIZE = 80; // Minimum panel dimension
  const MAX_SIZE = 660; // Maximum panel dimension

  // Report position/size on mount
  useEffect(() => {
    onPositionChange?.(id, position.x, position.y);
    onSizeChange?.(id, size.width, size.height);
  }, []);

  // Initialize sound on mount
  useEffect(() => {
    panelSounds.initialize();
  }, []);

  // Detect touch device
  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  // Detect which edge/corner mouse is near
  const getResizeEdge = useCallback((e: React.MouseEvent): ResizeEdge => {
    const panel = panelRef.current;
    if (!panel) return null;

    const rect = panel.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const nearLeft = x < EDGE_THRESHOLD;
    const nearRight = x > rect.width - EDGE_THRESHOLD;
    const nearTop = y < EDGE_THRESHOLD;
    const nearBottom = y > rect.height - EDGE_THRESHOLD;

    if (nearTop && nearLeft) return 'nw';
    if (nearTop && nearRight) return 'ne';
    if (nearBottom && nearLeft) return 'sw';
    if (nearBottom && nearRight) return 'se';
    if (nearTop) return 'n';
    if (nearBottom) return 's';
    if (nearLeft) return 'w';
    if (nearRight) return 'e';

    return null;
  }, []);

  // Get cursor style based on edge
  const getCursor = useCallback((edge: ResizeEdge): string => {
    switch (edge) {
      case 'n':
      case 's':
        return 'ns-resize';
      case 'e':
      case 'w':
        return 'ew-resize';
      case 'nw':
      case 'se':
        return 'nwse-resize';
      case 'ne':
      case 'sw':
        return 'nesw-resize';
      default:
        return 'default';
    }
  }, []);

  // Get viewport bounds
  const getViewportBounds = useCallback((scale: number) => {
    const effectiveWidth = window.innerWidth / scale;
    const effectiveHeight = window.innerHeight / scale;
    return {
      minX: config.boundaryMargin,
      maxX: effectiveWidth - panelWidth - config.boundaryMargin,
      minY: config.boundaryMargin,
      maxY: effectiveHeight - panelHeight - config.boundaryMargin,
    };
  }, [config.boundaryMargin, panelWidth, panelHeight]);

  // Clamp velocity
  const clampVelocity = useCallback((vx: number, vy: number) => {
    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed > config.maxVelocity) {
      const ratio = config.maxVelocity / speed;
      return { vx: vx * ratio, vy: vy * ratio };
    }
    return { vx, vy };
  }, [config.maxVelocity]);

  // Calculate velocity from samples
  const calculateVelocityFromSamples = useCallback((): { x: number; y: number } => {
    const samples = velocitySamplesRef.current;
    if (samples.length < 2) return { x: 0, y: 0 };

    const now = performance.now();
    const maxAge = 80;

    const lastSample = samples[samples.length - 1];
    if (now - lastSample.t > maxAge) return { x: 0, y: 0 };

    let totalWeight = 0;
    let weightedVelX = 0;
    let weightedVelY = 0;

    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1];
      const curr = samples[i];
      const dt = curr.t - prev.t;
      const age = now - curr.t;

      if (age <= maxAge && dt >= 8 && dt < 100) {
        const weight = i / samples.length;
        const velX = ((curr.x - prev.x) / dt) * 16.67;
        const velY = ((curr.y - prev.y) / dt) * 16.67;
        weightedVelX += velX * weight;
        weightedVelY += velY * weight;
        totalWeight += weight;
      }
    }

    if (totalWeight === 0) return { x: 0, y: 0 };
    return { x: weightedVelX / totalWeight, y: weightedVelY / totalWeight };
  }, []);

  // Animate momentum
  const animateMomentum = useCallback((startX: number, startY: number, velX: number, velY: number, scale: number) => {
    const panel = panelRef.current;
    if (!panel) return;

    const clamped = clampVelocity(velX, velY);
    let x = startX;
    let y = startY;
    let vx = clamped.vx;
    let vy = clamped.vy;

    isAnimatingRef.current = true;
    justBouncedRef.current = { x: false, y: false };

    const animate = () => {
      const bounds = getViewportBounds(scale);

      const speed = Math.sqrt(vx * vx + vy * vy);
      const speedRatio = Math.min(speed / config.maxVelocity, 1);
      const friction = config.baseFriction - (speedRatio * (config.baseFriction - config.highSpeedFriction));

      const bounceMultiplierX = justBouncedRef.current.x ? config.bounceFrictionBoost : 1;
      const bounceMultiplierY = justBouncedRef.current.y ? config.bounceFrictionBoost : 1;

      vx *= friction * bounceMultiplierX;
      vy *= friction * bounceMultiplierY;

      justBouncedRef.current = { x: false, y: false };

      x += vx;
      y += vy;

      let didBounce = false;
      const preBounceSpeeed = Math.sqrt(vx * vx + vy * vy);
      const impactForce = Math.min(preBounceSpeeed / config.maxVelocity, 1);

      if (x < bounds.minX) {
        x = bounds.minX;
        vx = Math.abs(vx) * config.bounceDamping;
        justBouncedRef.current.x = true;
        didBounce = true;
        onBounce?.(x, y + panelHeight / 2, impactForce);
      } else if (x > bounds.maxX) {
        x = bounds.maxX;
        vx = -Math.abs(vx) * config.bounceDamping;
        justBouncedRef.current.x = true;
        didBounce = true;
        onBounce?.(x + panelWidth, y + panelHeight / 2, impactForce);
      }

      if (y < bounds.minY) {
        y = bounds.minY;
        vy = Math.abs(vy) * config.bounceDamping;
        justBouncedRef.current.y = true;
        didBounce = true;
        onBounce?.(x + panelWidth / 2, y, impactForce);
      } else if (y > bounds.maxY) {
        y = bounds.maxY;
        vy = -Math.abs(vy) * config.bounceDamping;
        justBouncedRef.current.y = true;
        didBounce = true;
        onBounce?.(x + panelWidth / 2, y + panelHeight, impactForce);
      }

      if (didBounce && preBounceSpeeed > 0.5 && config.soundEnabled) {
        const normalizedSpeed = Math.min(preBounceSpeeed / config.maxVelocity, 1);
        const impactVolume = config.soundMinVolume + (normalizedSpeed * normalizedSpeed) * (config.soundMaxVolume - config.soundMinVolume);
        panelSounds.play(impactVolume);
      }

      panel.style.left = x + 'px';
      panel.style.top = y + 'px';
      onPositionChange?.(id, x, y);

      const currentSpeed = Math.sqrt(vx * vx + vy * vy);
      if (currentSpeed > config.minVelocity) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        isAnimatingRef.current = false;
        animationFrameRef.current = null;
        setPosition({ x, y });
        onPositionChange?.(id, x, y);
      }
    };

    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = requestAnimationFrame(animate);
  }, [config, clampVelocity, getViewportBounds, id, onBounce, onPositionChange, panelHeight, panelWidth]);

  // Handle mouse move for edge detection (hover state)
  const handlePanelMouseMove = (e: React.MouseEvent) => {
    if (isDragging || isResizing) return;
    const edge = getResizeEdge(e);
    setResizeEdge(edge);
  };


  // Handle mouse leave
  const handlePanelMouseLeave = () => {
    if (!isResizing) {
      setResizeEdge(null);
    }
    setIsHovered(false);
  };

  // Handle mouse enter
  const handlePanelMouseEnter = () => {
    setIsHovered(true);
  };

  // Handle mouse down - either resize or drag
  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent grid click

    const panel = panelRef.current;
    if (!panel) return;

    const edge = getResizeEdge(e);

    // If on a resize edge, handle resize
    if (edge) {
      handleResizeStart(e, edge);
      return;
    }

    // Otherwise, handle drag
    const wasAnimating = animationFrameRef.current !== null;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
      isAnimatingRef.current = false;
    }

    const innerPanel = innerPanelRef.current;
    const rect = panel.getBoundingClientRect();
    const scale = rect.width / panelWidth;

    let startCssX = wasAnimating ? (parseFloat(panel.style.left) || position.x) : position.x;
    let startCssY = wasAnimating ? (parseFloat(panel.style.top) || position.y) : position.y;
    if (wasAnimating) setPosition({ x: startCssX, y: startCssY });

    const grabOffsetX = e.clientX - rect.left;
    const grabOffsetY = e.clientY - rect.top;
    const startRectLeft = rect.left;
    const startRectTop = rect.top;

    let hasMoved = false;
    let finalX = startCssX;
    let finalY = startCssY;

    velocitySamplesRef.current = [{ x: startCssX, y: startCssY, t: performance.now() }];

    const applyDragStyle = () => {
      if (innerPanel) {
        innerPanel.style.transition = DRAG_TRANSITION;
        innerPanel.style.transform = `scale(${config.dragScale})`;
        innerPanel.style.boxShadow = DRAG_SHADOW;
      }
      panel.style.cursor = 'grabbing';
      document.body.style.cursor = 'grabbing';
    };

    const removeDragStyle = () => {
      if (innerPanel) {
        innerPanel.style.transition = DRAG_TRANSITION;
        innerPanel.style.transform = 'scale(1)';
        innerPanel.style.boxShadow = IDLE_SHADOW;
      }
      panel.style.cursor = '';
      document.body.style.cursor = '';
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const targetViewportX = moveEvent.clientX - grabOffsetX;
      const targetViewportY = moveEvent.clientY - grabOffsetY;
      const viewportDeltaX = targetViewportX - startRectLeft;
      const viewportDeltaY = targetViewportY - startRectTop;
      const cssDeltaX = viewportDeltaX / scale;
      const cssDeltaY = viewportDeltaY / scale;

      if (!hasMoved && (Math.abs(cssDeltaX) > 2 || Math.abs(cssDeltaY) > 2)) {
        hasMoved = true;
        setIsDragging(true);
        applyDragStyle();
        onDragStart?.(id);
      }

      if (hasMoved) {
        const bounds = getViewportBounds(scale);
        finalX = Math.max(bounds.minX, Math.min(bounds.maxX, startCssX + cssDeltaX));
        finalY = Math.max(bounds.minY, Math.min(bounds.maxY, startCssY + cssDeltaY));

        // Shift held: snap position to grid
        if (moveEvent.shiftKey) {
          finalX = snapToGrid(finalX);
          finalY = snapToGrid(finalY);
        }

        // Play grid sounds as panel moves over grid dots
        // Track current cell and play sound when entering a new one
        const centerX = finalX + panelWidth / 2;
        const centerY = finalY + panelHeight / 2;
        const cellX = Math.floor(centerX / GRID_CELL_SIZE);
        const cellY = Math.floor(centerY / GRID_CELL_SIZE);
        const cellKey = `${cellX},${cellY}`;

        // Build current cell set (just the one cell the center is in)
        const currentCell = new Set([cellKey]);

        // Play sound if this is a new cell (wasn't in previous set)
        if (!touchedGridCellsRef.current.has(cellKey)) {
          const now = performance.now();
          if (now - lastGridSoundTimeRef.current > 25) {
            const pitch = 1.0 + (Math.random() - 0.5) * 0.3;
            panelSounds.play(0.035, pitch);
            lastGridSoundTimeRef.current = now;
          }
        }

        // Update to current cell only (allows re-triggering when returning)
        touchedGridCellsRef.current = currentCell;

        panel.style.left = finalX + 'px';
        panel.style.top = finalY + 'px';
        onPositionChange?.(id, finalX, finalY);

        const now = performance.now();
        velocitySamplesRef.current.push({ x: finalX, y: finalY, t: now });
        if (velocitySamplesRef.current.length > config.velocitySampleCount) {
          velocitySamplesRef.current.shift();
        }
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      removeDragStyle();
      setIsDragging(false);

      if (hasMoved) {
        onDragEnd?.();
        const velocity = calculateVelocityFromSamples();
        const clamped = clampVelocity(velocity.x, velocity.y);
        const speed = Math.sqrt(clamped.vx * clamped.vx + clamped.vy * clamped.vy);

        if (speed > config.momentumThreshold) {
          animateMomentum(finalX, finalY, clamped.vx, clamped.vy, scale);
        } else {
          setPosition({ x: finalX, y: finalY });
        }
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Handle touch start - for mobile drag support
  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.touches.length !== 1) return; // Only single touch

    const touch = e.touches[0];
    const panel = panelRef.current;
    if (!panel) return;

    // Check if near edge for resize
    const rect = panel.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    const nearLeft = x < EDGE_THRESHOLD * 2; // Larger touch targets
    const nearRight = x > rect.width - EDGE_THRESHOLD * 2;
    const nearTop = y < EDGE_THRESHOLD * 2;
    const nearBottom = y > rect.height - EDGE_THRESHOLD * 2;

    let edge: ResizeEdge = null;
    if (nearTop && nearLeft) edge = 'nw';
    else if (nearTop && nearRight) edge = 'ne';
    else if (nearBottom && nearLeft) edge = 'sw';
    else if (nearBottom && nearRight) edge = 'se';
    else if (nearTop) edge = 'n';
    else if (nearBottom) edge = 's';
    else if (nearLeft) edge = 'w';
    else if (nearRight) edge = 'e';

    if (edge) {
      handleTouchResizeStart(touch, edge);
      return;
    }

    // Handle drag
    const wasAnimating = animationFrameRef.current !== null;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
      isAnimatingRef.current = false;
    }

    const innerPanel = innerPanelRef.current;
    const scale = rect.width / panelWidth;

    let startCssX = wasAnimating ? (parseFloat(panel.style.left) || position.x) : position.x;
    let startCssY = wasAnimating ? (parseFloat(panel.style.top) || position.y) : position.y;
    if (wasAnimating) setPosition({ x: startCssX, y: startCssY });

    const grabOffsetX = touch.clientX - rect.left;
    const grabOffsetY = touch.clientY - rect.top;
    const startRectLeft = rect.left;
    const startRectTop = rect.top;

    let hasMoved = false;
    let finalX = startCssX;
    let finalY = startCssY;

    velocitySamplesRef.current = [{ x: startCssX, y: startCssY, t: performance.now() }];

    const applyDragStyle = () => {
      if (innerPanel) {
        innerPanel.style.transition = DRAG_TRANSITION;
        innerPanel.style.transform = `scale(${config.dragScale})`;
        innerPanel.style.boxShadow = DRAG_SHADOW;
      }
    };

    const removeDragStyle = () => {
      if (innerPanel) {
        innerPanel.style.transition = DRAG_TRANSITION;
        innerPanel.style.transform = 'scale(1)';
        innerPanel.style.boxShadow = IDLE_SHADOW;
      }
    };

    const handleTouchMove = (moveEvent: TouchEvent) => {
      if (moveEvent.touches.length !== 1) return;
      moveEvent.preventDefault();

      const moveTouch = moveEvent.touches[0];
      const targetViewportX = moveTouch.clientX - grabOffsetX;
      const targetViewportY = moveTouch.clientY - grabOffsetY;
      const viewportDeltaX = targetViewportX - startRectLeft;
      const viewportDeltaY = targetViewportY - startRectTop;
      const cssDeltaX = viewportDeltaX / scale;
      const cssDeltaY = viewportDeltaY / scale;

      if (!hasMoved && (Math.abs(cssDeltaX) > 2 || Math.abs(cssDeltaY) > 2)) {
        hasMoved = true;
        setIsDragging(true);
        applyDragStyle();
        onDragStart?.(id);
      }

      if (hasMoved) {
        const bounds = getViewportBounds(scale);
        finalX = Math.max(bounds.minX, Math.min(bounds.maxX, startCssX + cssDeltaX));
        finalY = Math.max(bounds.minY, Math.min(bounds.maxY, startCssY + cssDeltaY));

        // Play grid sounds as panel moves over grid dots
        const centerX = finalX + panelWidth / 2;
        const centerY = finalY + panelHeight / 2;
        const cellX = Math.floor(centerX / GRID_CELL_SIZE);
        const cellY = Math.floor(centerY / GRID_CELL_SIZE);
        const cellKey = `${cellX},${cellY}`;

        // Build current cell set
        const currentCell = new Set([cellKey]);

        // Play sound if this is a new cell
        if (!touchedGridCellsRef.current.has(cellKey)) {
          const now = performance.now();
          if (now - lastGridSoundTimeRef.current > 25) {
            const pitch = 1.0 + (Math.random() - 0.5) * 0.3;
            panelSounds.play(0.035, pitch);
            lastGridSoundTimeRef.current = now;
          }
        }

        // Update to current cell only
        touchedGridCellsRef.current = currentCell;

        panel.style.left = finalX + 'px';
        panel.style.top = finalY + 'px';
        onPositionChange?.(id, finalX, finalY);

        const now = performance.now();
        velocitySamplesRef.current.push({ x: finalX, y: finalY, t: now });
        if (velocitySamplesRef.current.length > config.velocitySampleCount) {
          velocitySamplesRef.current.shift();
        }
      }
    };

    const handleTouchEnd = () => {
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      removeDragStyle();
      setIsDragging(false);

      if (hasMoved) {
        onDragEnd?.();
        const velocity = calculateVelocityFromSamples();
        const clamped = clampVelocity(velocity.x, velocity.y);
        const speed = Math.sqrt(clamped.vx * clamped.vx + clamped.vy * clamped.vy);

        if (speed > config.momentumThreshold) {
          animateMomentum(finalX, finalY, clamped.vx, clamped.vy, scale);
        } else {
          setPosition({ x: finalX, y: finalY });
        }
      }
    };

    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
  };

  // Handle touch resize start
  const handleTouchResizeStart = (touch: Touch | React.Touch, edge: ResizeEdge) => {
    if (!edge) return;

    const panel = panelRef.current;
    if (!panel) return;

    setIsResizing(true);
    onDragStart?.(id);

    const startMouseX = touch.clientX;
    const startMouseY = touch.clientY;
    const startX = position.x;
    const startY = position.y;
    const startWidth = size.width;
    const startHeight = size.height;
    const startAspectRatio = startWidth / startHeight;

    const handleTouchResizeMove = (moveEvent: TouchEvent) => {
      if (moveEvent.touches.length !== 1) return;
      moveEvent.preventDefault();

      const moveTouch = moveEvent.touches[0];
      const deltaX = moveTouch.clientX - startMouseX;
      const deltaY = moveTouch.clientY - startMouseY;

      let newX = startX;
      let newY = startY;
      let newWidth = startWidth;
      let newHeight = startHeight;

      // Handle horizontal resizing
      if (edge.includes('e')) {
        newWidth = Math.max(MIN_SIZE, startWidth + deltaX);
      }
      if (edge.includes('w')) {
        const widthDelta = Math.min(deltaX, startWidth - MIN_SIZE);
        newWidth = startWidth - widthDelta;
        newX = startX + widthDelta;
      }

      // Handle vertical resizing
      if (edge.includes('s')) {
        newHeight = Math.max(MIN_SIZE, startHeight + deltaY);
      }
      if (edge.includes('n')) {
        const heightDelta = Math.min(deltaY, startHeight - MIN_SIZE);
        newHeight = startHeight - heightDelta;
        newY = startY + heightDelta;
      }

      // Ensure size is within bounds
      newWidth = Math.max(MIN_SIZE, Math.min(MAX_SIZE, newWidth));
      newHeight = Math.max(MIN_SIZE, Math.min(MAX_SIZE, newHeight));

      // Apply bounds
      const bounds = getViewportBounds(1);
      newX = Math.max(bounds.minX, newX);
      newY = Math.max(bounds.minY, newY);

      // Play grid sound when size crosses grid boundaries
      const widthCells = Math.floor(newWidth / GRID_CELL_SIZE);
      const heightCells = Math.floor(newHeight / GRID_CELL_SIZE);
      const sizeKey = `${widthCells},${heightCells}`;

      const currentSizeCell = new Set([sizeKey]);
      if (!touchedGridCellsRef.current.has(sizeKey)) {
        const now = performance.now();
        if (now - lastGridSoundTimeRef.current > 25) {
          const pitch = 1.0 + (Math.random() - 0.5) * 0.3;
          panelSounds.play(0.02, pitch); // Lower volume for resize
          lastGridSoundTimeRef.current = now;
        }
      }
      touchedGridCellsRef.current = currentSizeCell;

      // Update state
      setSize({ width: newWidth, height: newHeight });
      setPosition({ x: newX, y: newY });

      // Update DOM directly for smoothness
      panel.style.left = newX + 'px';
      panel.style.top = newY + 'px';
      panel.style.width = newWidth + 'px';
      panel.style.height = newHeight + 'px';

      // Notify parent
      onPositionChange?.(id, newX, newY);
      onSizeChange?.(id, newWidth, newHeight);
    };

    const handleTouchResizeEnd = () => {
      document.removeEventListener('touchmove', handleTouchResizeMove);
      document.removeEventListener('touchend', handleTouchResizeEnd);
      setIsResizing(false);
      onDragEnd?.();
    };

    document.addEventListener('touchmove', handleTouchResizeMove, { passive: false });
    document.addEventListener('touchend', handleTouchResizeEnd);
  };

  // Snap value to grid
  const snapToGrid = (value: number): number => {
    return Math.round(value / GRID_CELL_SIZE) * GRID_CELL_SIZE;
  };

  // Check if panel has been resized from original size
  const hasBeenResized = size.width !== originalSizeRef.current.width || size.height !== originalSizeRef.current.height;

  // Reset to default size (scale from center, animated)
  const handleResetSize = (e: React.MouseEvent) => {
    e.stopPropagation();
    const { width: newWidth, height: newHeight } = originalSizeRef.current;

    // Calculate new position to keep center fixed
    const centerX = position.x + size.width / 2;
    const centerY = position.y + size.height / 2;
    const newX = centerX - newWidth / 2;
    const newY = centerY - newHeight / 2;

    // Animate the transition
    const panel = panelRef.current;
    if (panel) {
      panel.style.transition = 'width 0.2s ease, height 0.2s ease, left 0.2s ease, top 0.2s ease';
      panel.style.width = newWidth + 'px';
      panel.style.height = newHeight + 'px';
      panel.style.left = newX + 'px';
      panel.style.top = newY + 'px';

      // Remove transition after animation completes
      setTimeout(() => {
        panel.style.transition = '';
      }, 200);
    }

    setSize({ width: newWidth, height: newHeight });
    setPosition({ x: newX, y: newY });
    onSizeChange?.(id, newWidth, newHeight);
    onPositionChange?.(id, newX, newY);
  };

  // Dismiss panel
  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDismiss?.(id);
  };

  // Handle connection drag start (mouse)
  const handleConnectionDragStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    const panel = panelRef.current;
    if (!panel) return;

    const rect = panel.getBoundingClientRect();
    // Connection starts from the right side of the panel (where the triangle icon is)
    const startX = rect.right - 10;
    const startY = rect.top + 10;

    onConnectionDragStart?.(id, startX, startY);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      onConnectionDragMove?.(moveEvent.clientX, moveEvent.clientY);
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      // Check if we're over another panel
      const elementsAtPoint = document.elementsFromPoint(upEvent.clientX, upEvent.clientY);
      let targetPanelId: string | null = null;

      for (const el of elementsAtPoint) {
        const panelEl = el.closest('[data-panel-id]');
        if (panelEl) {
          const panelId = panelEl.getAttribute('data-panel-id');
          if (panelId && panelId !== id) {
            targetPanelId = panelId;
            break;
          }
        }
      }

      onConnectionDragEnd?.(id, targetPanelId, upEvent.clientX, upEvent.clientY);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Handle connection drag start (touch)
  const handleConnectionTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    const panel = panelRef.current;
    if (!panel) return;

    const rect = panel.getBoundingClientRect();
    const startX = rect.right - 10;
    const startY = rect.top + 10;

    onConnectionDragStart?.(id, startX, startY);

    const handleTouchMove = (moveEvent: TouchEvent) => {
      moveEvent.preventDefault();
      if (moveEvent.touches.length !== 1) return;
      const moveTouch = moveEvent.touches[0];
      onConnectionDragMove?.(moveTouch.clientX, moveTouch.clientY);
    };

    const handleTouchEnd = (endEvent: TouchEvent) => {
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);

      const endTouch = endEvent.changedTouches[0];
      const elementsAtPoint = document.elementsFromPoint(endTouch.clientX, endTouch.clientY);
      let targetPanelId: string | null = null;

      for (const el of elementsAtPoint) {
        const panelEl = el.closest('[data-panel-id]');
        if (panelEl) {
          const panelId = panelEl.getAttribute('data-panel-id');
          if (panelId && panelId !== id) {
            targetPanelId = panelId;
            break;
          }
        }
      }

      onConnectionDragEnd?.(id, targetPanelId, endTouch.clientX, endTouch.clientY);
    };

    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
  };

  // Handle resize start
  const handleResizeStart = (e: React.MouseEvent, edge: ResizeEdge) => {
    if (!edge) return;

    const panel = panelRef.current;
    if (!panel) return;

    setIsResizing(true);
    onDragStart?.(id); // Bring to top while resizing

    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startX = position.x;
    const startY = position.y;
    const startWidth = size.width;
    const startHeight = size.height;
    const startAspectRatio = startWidth / startHeight;

    const cursor = getCursor(edge);
    document.body.style.cursor = cursor;

    const handleResizeMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startMouseX;
      const deltaY = moveEvent.clientY - startMouseY;
      const shiftHeld = moveEvent.shiftKey;
      const cmdHeld = moveEvent.metaKey;

      let newX = startX;
      let newY = startY;
      let newWidth = startWidth;
      let newHeight = startHeight;

      // When CMD is held, we scale from center so we need to double the delta
      // to keep the edge under the cursor
      const scaleFactor = cmdHeld ? 2 : 1;

      // Handle horizontal resizing
      if (edge.includes('e')) {
        newWidth = startWidth + deltaX * scaleFactor;
      }
      if (edge.includes('w')) {
        newWidth = startWidth - deltaX * scaleFactor;
      }

      // Handle vertical resizing
      if (edge.includes('s')) {
        newHeight = startHeight + deltaY * scaleFactor;
      }
      if (edge.includes('n')) {
        newHeight = startHeight - deltaY * scaleFactor;
      }

      // CMD held with corners: lock aspect ratio
      if (cmdHeld) {
        const isCorner = edge.length === 2; // 'ne', 'nw', 'se', 'sw'

        if (isCorner) {
          const widthChange = newWidth - startWidth;
          const heightChange = newHeight - startHeight;

          // Use the larger delta to determine size
          if (Math.abs(widthChange) > Math.abs(heightChange)) {
            newHeight = newWidth / startAspectRatio;
          } else {
            newWidth = newHeight * startAspectRatio;
          }
        }
      }

      // Shift held: snap to grid
      if (shiftHeld) {
        newWidth = Math.max(GRID_CELL_SIZE, snapToGrid(newWidth));
        newHeight = Math.max(GRID_CELL_SIZE, snapToGrid(newHeight));
      }

      // Ensure size is within bounds
      newWidth = Math.max(MIN_SIZE, Math.min(MAX_SIZE, newWidth));
      newHeight = Math.max(MIN_SIZE, Math.min(MAX_SIZE, newHeight));

      // Calculate position based on final clamped size
      if (cmdHeld) {
        // CMD held: scale from center
        const startCenterX = startX + startWidth / 2;
        const startCenterY = startY + startHeight / 2;
        newX = startCenterX - newWidth / 2;
        newY = startCenterY - newHeight / 2;
      } else {
        // Normal resize: anchor opposite edge
        if (edge.includes('w')) {
          newX = startX + startWidth - newWidth;
        }
        if (edge.includes('n')) {
          newY = startY + startHeight - newHeight;
        }
      }

      // Apply bounds
      const bounds = getViewportBounds(1);
      newX = Math.max(bounds.minX, newX);
      newY = Math.max(bounds.minY, newY);

      // Adjust size if position was clamped
      if (edge.includes('w') && newX === bounds.minX) {
        newWidth = startX + startWidth - bounds.minX;
      }
      if (edge.includes('n') && newY === bounds.minY) {
        newHeight = startY + startHeight - bounds.minY;
      }

      // Play grid sound when size crosses grid boundaries
      const widthCells = Math.floor(newWidth / GRID_CELL_SIZE);
      const heightCells = Math.floor(newHeight / GRID_CELL_SIZE);
      const sizeKey = `${widthCells},${heightCells}`;

      const currentSizeCell = new Set([sizeKey]);
      if (!touchedGridCellsRef.current.has(sizeKey)) {
        const now = performance.now();
        if (now - lastGridSoundTimeRef.current > 25) {
          const pitch = 1.0 + (Math.random() - 0.5) * 0.3;
          panelSounds.play(0.02, pitch); // Lower volume for resize
          lastGridSoundTimeRef.current = now;
        }
      }
      touchedGridCellsRef.current = currentSizeCell;

      // Update state
      setSize({ width: newWidth, height: newHeight });
      setPosition({ x: newX, y: newY });

      // Update DOM directly for smoothness
      panel.style.left = newX + 'px';
      panel.style.top = newY + 'px';
      panel.style.width = newWidth + 'px';
      panel.style.height = newHeight + 'px';

      // Notify parent
      onPositionChange?.(id, newX, newY);
      onSizeChange?.(id, newWidth, newHeight);
    };

    const handleResizeEnd = () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = '';
      setIsResizing(false);
      onDragEnd?.();
    };

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  // Dynamic border opacity based on hover state (subtle increase)
  const borderOpacity = isHovered || isResizing ? 0.16 : 0.1;

  return (
    <motion.div
      ref={panelRef}
      data-panel-id={id}
      onMouseDown={handleMouseDown}
      onMouseMove={handlePanelMouseMove}
      onMouseEnter={handlePanelMouseEnter}
      onMouseLeave={handlePanelMouseLeave}
      onTouchStart={handleTouchStart}
      onClick={(e) => e.stopPropagation()}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={isExiting ? { opacity: 0, scale: 0.8 } : { opacity: 1, scale: 1 }}
      transition={{
        opacity: { duration: 0.15 },
        scale: { type: 'spring', stiffness: 500, damping: 25 },
      }}
      style={{
        position: 'fixed',
        userSelect: 'none',
        left: position.x,
        top: position.y,
        width: panelWidth,
        height: panelHeight,
        zIndex: isDragging || isResizing ? 2147483647 : (isTopPanel ? 2147483646 : 2147483645),
        cursor: resizeEdge ? getCursor(resizeEdge) : 'default',
      }}
    >
      <div
        ref={innerPanelRef}
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 12,
          position: 'relative',
          backgroundColor: 'var(--panel-bg)',
          boxShadow: IDLE_SHADOW,
          border: `1px solid rgba(255, 255, 255, ${borderOpacity})`,
          transition: 'border-color 0.2s ease',
        }}
      >
        {/* Control icons - top right */}
        <div
          style={{
            position: 'absolute',
            top: 7,
            right: 7,
            display: 'flex',
            gap: 0,
            opacity: (isHovered || isResizing || isTouchDevice) ? 1 : 0,
            transition: 'opacity 0.2s ease',
            pointerEvents: (isHovered || isResizing || isTouchDevice) ? 'auto' : 'none',
          }}
        >
          {/* Reset size - only visible after resizing */}
          {hasBeenResized && (
            <button
              onClick={handleResetSize}
              onMouseDown={(e) => e.stopPropagation()}
              onMouseEnter={(e) => {
                const span = e.currentTarget.querySelector('span');
                if (span) span.style.backgroundColor = '#808080';
              }}
              onMouseLeave={(e) => {
                const span = e.currentTarget.querySelector('span');
                if (span) span.style.backgroundColor = '#444444';
              }}
              style={{
                width: 16,
                height: 16,
                border: 'none',
                borderRadius: 4,
                backgroundColor: 'transparent',
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Reset size"
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  backgroundColor: '#444444',
                  transition: 'background-color 0.2s ease',
                  display: 'block',
                  pointerEvents: 'none',
                }}
              />
            </button>
          )}
          {/* Dismiss button - filled circle */}
          <button
            onClick={handleDismiss}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseEnter={(e) => {
              const span = e.currentTarget.querySelector('span');
              if (span) span.style.backgroundColor = '#808080';
            }}
            onMouseLeave={(e) => {
              const span = e.currentTarget.querySelector('span');
              if (span) span.style.backgroundColor = '#444444';
            }}
            style={{
              width: 16,
              height: 16,
              border: 'none',
              borderRadius: 4,
              backgroundColor: 'transparent',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Dismiss"
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: '#444444',
                transition: 'background-color 0.2s ease',
                display: 'block',
                pointerEvents: 'none',
              }}
            />
          </button>
        </div>

        {/* Connection button - bottom right, always visible on hover */}
        <button
          onMouseDown={handleConnectionDragStart}
          onTouchStart={handleConnectionTouchStart}
          onMouseEnter={(e) => {
            const rect = e.currentTarget.querySelector('rect');
            if (rect) rect.style.stroke = '#808080';
          }}
          onMouseLeave={(e) => {
            const rect = e.currentTarget.querySelector('rect');
            if (rect) rect.style.stroke = '#444444';
          }}
          style={{
            position: 'absolute',
            bottom: 7,
            right: 7,
            width: 16,
            height: 16,
            border: 'none',
            borderRadius: 4,
            backgroundColor: 'transparent',
            cursor: 'crosshair',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: (isHovered || isResizing || isTouchDevice) ? 1 : 0,
            transition: 'opacity 0.2s ease',
            pointerEvents: (isHovered || isResizing || isTouchDevice) ? 'auto' : 'none',
          }}
          title="Drag to connect"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" style={{ pointerEvents: 'none' }}>
            <rect
              x="1"
              y="1"
              width="8"
              height="8"
              fill="none"
              stroke="#444444"
              strokeWidth="1.5"
              rx="1"
              style={{ transition: 'stroke 0.2s ease' }}
            />
          </svg>
        </button>
      </div>
    </motion.div>
  );
}


export default function GridPlayground() {
  const router = useRouter();
  const [config] = useState<PhysicsConfig>(DEFAULT_CONFIG);
  // Main panel is off-screen (no longer visible, only floating panels affect grid)
  const [panelPos] = useState({ x: -9999, y: -9999 });
  const [panelSize] = useState({ width: 0, height: 0 });
  const [pulses, setPulses] = useState<PulseEvent[]>([]);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [floatingPanels, setFloatingPanels] = useState<FloatingPanelData[]>([]);
  const [canvasResetKey, setCanvasResetKey] = useState(0);
  const [gridType, setGridType] = useState<GridType>('rectangular');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [accentHex, setAccentHex] = useState<string>('#2563eb');
  const exportCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const panelIdCounter = useRef(1); // Start at 1 since we have a default panel
  const hasSpawnedDefaultPanel = useRef(false);
  const isDraggingRef = useRef(false); // Track if any panel is being dragged
  const sliceDragRef = useRef<{ startX: number; startY: number; lastX: number; lastY: number; isSlicing: boolean } | null>(null);
  const viewportRef = useRef({ width: typeof window !== 'undefined' ? window.innerWidth : 0, height: typeof window !== 'undefined' ? window.innerHeight : 0 });
  const [resizeKey, setResizeKey] = useState(0); // Forces panel re-init on resize
  const [topPanelId, setTopPanelId] = useState<string | null>(null); // Last dragged panel stays on top
  const [connections, setConnections] = useState<PanelConnection[]>([]); // Connections between panels
  const [connectionDrag, setConnectionDrag] = useState<ConnectionDrag | null>(null); // Active connection drag
  const [sliceTrail, setSliceTrail] = useState<SlicePoint[]>([]); // Visual trail for slice gesture
  const [cutConnections, setCutConnections] = useState<CutConnection[]>([]); // Connections being animated after cut
  const lastConnectionTargetRef = useRef<string | null>(null); // Track previous connection target for sound
  const touchedGridDotsRef = useRef<Set<string>>(new Set()); // Track grid dots touched during connection drag
  const lastDotSoundTimeRef = useRef(0); // Throttle dot sounds when moving fast

  // Keyboard: ArrowRight / ArrowDown advances the grid story
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      e.stopPropagation();
      soundEffects.playQuickStartClick();
      setGridType(prev => {
        const idx = NODE_GRID_ORDER.indexOf(prev);
        const next = NODE_GRID_ORDER[(idx >= 0 ? idx + 1 : 0) % NODE_GRID_ORDER.length];
        return next;
      });
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  // Disable CSS zoom on this page for proper canvas alignment
  useEffect(() => {
    document.documentElement.classList.add('no-zoom');
    return () => {
      document.documentElement.classList.remove('no-zoom');
    };
  }, []);

  // Apply theme + accent to CSS variables
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

  const exportImage = useCallback(async (format: 'png' | 'jpeg') => {
    const canvas = exportCanvasRef.current;
    if (!canvas) return;
    const mime = format === 'png' ? 'image/png' : 'image/jpeg';
    const ext = format === 'png' ? 'png' : 'jpg';
    const fileName = `grid-${gridType}-${Date.now()}.${ext}`;

    // Prefer toBlob (better memory) but fallback to data URL
    const blob: Blob | null = await new Promise(resolve => {
      if ('toBlob' in canvas) {
        canvas.toBlob(b => resolve(b), mime, 0.92);
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

  const copyReactTailwindCode = useCallback(async () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const slug = gridTypeToSlug(gridType);
    const isolatedPath = `/nodegrid/${slug}`;
    const isolatedUrl = origin ? `${origin}${isolatedPath}` : isolatedPath;
    const label = gridTypeLabel(gridType);
    const fence = '```';
    const routeLines = NODE_GRID_ORDER.map((t) => {
      const base = origin ? `${origin}/nodegrid/` : '/nodegrid/';
      return ` * ${base}${gridTypeToSlug(t)}`;
    }).join('\n');

    const code = `/**
 * Robot Components — Node Grid background: "${label}"
 * ---------------------------------------------------------------------------
 * gridType (internal):  ${gridType}
 * Public isolated demo: ${isolatedUrl}
 * Upstream source tree: ${NODEGRID_GITHUB_BASE}
 *
 * WHAT THIS IS
 * The background is a React canvas layer (2D dots + links) plus an optional
 * WebGL film-grain overlay — not a pure Tailwind/CSS pattern. To port it,
 * copy the implementation files from the repo (keep paths or fix imports).
 *
 * FILES TO COPY INTO YOUR APP (from robot-components)
 * - app/nodegrid/grid-types.ts
 * - app/nodegrid/grid.css
 * - app/nodegrid/_components/panel-sounds.ts
 * - app/nodegrid/_components/dot-grid-canvas.tsx
 * - app/nodegrid/_components/node-grid-isolated.tsx   (thin wrapper + theme CSS vars)
 *
 * TUNABLE PROPS (edit in your theme editor)
 * - gridType: GridType   // algorithm / layout preset
 * - theme:    'dark' | 'light'
 * - accentHex: '#rrggbb' // accent for links / highlights (also sets --accent on :root)
 *
 * MINIMAL USAGE (after copying the files above; fix the import path for your repo)
 */
import { NodeGridIsolated } from './_components/node-grid-isolated'; // e.g. @/app/nodegrid/...

export function MyThemeBackground() {
  return (
    <NodeGridIsolated
      gridType="${gridType}"
      theme="${theme}"
      accentHex="${accentHex}"
      withNoiseOverlay
    />
  );
}

/**
 * DotGridCanvas (advanced): if you embed inside an existing editor shell, you
 * can import DotGridCanvas + NoiseOverlay from dot-grid-canvas.tsx and pass
 * panel/pulse/connection state like the full /nodegrid playground.
 *
 * All preset routes (no HUD, crawler-friendly):
${routeLines}
 */
${fence}tsx
// Tailwind-only chrome from the playground (optional — not the grid itself):
<div className="relative h-screen w-screen overflow-hidden bg-[var(--app-bg)] text-[var(--app-fg)]">
  <div className="absolute right-8 top-8 flex items-center gap-2">
    <button type="button" className="rounded-lg border border-[var(--btn-outline)] bg-white/10 px-3 py-2 text-xs font-semibold">
      Theme
    </button>
    <input type="color" defaultValue="${accentHex}" className="h-8 w-8 cursor-pointer rounded-lg border border-[var(--btn-outline)] bg-transparent p-0" aria-label="Accent" />
    <input defaultValue="${accentHex}" className="w-28 rounded-lg border border-[var(--btn-outline)] bg-white/10 px-2 py-2 font-mono text-xs outline-none" aria-label="Accent hex" />
  </div>
</div>
${fence}
`;

    await navigator.clipboard.writeText(code);
  }, [accentHex, gridType, theme]);

  // Clear all panels and connections with animation
  const clearAll = useCallback(() => {
    // Mark all panels as exiting to trigger exit animations
    setFloatingPanels(prev => prev.map(p => ({ ...p, isExiting: true })));
    // Clear connections immediately
    setConnections([]);
    setCutConnections([]);
    setConnectionDrag(null);
    setSliceTrail([]);
    // Remove panels after animation completes and reset canvas
    setTimeout(() => {
      setFloatingPanels([]);
      panelIdCounter.current = 0;
      setCanvasResetKey(k => k + 1); // Force canvas remount to reset dot positions
    }, 200);
  }, []);

  // Disable cmd+k and cmd+u shortcuts, handle ESC to clear all
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Disable cmd+k and cmd+u
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'u')) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // ESC clears all (only if 2+ panels)
      if (e.key === 'Escape' && floatingPanels.length >= 2) {
        e.preventDefault();
        clearAll();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [floatingPanels.length, clearAll]);

  // Spawn a default panel on mount
  useEffect(() => {
    if (hasSpawnedDefaultPanel.current) return;
    hasSpawnedDefaultPanel.current = true;

    // Center the panel in the viewport
    const x = (window.innerWidth - FLOATING_PANEL_SIZE.width) / 2;
    const y = (window.innerHeight - FLOATING_PANEL_SIZE.height) / 2;

    setFloatingPanels([{
      id: 'floating-panel-0',
      x,
      y,
      width: FLOATING_PANEL_SIZE.width,
      height: FLOATING_PANEL_SIZE.height,
    }]);
  }, []);

  // Keep floating panels centered on resize
  useEffect(() => {
    const handleResize = () => {
      const oldWidth = viewportRef.current.width;
      const oldHeight = viewportRef.current.height;
      const newWidth = window.innerWidth;
      const newHeight = window.innerHeight;

      if (oldWidth === 0 || oldHeight === 0) {
        viewportRef.current = { width: newWidth, height: newHeight };
        return;
      }

      // Scale panel positions proportionally
      setFloatingPanels(prev => prev.map(p => ({
        ...p,
        x: (p.x / oldWidth) * newWidth,
        y: (p.y / oldHeight) * newHeight,
      })));

      // Force FloatingPanel components to reinitialize with new positions
      setResizeKey(k => k + 1);

      viewportRef.current = { width: newWidth, height: newHeight };
    };

    // Initialize viewport size
    viewportRef.current = { width: window.innerWidth, height: window.innerHeight };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);


  const handleBounce = useCallback((x: number, y: number, intensity: number) => {
    setPulses(prev => {
      // Keep only recent pulses (last 2 seconds) plus new one
      const now = performance.now();
      const recent = prev.filter(p => now - p.time < 2000);
      return [...recent, { x, y, time: now, intensity }];
    });
  }, []);

  // Line segment intersection helper
  const lineSegmentsIntersect = useCallback((x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number) => {
    const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
    if (Math.abs(denom) < 0.0001) return false; // Parallel lines

    const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
    const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

    return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
  }, []);

  // Track mouse position for hover glow and slice detection
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });

    // Check for slice gesture
    if (sliceDragRef.current?.isSlicing) {
      const { lastX, lastY } = sliceDragRef.current;
      const currX = e.clientX;
      const currY = e.clientY;
      const now = performance.now();

      // Add point to slice trail
      setSliceTrail(prev => {
        // Remove old points (older than 300ms)
        const recent = prev.filter(p => now - p.time < 300);
        return [...recent, { x: currX, y: currY, time: now }];
      });

      // Check if the mouse movement crosses any connection line
      // We need to check against the actual L-shaped grid path, not just the direct line
      const gridSize = 40; // Same as in DotGridCanvas

      if (connections.length > 0) {
        for (const conn of connections) {
          const fromPanel = floatingPanels.find(p => p.id === conn.fromPanelId);
          const toPanel = floatingPanels.find(p => p.id === conn.toPanelId);

          if (fromPanel && toPanel) {
            const fromX = fromPanel.x + fromPanel.width / 2;
            const fromY = fromPanel.y + fromPanel.height / 2;
            const toX = toPanel.x + toPanel.width / 2;
            const toY = toPanel.y + toPanel.height / 2;

            // Build the L-shaped grid path (same logic as DotGridCanvas)
            const startGx = Math.round(fromX / gridSize) * gridSize;
            const startGy = Math.round(fromY / gridSize) * gridSize;
            const endGx = Math.round(toX / gridSize) * gridSize;
            const endGy = Math.round(toY / gridSize) * gridSize;

            const pathPoints: { x: number; y: number }[] = [];

            // Horizontal segment points
            const xStep = startGx < endGx ? gridSize : -gridSize;
            if (startGx !== endGx) {
              for (let gx = startGx; xStep > 0 ? gx <= endGx : gx >= endGx; gx += xStep) {
                pathPoints.push({ x: gx, y: startGy });
              }
            } else {
              pathPoints.push({ x: startGx, y: startGy });
            }

            // Vertical segment points
            const yStep = startGy < endGy ? gridSize : -gridSize;
            if (startGy !== endGy) {
              for (let gy = startGy + yStep; yStep > 0 ? gy <= endGy : gy >= endGy; gy += yStep) {
                pathPoints.push({ x: endGx, y: gy });
              }
            }

            // Check intersection with each segment of the path
            let intersected = false;
            let cutPoint = { x: (lastX + currX) / 2, y: (lastY + currY) / 2 };

            for (let i = 0; i < pathPoints.length - 1; i++) {
              const p1 = pathPoints[i];
              const p2 = pathPoints[i + 1];

              if (lineSegmentsIntersect(lastX, lastY, currX, currY, p1.x, p1.y, p2.x, p2.y)) {
                intersected = true;
                // Calculate intersection point for better cut position
                cutPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
                break;
              }
            }

            if (intersected) {
              // Slice this connection!
              setCutConnections(prev => [...prev, {
                id: conn.id,
                fromPanelId: conn.fromPanelId,
                toPanelId: conn.toPanelId,
                cutX: cutPoint.x,
                cutY: cutPoint.y,
                cutTime: now,
              }]);
              setConnections(prev => prev.filter(c => c.id !== conn.id));
              // Play cut sound
              panelSounds.playRandomized(0.05, 0.7, 0.15);
              break;
            }
          }
        }
      }

      sliceDragRef.current.lastX = currX;
      sliceDragRef.current.lastY = currY;
    }
  }, [connections, floatingPanels, lineSegmentsIntersect]);

  const handleMouseLeave = useCallback(() => {
    setMousePos(null);
    sliceDragRef.current = null;
  }, []);

  // Start potential slice gesture on mouse down (only on background)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start slice if clicking on the background (not on a panel)
    const target = e.target as HTMLElement;
    if (target.closest('[data-panel-id]')) return;

    sliceDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      isSlicing: false,
    };
  }, []);

  // End slice gesture on mouse up
  const handleMouseUp = useCallback(() => {
    if (sliceDragRef.current?.isSlicing) {
      // Delay resetting isDragging to prevent spawn
      setTimeout(() => {
        isDraggingRef.current = false;
      }, 50);
    }
    sliceDragRef.current = null;
  }, []);

  // Start potential slice gesture on touch (only on background)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const target = e.target as HTMLElement;
    if (target.closest('[data-panel-id]')) return;

    sliceDragRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      lastX: touch.clientX,
      lastY: touch.clientY,
      isSlicing: false,
    };
  }, []);

  // Handle touch move for slice gesture
  const handleTouchMoveSlice = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];

    // Check for slice gesture
    if (sliceDragRef.current?.isSlicing) {
      const { lastX, lastY } = sliceDragRef.current;
      const currX = touch.clientX;
      const currY = touch.clientY;
      const now = performance.now();

      // Add point to slice trail
      setSliceTrail(prev => {
        const newTrail = [...prev, { x: currX, y: currY, time: now }];
        const cutoff = now - 300;
        return newTrail.filter(p => p.time > cutoff);
      });

      // Check for intersection with connection lines
      for (const conn of connections) {
        const fromPanel = floatingPanels.find(p => p.id === conn.fromPanelId);
        const toPanel = floatingPanels.find(p => p.id === conn.toPanelId);
        if (!fromPanel || !toPanel) continue;

        const fromCenter = { x: fromPanel.x + fromPanel.width / 2, y: fromPanel.y + fromPanel.height / 2 };
        const toCenter = { x: toPanel.x + toPanel.width / 2, y: toPanel.y + toPanel.height / 2 };

        const gridSize = 40;
        const snapToGrid = (val: number) => Math.round(val / gridSize) * gridSize;

        const fromGridX = snapToGrid(fromCenter.x);
        const fromGridY = snapToGrid(fromCenter.y);
        const toGridX = snapToGrid(toCenter.x);
        const toGridY = snapToGrid(toCenter.y);

        const segments: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
        if (Math.abs(toGridX - fromGridX) >= Math.abs(toGridY - fromGridY)) {
          const midX = fromGridX + Math.round((toGridX - fromGridX) / 2 / gridSize) * gridSize;
          segments.push({ x1: fromGridX, y1: fromGridY, x2: midX, y2: fromGridY });
          segments.push({ x1: midX, y1: fromGridY, x2: midX, y2: toGridY });
          segments.push({ x1: midX, y1: toGridY, x2: toGridX, y2: toGridY });
        } else {
          const midY = fromGridY + Math.round((toGridY - fromGridY) / 2 / gridSize) * gridSize;
          segments.push({ x1: fromGridX, y1: fromGridY, x2: fromGridX, y2: midY });
          segments.push({ x1: fromGridX, y1: midY, x2: toGridX, y2: midY });
          segments.push({ x1: toGridX, y1: midY, x2: toGridX, y2: toGridY });
        }

        for (const seg of segments) {
          if (lineSegmentsIntersect(lastX, lastY, currX, currY, seg.x1, seg.y1, seg.x2, seg.y2)) {
            setCutConnections(prev => [...prev, {
              ...conn,
              cutX: currX,
              cutY: currY,
              cutTime: now,
            }]);
            setConnections(prev => prev.filter(c => c.id !== conn.id));
            panelSounds.playRandomized(0.05, 0.7, 0.15);
            break;
          }
        }
      }

      sliceDragRef.current.lastX = currX;
      sliceDragRef.current.lastY = currY;
    }
  }, [connections, floatingPanels, lineSegmentsIntersect]);

  // End slice gesture on touch end
  const handleTouchEnd = useCallback(() => {
    if (sliceDragRef.current?.isSlicing) {
      setTimeout(() => {
        isDraggingRef.current = false;
      }, 50);
    }
    sliceDragRef.current = null;
  }, []);

  // Detect when we start actually slicing (moved enough distance)
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (sliceDragRef.current && !sliceDragRef.current.isSlicing) {
        const dx = e.clientX - sliceDragRef.current.startX;
        const dy = e.clientY - sliceDragRef.current.startY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Start slicing after moving 10px
        if (dist > 10) {
          sliceDragRef.current.isSlicing = true;
          isDraggingRef.current = true; // Prevent click-to-spawn
        }
      }
    };

    const handleGlobalMouseUp = () => {
      if (sliceDragRef.current?.isSlicing) {
        // Delay resetting isDragging to prevent spawn
        setTimeout(() => {
          isDraggingRef.current = false;
        }, 50);
      }
      sliceDragRef.current = null;
    };

    // Touch handlers for slice gesture
    const handleGlobalTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];

      if (sliceDragRef.current && !sliceDragRef.current.isSlicing) {
        const dx = touch.clientX - sliceDragRef.current.startX;
        const dy = touch.clientY - sliceDragRef.current.startY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Start slicing after moving 10px
        if (dist > 10) {
          sliceDragRef.current.isSlicing = true;
          isDraggingRef.current = true;
        }
      }
    };

    const handleGlobalTouchEnd = () => {
      if (sliceDragRef.current?.isSlicing) {
        setTimeout(() => {
          isDraggingRef.current = false;
        }, 50);
      }
      sliceDragRef.current = null;
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchmove', handleGlobalTouchMove);
    window.addEventListener('touchend', handleGlobalTouchEnd);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchmove', handleGlobalTouchMove);
      window.removeEventListener('touchend', handleGlobalTouchEnd);
    };
  }, []);

  // Spawn floating panel on click
  const handleGridClick = useCallback((e: React.MouseEvent) => {
    // Don't spawn if we just finished dragging
    if (isDraggingRef.current) return;

    // Play spawn sound
    panelSounds.playRandomized(0.04, 0.9, 0.1);

    // Spawn panel centered on click position
    const x = e.clientX - FLOATING_PANEL_SIZE.width / 2;
    const y = e.clientY - FLOATING_PANEL_SIZE.height / 2;
    const id = `floating-panel-${panelIdCounter.current++}`;

    setFloatingPanels(prev => [...prev, {
      id,
      x,
      y,
      width: FLOATING_PANEL_SIZE.width,
      height: FLOATING_PANEL_SIZE.height,
    }]);
  }, []);

  // Spawn floating panel on touch (mobile)
  const handleGridTouch = useCallback((e: React.TouchEvent) => {
    // Don't spawn if we just finished dragging
    if (isDraggingRef.current) return;
    if (e.changedTouches.length !== 1) return;

    // Play spawn sound
    panelSounds.playRandomized(0.04, 0.9, 0.1);

    const touch = e.changedTouches[0];
    // Spawn panel centered on touch position
    const x = touch.clientX - FLOATING_PANEL_SIZE.width / 2;
    const y = touch.clientY - FLOATING_PANEL_SIZE.height / 2;
    const id = `floating-panel-${panelIdCounter.current++}`;

    setFloatingPanels(prev => [...prev, {
      id,
      x,
      y,
      width: FLOATING_PANEL_SIZE.width,
      height: FLOATING_PANEL_SIZE.height,
    }]);
  }, []);

  // Update floating panel position
  const handleFloatingPanelPositionChange = useCallback((id: string, x: number, y: number) => {
    setFloatingPanels(prev => prev.map(p =>
      p.id === id ? { ...p, x, y } : p
    ));
  }, []);

  // Update floating panel size
  const handleFloatingPanelSizeChange = useCallback((id: string, width: number, height: number) => {
    setFloatingPanels(prev => prev.map(p =>
      p.id === id ? { ...p, width, height } : p
    ));
  }, []);

  // Dismiss floating panel with exit animation
  const handleFloatingPanelDismiss = useCallback((id: string) => {
    // Mark panel as exiting to trigger animation
    setFloatingPanels(prev => prev.map(p =>
      p.id === id ? { ...p, isExiting: true } : p
    ));
    // Also remove any connections involving this panel immediately
    setConnections(prev => prev.filter(c => c.fromPanelId !== id && c.toPanelId !== id));
    // Remove panel after animation completes
    setTimeout(() => {
      setFloatingPanels(prev => prev.filter(p => p.id !== id));
    }, 200);
  }, []);

  // Connection handlers
  const handleConnectionDragStart = useCallback((fromPanelId: string, startX: number, startY: number) => {
    isDraggingRef.current = true;
    // Reset touched grid dots for new connection drag
    touchedGridDotsRef.current.clear();

    setConnectionDrag({
      fromPanelId,
      fromX: startX,
      fromY: startY,
      toX: startX,
      toY: startY,
      targetPanelId: null,
    });
  }, []);

  const handleConnectionDragMove = useCallback((x: number, y: number) => {
    setConnectionDrag(prev => {
      if (!prev) return null;

      // Check which grid dots the line currently passes through
      const gridSize = 40;
      const fromX = prev.fromX;
      const fromY = prev.fromY;

      // Build set of dots currently touched by the line
      const currentlyTouched = new Set<string>();
      const lineLength = Math.sqrt((x - fromX) ** 2 + (y - fromY) ** 2);
      const steps = Math.max(1, Math.ceil(lineLength / 10)); // Check every 10px

      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const px = fromX + (x - fromX) * t;
        const py = fromY + (y - fromY) * t;

        // Find nearest grid dot
        const dotX = Math.round(px / gridSize) * gridSize;
        const dotY = Math.round(py / gridSize) * gridSize;
        const dotKey = `${dotX},${dotY}`;

        // Check if close enough to the dot (within 15px)
        const dist = Math.sqrt((px - dotX) ** 2 + (py - dotY) ** 2);
        if (dist < 15) {
          currentlyTouched.add(dotKey);
        }
      }

      // Play sound for any dots that are newly touched (weren't touched before)
      // Throttle to avoid harsh sound when moving very fast
      const now = performance.now();
      currentlyTouched.forEach(dotKey => {
        if (!touchedGridDotsRef.current.has(dotKey)) {
          if (now - lastDotSoundTimeRef.current > 25) { // Min 25ms between sounds
            const pitch = 1.0 + (Math.random() - 0.5) * 0.3;
            panelSounds.play(0.035, pitch);
            lastDotSoundTimeRef.current = now;
          }
        }
      });

      // Update the touched set to reflect current state
      touchedGridDotsRef.current = currentlyTouched;

      // Check if hovering over a panel
      const elementsAtPoint = document.elementsFromPoint(x, y);
      let targetPanelId: string | null = null;

      for (const el of elementsAtPoint) {
        const panelEl = el.closest('[data-panel-id]');
        if (panelEl) {
          const panelId = panelEl.getAttribute('data-panel-id');
          if (panelId && panelId !== prev.fromPanelId) {
            // Check if connection already exists (either direction)
            const existingConnection = connections.find(
              c => (c.fromPanelId === prev.fromPanelId && c.toPanelId === panelId) ||
                   (c.fromPanelId === panelId && c.toPanelId === prev.fromPanelId)
            );
            if (!existingConnection) {
              targetPanelId = panelId;
            }
            break;
          }
        }
      }

      // Play sound when first entering a valid target
      if (targetPanelId && targetPanelId !== lastConnectionTargetRef.current) {
        soundEffects.playHoverSound('connection-target');
      }
      lastConnectionTargetRef.current = targetPanelId;

      return { ...prev, toX: x, toY: y, targetPanelId };
    });
  }, [connections]);

  const handleConnectionDragEnd = useCallback((fromPanelId: string, toPanelId: string | null, dropX: number, dropY: number) => {
    let targetId = toPanelId;

    if (toPanelId) {
      // Connecting to existing panel - check if connection already exists
      const existingConnection = connections.find(
        c => (c.fromPanelId === fromPanelId && c.toPanelId === toPanelId) ||
             (c.fromPanelId === toPanelId && c.toPanelId === fromPanelId)
      );
      if (existingConnection) {
        targetId = null; // Don't create duplicate connection
      }
    } else {
      // Dropped on empty space - spawn a new panel and connect to it
      const newPanelId = `floating-panel-${panelIdCounter.current++}`;
      const x = dropX - FLOATING_PANEL_SIZE.width / 2;
      const y = dropY - FLOATING_PANEL_SIZE.height / 2;

      setFloatingPanels(prev => [...prev, {
        id: newPanelId,
        x,
        y,
        width: FLOATING_PANEL_SIZE.width,
        height: FLOATING_PANEL_SIZE.height,
      }]);

      targetId = newPanelId;
      // Play spawn sound
      panelSounds.playRandomized(0.04, 0.9, 0.1);
    }

    if (targetId) {
      const connectionId = `connection-${fromPanelId}-${targetId}`;
      setConnections(prev => [...prev, {
        id: connectionId,
        fromPanelId,
        toPanelId: targetId,
      }]);
      // Play connection complete sound
      soundEffects.playQuickStartClick(0.06);
    }

    setConnectionDrag(null);
    lastConnectionTargetRef.current = null; // Reset target tracking
    touchedGridDotsRef.current.clear(); // Clear touched grid dots
    // Delay resetting to prevent click event from spawning a panel
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 50);
  }, [connections]);

  const handleConnectionDelete = useCallback((panelId: string) => {
    setConnections(prev => prev.filter(c => c.fromPanelId !== panelId));
  }, []);

  const handleCutAnimationComplete = useCallback((connectionId: string) => {
    setCutConnections(prev => prev.filter(c => c.id !== connectionId));
  }, []);

  // Handle drag state changes to prevent click-spawn during drag
  const handleDragStart = useCallback((panelId: string) => {
    isDraggingRef.current = true;
    setTopPanelId(panelId);
  }, []);

  const handleDragEnd = useCallback(() => {
    // Delay resetting to prevent click event from firing
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 50);
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        color: 'var(--app-fg)',
        position: 'relative',
        backgroundColor: 'var(--app-bg)',
      }}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleGridClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMoveSlice}
      onTouchEnd={(e) => {
        // Only spawn panel if not slicing (check before handleTouchEnd clears the ref)
        const wasSlicing = sliceDragRef.current?.isSlicing;
        handleTouchEnd();
        if (!wasSlicing) {
          handleGridTouch(e);
        }
      }}
    >
      {/* WebGL Noise shader overlay */}
      <NoiseOverlay />

      {/* Global styles */}
      <style jsx global>{`
        .scrollbar-none::-webkit-scrollbar {
          display: none;
        }

        /* Animated generating text with shimmer */
        @keyframes textShimmer {
          0% { opacity: 0.5; }
          50% { opacity: 1; }
          100% { opacity: 0.5; }
        }
        @keyframes ellipsisFade {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 1; }
        }
        .animate-generating {
          animation: textShimmer 2s ease-in-out infinite;
        }
        .animate-ellipsis span {
          display: inline-block;
        }
        .animate-ellipsis span:nth-child(1) {
          animation: ellipsisFade 1.2s ease-in-out infinite;
          animation-delay: 0s;
        }
        .animate-ellipsis span:nth-child(2) {
          animation: ellipsisFade 1.2s ease-in-out infinite;
          animation-delay: 0.15s;
        }
        .animate-ellipsis span:nth-child(3) {
          animation: ellipsisFade 1.2s ease-in-out infinite;
          animation-delay: 0.3s;
        }
      `}</style>

      {/* Dynamic dot grid */}
      <DotGridCanvas
        key={canvasResetKey}
        panelX={panelPos.x}
        panelY={panelPos.y}
        panelWidth={panelSize.width}
        panelHeight={panelSize.height}
        pulses={pulses}
        mousePos={mousePos}
        panels={floatingPanels.filter(p => !p.isExiting)}
        connections={connections}
        connectionDrag={connectionDrag}
        sliceTrail={sliceTrail}
        cutConnections={cutConnections}
        onCutAnimationComplete={handleCutAnimationComplete}
        gridType={gridType}
        theme={theme}
        accentHex={accentHex}
        onCanvasReady={(c) => { exportCanvasRef.current = c; }}
      />

      {/* Robot Logo - Top Left */}
      <div style={{ position: 'fixed', top: 32, left: 32, zIndex: 10 }}>
        <button
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
            cursor: 'pointer',
            border: 'none',
            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 0 0 1px var(--app-bg)',
          }}
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

      {/* Grid Type Selector - Top Right */}
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
        }}
      >
        {/* Theme + accent */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              soundEffects.playQuickStartClick();
              setTheme(t => (t === 'dark' ? 'light' : 'dark'));
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
            title="Toggle light/dark"
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
            title="Accent color"
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
          />
        </div>

        {/* Export */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onClick={(e) => { e.stopPropagation(); exportImage('png'); }}
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
            title="Download PNG"
          >
            PNG
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); exportImage('jpeg'); }}
            onMouseEnter={() => soundEffects.playHoverSound('export-jpeg')}
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
            title="Download JPEG"
          >
            JPEG
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); copyReactTailwindCode(); }}
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
            title="Copy integration recipe for LLMs (GitHub paths, props, optional Tailwind chrome)"
          >
            Copy recipe
          </button>
          <Link
            href={`/nodegrid/${gridTypeToSlug(gridType)}`}
            target="_blank"
            rel="noopener noreferrer"
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
            title="Open this grid with no HUD (for sharing / LLM context)"
          >
            Isolated
          </Link>
        </div>

        {/* Grid Type Selector */}
        <div
          style={{
            display: 'flex',
            gap: 4,
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
              onClick={(e) => {
                e.stopPropagation();
                soundEffects.playQuickStartClick();
                setGridType(type);
                setCanvasResetKey(k => k + 1);
              }}
              onMouseEnter={() => soundEffects.playHoverSound('grid-type')}
              style={{
                padding: '6px 12px',
                fontSize: 11,
                fontWeight: gridType === type ? 600 : 400,
                color: gridType === type ? 'var(--app-fg)' : 'var(--muted-fg)',
                backgroundColor: gridType === type ? 'rgba(var(--accent-rgb), 0.25)' : 'transparent',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                transition: 'all 0.2s',
                textTransform: 'none',
              }}
            >
              {label}
            </button>
            );
          })}
        </div>

        {/* Clear All (only visible with 2+ panels) */}
      <AnimatePresence>
        {floatingPanels.filter(p => !p.isExiting).length >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={(e) => {
              e.stopPropagation();
              soundEffects.playQuickStartClick();
              clearAll();
            }}
            onMouseEnter={() => soundEffects.playHoverSound('clear-all')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--muted-fg-2)' }}>Clear all</span>
            <span style={{
              padding: '3px 7px',
              backgroundColor: 'rgba(255,255,255,0.08)',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--muted-fg)',
              fontFamily: 'monospace',
            }}>ESC</span>
          </motion.div>
        )}
      </AnimatePresence>
      </div>

      {/* Title and description */}
      <div style={{
        position: 'fixed',
        bottom: 32,
        left: 32,
        maxWidth: 320,
        zIndex: 10,
      }}>
        <h1 style={{ fontSize: 19, fontWeight: 600, color: 'var(--app-fg)' }}>
          Node Editor Canvas
        </h1>
        <p style={{ fontSize: 14, color: 'var(--muted-fg)', marginTop: 6, lineHeight: 1.57 }}>
          Click anywhere to spawn nodes. Drag from the corner square to connect them. Slice through lines to cut connections.
        </p>
      </div>

      {/* Keyboard shortcuts - hidden on mobile via media query */}
      <div
        style={{
          position: 'fixed',
          bottom: 32,
          right: 32,
          display: 'grid',
          gridTemplateColumns: 'auto auto',
          gap: '6px 10px',
          alignItems: 'center',
          zIndex: 10,
        }}>
        <span style={{ fontSize: 12, color: 'var(--muted-fg-2)', textAlign: 'right' }}>Snap to grid</span>
        <span style={{
          padding: '3px 7px',
          backgroundColor: 'rgba(255,255,255,0.08)',
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 500,
          color: 'var(--muted-fg)',
          fontFamily: 'monospace',
          minWidth: 72,
          textAlign: 'center',
        }}>⇧ Shift</span>
        <span style={{ fontSize: 12, color: 'var(--muted-fg-2)', textAlign: 'right' }}>Scale from center</span>
        <span style={{
          padding: '3px 7px',
          backgroundColor: 'rgba(255,255,255,0.08)',
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 500,
          color: 'var(--muted-fg)',
          fontFamily: 'monospace',
          minWidth: 72,
          textAlign: 'center',
        }}>⌘ + Drag</span>
        <span style={{ fontSize: 12, color: 'var(--muted-fg-2)', textAlign: 'right' }}>Lock aspect ratio</span>
        <span style={{
          padding: '3px 7px',
          backgroundColor: 'rgba(255,255,255,0.08)',
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 500,
          color: 'var(--muted-fg)',
          fontFamily: 'monospace',
          minWidth: 72,
          textAlign: 'center',
        }}>⌘ + Corner</span>
      </div>

      {/* Spawned floating panels */}
      {floatingPanels.map(panel => (
        <FloatingPanel
          key={`${panel.id}-${resizeKey}`}
          id={panel.id}
          initialX={panel.x}
          initialY={panel.y}
          initialWidth={panel.width}
          initialHeight={panel.height}
          gridType={gridType}
          config={config}
          isTopPanel={panel.id === topPanelId}
          isExiting={panel.isExiting}
          onPositionChange={handleFloatingPanelPositionChange}
          onSizeChange={handleFloatingPanelSizeChange}
          onBounce={handleBounce}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDismiss={handleFloatingPanelDismiss}
          onConnectionDragStart={handleConnectionDragStart}
          onConnectionDragMove={handleConnectionDragMove}
          onConnectionDragEnd={handleConnectionDragEnd}
          isConnectionTarget={connectionDrag?.targetPanelId === panel.id}
          hasOutgoingConnection={connections.some(c => c.fromPanelId === panel.id)}
          hasIncomingConnection={connections.some(c => c.toPanelId === panel.id)}
          onConnectionDelete={handleConnectionDelete}
        />
      ))}
    </div>
  );
}



