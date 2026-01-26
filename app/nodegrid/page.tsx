'use client';

import './grid.css';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { Loader2, Check, CircleCheck, ChevronUp, ChevronDown, GripVertical, Sparkles } from 'lucide-react';
import { soundEffects } from '../../src/utils/SoundEffects';

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
// SOUND EFFECTS (Simplified standalone version)
// ============================================================================

class PanelSoundEffects {
  private audioContext: AudioContext | null = null;
  private audioBuffer: AudioBuffer | null = null;

  async initialize() {
    if (this.audioContext) return;

    try {
      this.audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const response = await fetch('/hoverfx2.mp3');
      const arrayBuffer = await response.arrayBuffer();
      this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    } catch (e) {
      console.warn('Failed to initialize sound:', e);
    }
  }

  play(volume: number = 0.035, pitch: number = 0.8) {
    if (!this.audioContext || !this.audioBuffer) return;

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }

    try {
      const ctx = this.audioContext;
      const now = ctx.currentTime;
      const duration = 0.06;

      const source = ctx.createBufferSource();
      const gainNode = ctx.createGain();

      source.buffer = this.audioBuffer;
      source.playbackRate.value = pitch;
      gainNode.gain.setValueAtTime(volume, now);
      gainNode.gain.setValueAtTime(volume, now + duration - 0.01);
      gainNode.gain.linearRampToValueAtTime(0, now + duration);

      source.connect(gainNode);
      gainNode.connect(ctx.destination);

      source.start(now);
      source.stop(now + duration);
    } catch (e) {
      console.warn('Failed to play sound:', e);
    }
  }

  // Play with random pitch variation for variety
  playRandomized(baseVolume: number = 0.035, basePitch: number = 0.8, pitchVariation: number = 0.15) {
    const pitch = basePitch + (Math.random() - 0.5) * 2 * pitchVariation;
    const volume = baseVolume * (0.9 + Math.random() * 0.2); // Slight volume variation too
    this.play(volume, pitch);
  }
}

const panelSounds = new PanelSoundEffects();

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

// ============================================================================
// MAIN PAGE
// ============================================================================

// WebGL Noise Shader Overlay
function NoiseOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);

  // Delay mounting to prevent flash
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 250);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl');
    if (!gl) return;

    // Vertex shader
    const vertexShaderSource = `
      attribute vec2 a_position;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    // Fragment shader with film grain noise
    const fragmentShaderSource = `
      precision highp float;
      uniform vec2 u_resolution;
      uniform float u_time;

      float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
      }

      void main() {
        vec2 st = gl_FragCoord.xy / u_resolution;

        // Animated noise
        float noise = random(st * 1000.0 + u_time * 0.1);

        // Film grain
        float grain = noise * 0.35;

        gl_FragColor = vec4(vec3(grain), grain);
      }
    `;

    // Compile shaders
    const compileShader = (source: string, type: number) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    };

    const vertexShader = compileShader(vertexShaderSource, gl.VERTEX_SHADER);
    const fragmentShader = compileShader(fragmentShaderSource, gl.FRAGMENT_SHADER);

    // Create program
    const program = gl.createProgram()!;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.useProgram(program);

    // Set up geometry (full screen quad)
    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // Get uniform locations
    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
    const timeLocation = gl.getUniformLocation(program, 'u_time');

    // Animation loop
    let animationId: number;
    let frameCount = 0;
    const render = (time: number) => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);

      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
      gl.uniform1f(timeLocation, time * 0.001);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Mark ready after a couple frames to ensure stable rendering
      frameCount++;
      if (frameCount === 3) {
        setReady(true);
      }

      animationId = requestAnimationFrame(render);
    };

    animationId = requestAnimationFrame(render);

    return () => cancelAnimationFrame(animationId);
  }, [mounted]);

  if (!mounted) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        zIndex: 1,
        mixBlendMode: 'overlay',
        opacity: ready ? 1 : 0,
        transition: 'opacity 1s ease-out'
      }}
    />
  );
}

// Dynamic dot grid canvas component with spring physics
type PulseEvent = {
  x: number;
  y: number;
  time: number;
  intensity: number; // 0-1 based on impact force
};

// Particle shape types
type ParticleShape = 'circle' | 'triangle' | 'square';
type ParticleColor = 'cyan' | 'blue';

// Particle type for impact explosions
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  size: number;
  opacity: number;
  life: number;
  maxLife: number;
  shape: ParticleShape;
  color?: ParticleColor;
}

// Floating panel data
interface FloatingPanelData {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isExiting?: boolean;
}

// Connection between two panels
interface PanelConnection {
  id: string;
  fromPanelId: string;
  toPanelId: string;
}

// Active connection drag state
interface ConnectionDrag {
  fromPanelId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  targetPanelId: string | null;
}

// Slice trail point
interface SlicePoint {
  x: number;
  y: number;
  time: number;
}

// Cut connection for retraction animation
interface CutConnection {
  id: string;
  fromPanelId: string;
  toPanelId: string;
  cutX: number;
  cutY: number;
  cutTime: number;
}

function DotGridCanvas({ panelX, panelY, panelWidth, panelHeight, pulses, mousePos, panels, connections, connectionDrag, sliceTrail, cutConnections, onCutAnimationComplete, gridType, theme, accentHex, onCanvasReady }: { panelX: number; panelY: number; panelWidth: number; panelHeight: number; pulses: PulseEvent[]; mousePos: { x: number; y: number } | null; panels: FloatingPanelData[]; connections: PanelConnection[]; connectionDrag: ConnectionDrag | null; sliceTrail: SlicePoint[]; cutConnections: CutConnection[]; onCutAnimationComplete: (id: string) => void; gridType: GridType; theme: 'dark' | 'light'; accentHex: string; onCanvasReady?: (canvas: HTMLCanvasElement | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const dotsRef = useRef<Map<string, { x: number; y: number; baseX: number; baseY: number; vx: number; vy: number; size: number; targetSize: number; brightness: number }>>(new Map());
  const lastPanelRef = useRef({ x: panelX, y: panelY, width: panelWidth, height: panelHeight });
  const pulsesRef = useRef<PulseEvent[]>(pulses);
  const mousePosRef = useRef<{ x: number; y: number } | null>(mousePos);
  const panelsRef = useRef<FloatingPanelData[]>(panels);
  const connectionsRef = useRef<PanelConnection[]>(connections);
  const connectionDragRef = useRef<ConnectionDrag | null>(connectionDrag);
  const sliceTrailRef = useRef<SlicePoint[]>(sliceTrail);
  const cutConnectionsRef = useRef<CutConnection[]>(cutConnections);
  const onCutAnimationCompleteRef = useRef(onCutAnimationComplete);
  const themeRef = useRef<'dark' | 'light'>(theme);
  const accentRgbRef = useRef<{ r: number; g: number; b: number }>({ r: 37, g: 99, b: 235 });
  const gridTypeRef = useRef<GridType>(gridType);
  const transitionRef = useRef<{ active: boolean; start: number; duration: number } | null>(null);

  // Update connectionDrag ref immediately (not waiting for effect) for faster line drawing
  connectionDragRef.current = connectionDrag;
  const lastPanelPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const panelVelocitiesRef = useRef<Map<string, { vx: number; vy: number }>>(new Map());
  const particlesRef = useRef<Particle[]>([]);
  const bouncyParticlesRef = useRef<Particle[]>([]);
  const lastPulseTimeRef = useRef(0);
  const lastParticleSoundTimeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onCanvasReady?.(canvas);
    return () => onCanvasReady?.(null);
  }, [onCanvasReady]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gridSize = 40;
    const maxDist = 400;
    const pushStrength = 8; // Reduced from 25 to make repulsion less aggressive
    const springStiffness = 0.08;
    const damping = 0.75;
    const parallaxFactor = 0.08;
    
    // Isometric grid parameters
    const isometricTileWidth = gridSize * 2;
    const isometricTileHeight = gridSize * Math.sqrt(3);
    const isometricAngle = Math.PI / 6; // 30 degrees
    
    // Hexagonal grid parameters
    const hexSize = gridSize;
    const hexWidth = hexSize * 2;
    const hexHeight = hexSize * Math.sqrt(3);
    
    // Polar grid parameters (will be set after width/height are available)
    let polarCenterX = 0;
    let polarCenterY = 0;
    const polarRadialLines = 32; // Number of radial lines (increased for more points)
    const polarRings = 25; // Number of concentric rings (increased to fill more space)
    let polarMinRadius = 20;
    let polarMaxRadius = 0;

    // Triangle particle settings
    const particleCount = 12; // Triangles per explosion
    const particleSpeed = 8; // Base velocity
    const particleGravity = 0.15;
    const particleFriction = 0.98;
    const particleLifespan = 1200; // ms

    // Bouncy particle settings (these bounce off the panel)
    const bouncyParticleCount = 16;
    const bouncyParticleSpeed = 6;
    const bouncyParticleGravity = 0.12;
    const bouncyParticleFriction = 0.99;
    const bouncyParticleLifespan = 2500; // longer life to see bounces
    const bouncyBounceDamping = 0.7; // energy loss on bounce
    const bouncySurfaceFriction = 0.6; // friction when resting on panel
    const particleCollisionDamping = 0.8; // energy loss on particle-particle collision


    // Random shape picker
    const randomShape = (): ParticleShape => {
      const shapes: ParticleShape[] = ['circle', 'triangle', 'square'];
      return shapes[Math.floor(Math.random() * shapes.length)];
    };

    // Spawn particles at impact point (regular - no collision)
    const spawnParticles = (x: number, y: number, intensity: number) => {
      const count = Math.floor(particleCount * (0.5 + intensity * 0.5));
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
        const speed = particleSpeed * (0.5 + Math.random() * 0.5) * intensity;
        particlesRef.current.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.3,
          size: 3 + Math.random() * 4 * intensity,
          opacity: 0.8 + Math.random() * 0.2,
          life: particleLifespan,
          maxLife: particleLifespan,
          shape: randomShape(),
        });
      }
    };

    // Spawn bouncy particles that collide with the panel
    const spawnBouncyParticles = (x: number, y: number, intensity: number) => {
      const count = Math.floor(bouncyParticleCount * (0.5 + intensity * 0.5));
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.8;
        const speed = bouncyParticleSpeed * (0.7 + Math.random() * 0.6) * intensity;
        // 40% chance of blue particles (smaller, pulse-colored)
        const isBlue = Math.random() < 0.4;
        const color: ParticleColor = isBlue ? 'blue' : 'cyan';
        // Blue particles are smaller
        const size = isBlue
          ? 1 + Math.random() * 2 * intensity  // 1-3 for blue
          : 2 + Math.random() * 4 * intensity; // 2-6 for cyan
        bouncyParticlesRef.current.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.2,
          size,
          opacity: 0.9,
          life: bouncyParticleLifespan,
          maxLife: bouncyParticleLifespan,
          shape: randomShape(),
          color,
        });
      }
    };

    // Draw rounded triangle
    const drawRoundedTriangle = (ctx: CanvasRenderingContext2D, size: number, radius: number) => {
      const h = size * 0.866; // height factor
      const points = [
        { x: 0, y: -size },
        { x: -h, y: size * 0.5 },
        { x: h, y: size * 0.5 }
      ];

      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const curr = points[i];
        const next = points[(i + 1) % 3];
        const prev = points[(i + 2) % 3];

        // Direction vectors
        const dx1 = curr.x - prev.x;
        const dy1 = curr.y - prev.y;
        const dx2 = next.x - curr.x;
        const dy2 = next.y - curr.y;

        const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
        const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

        // Points offset from corner
        const offset = Math.min(radius, len1 / 2, len2 / 2);
        const p1x = curr.x - (dx1 / len1) * offset;
        const p1y = curr.y - (dy1 / len1) * offset;
        const p2x = curr.x + (dx2 / len2) * offset;
        const p2y = curr.y + (dy2 / len2) * offset;

        if (i === 0) ctx.moveTo(p1x, p1y);
        else ctx.lineTo(p1x, p1y);
        ctx.quadraticCurveTo(curr.x, curr.y, p2x, p2y);
      }
      ctx.closePath();
    };

    // Draw rounded square
    const drawRoundedSquare = (ctx: CanvasRenderingContext2D, size: number, radius: number) => {
      const half = size * 0.7;
      const r = Math.min(radius, half);
      ctx.beginPath();
      ctx.moveTo(-half + r, -half);
      ctx.lineTo(half - r, -half);
      ctx.quadraticCurveTo(half, -half, half, -half + r);
      ctx.lineTo(half, half - r);
      ctx.quadraticCurveTo(half, half, half - r, half);
      ctx.lineTo(-half + r, half);
      ctx.quadraticCurveTo(-half, half, -half, half - r);
      ctx.lineTo(-half, -half + r);
      ctx.quadraticCurveTo(-half, -half, -half + r, -half);
      ctx.closePath();
    };

    // Draw a single particle (blue - regular, fades)
    const drawParticle = (ctx: CanvasRenderingContext2D, p: Particle) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);

      const lifeRatio = p.life / p.maxLife;
      const alpha = p.opacity * lifeRatio;

      const { r: ar, g: ag, b: ab } = accentRgbRef.current;
      ctx.fillStyle = `rgba(${ar}, ${ag}, ${ab}, ${alpha})`;
      ctx.strokeStyle = `rgba(${Math.min(255, ar + 63)}, ${Math.min(255, ag + 61)}, ${Math.min(255, ab + 20)}, ${alpha * 0.8})`;
      ctx.lineWidth = 0.5;

      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, p.size * 0.6, 0, Math.PI * 2);
        ctx.closePath();
      } else if (p.shape === 'triangle') {
        drawRoundedTriangle(ctx, p.size, p.size * 0.3);
      } else {
        drawRoundedSquare(ctx, p.size, p.size * 0.25);
      }

      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };

    // Draw bouncy particle (cyan or blue variant)
    const drawBouncyParticle = (ctx: CanvasRenderingContext2D, p: Particle) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);

      const alpha = p.opacity;

      if (p.color === 'blue') {
        const { r: ar, g: ag, b: ab } = accentRgbRef.current;
        ctx.fillStyle = `rgba(${ar}, ${ag}, ${ab}, ${alpha * 0.95})`;
        ctx.strokeStyle = `rgba(${Math.min(255, ar + 63)}, ${Math.min(255, ag + 61)}, ${Math.min(255, ab + 20)}, ${alpha * 0.8})`;
        ctx.lineWidth = 0.5;
      } else {
        // Cyan/white (original)
        ctx.fillStyle = `rgba(150, 220, 255, ${alpha * 0.9})`;
        ctx.strokeStyle = `rgba(220, 240, 255, ${alpha})`;
        ctx.lineWidth = 0.8;
      }

      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, p.size * 0.6, 0, Math.PI * 2);
        ctx.closePath();
      } else if (p.shape === 'triangle') {
        drawRoundedTriangle(ctx, p.size, p.size * 0.3);
      } else {
        drawRoundedSquare(ctx, p.size, p.size * 0.25);
      }

      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };

    // Update particle physics (regular - no collision)
    const updateParticles = (deltaTime: number) => {
      particlesRef.current = particlesRef.current.filter(p => {
        p.life -= deltaTime;
        if (p.life <= 0) return false;

        p.vy += particleGravity;
        p.vx *= particleFriction;
        p.vy *= particleFriction;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;

        return true;
      });
    };

    // Update bouncy particles with collision against ALL floating panels
    const updateBouncyParticles = (deltaTime: number) => {
      const particles = bouncyParticlesRef.current;
      const floatingPanels = panelsRef.current;

      // Calculate panel velocities by comparing with last positions
      for (const fp of floatingPanels) {
        const lastPos = lastPanelPositionsRef.current.get(fp.id);
        if (lastPos) {
          panelVelocitiesRef.current.set(fp.id, {
            vx: fp.x - lastPos.x,
            vy: fp.y - lastPos.y
          });
        } else {
          panelVelocitiesRef.current.set(fp.id, { vx: 0, vy: 0 });
        }
        lastPanelPositionsRef.current.set(fp.id, { x: fp.x, y: fp.y });
      }

      // Particle-to-particle collision
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const p1 = particles[i];
          const p2 = particles[j];

          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = (p1.size + p2.size) * 0.6;

          if (dist < minDist && dist > 0) {
            const overlap = minDist - dist;
            const nx = dx / dist;
            const ny = dy / dist;

            p1.x -= nx * overlap * 0.5;
            p1.y -= ny * overlap * 0.5;
            p2.x += nx * overlap * 0.5;
            p2.y += ny * overlap * 0.5;

            const dvx = p1.vx - p2.vx;
            const dvy = p1.vy - p2.vy;
            const dvn = dvx * nx + dvy * ny;

            if (dvn > 0) {
              const impulse = dvn * particleCollisionDamping;
              p1.vx -= impulse * nx;
              p1.vy -= impulse * ny;
              p2.vx += impulse * nx;
              p2.vy += impulse * ny;

              p1.rotationSpeed += (Math.random() - 0.5) * 0.1;
              p2.rotationSpeed += (Math.random() - 0.5) * 0.1;
            }
          }
        }
      }

      bouncyParticlesRef.current = particles.filter(p => {
        // Remove if way off screen
        if (p.y > height + 200 || p.x < -200 || p.x > width + 200) return false;

        // Apply gravity and friction first
        p.vy += bouncyParticleGravity;
        p.vx *= bouncyParticleFriction;
        p.vy *= bouncyParticleFriction;

        const pad = p.size * 0.9;
        let collided = false;
        let collisionSpeed = 0;
        let restingOnPanel: { fp: FloatingPanelData; panelVel: { vx: number; vy: number }; collisionTop: number; panelLeft: number; panelRight: number } | null = null;

        // FIRST PASS: Check ALL panels for collisions (including panels moving into resting particles)
        for (const fp of floatingPanels) {
          const panelLeft = fp.x;
          const panelRight = fp.x + fp.width;
          const panelTop = fp.y;
          const panelBottom = fp.y + fp.height;

          const panelVel = panelVelocitiesRef.current.get(fp.id) || { vx: 0, vy: 0 };

          const collisionLeft = panelLeft - pad;
          const collisionRight = panelRight + pad;
          const collisionTop = panelTop - pad;
          const collisionBottom = panelBottom + pad;

          const nextX = p.x + p.vx;
          const nextY = p.y + p.vy;

          const isInX = p.x > collisionLeft && p.x < collisionRight;
          const isInY = p.y > collisionTop && p.y < collisionBottom;
          const wouldBeInX = nextX > collisionLeft && nextX < collisionRight;
          const wouldBeInY = nextY > collisionTop && nextY < collisionBottom;

          // Check if this panel is moving into the particle (active collision from panel)
          const panelSpeed = Math.sqrt(panelVel.vx * panelVel.vx + panelVel.vy * panelVel.vy);
          const panelMovingIntoParticle = panelSpeed > 0.5 && (
            (panelVel.vx > 0 && p.x > panelRight - 20 && p.x < panelRight + pad + 10 && isInY) || // Panel moving right into particle
            (panelVel.vx < 0 && p.x < panelLeft + 20 && p.x > panelLeft - pad - 10 && isInY) ||  // Panel moving left into particle
            (panelVel.vy > 0 && p.y > panelBottom - 20 && p.y < panelBottom + pad + 10 && isInX) || // Panel moving down into particle
            (panelVel.vy < 0 && p.y < panelTop + 20 && p.y > panelTop - pad - 10 && isInX)  // Panel moving up into particle
          );

          // Collision detection
          if (panelMovingIntoParticle || (wouldBeInX && wouldBeInY) || (isInX && isInY)) {
            const distLeft = Math.abs(p.x - collisionLeft);
            const distRight = Math.abs(p.x - collisionRight);
            const distTop = Math.abs(p.y - collisionTop);
            const distBottom = Math.abs(p.y - collisionBottom);

            const minDist = Math.min(distLeft, distRight, distTop, distBottom);

            const minAngle = 1 * Math.PI / 180;
            const maxAngle = 3 * Math.PI / 180;
            const randomAngle = (minAngle + Math.random() * (maxAngle - minAngle)) * (Math.random() < 0.5 ? 1 : -1);

            const momentumTransfer = 0.8;

            if (minDist === distLeft) {
              const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
              const angle = Math.atan2(p.vy, -p.vx) + randomAngle;
              p.vx = Math.cos(angle) * speed * bouncyBounceDamping + panelVel.vx * momentumTransfer;
              p.vy = Math.sin(angle) * speed * bouncyBounceDamping + panelVel.vy * momentumTransfer;
              p.x = collisionLeft - 1;
              p.rotationSpeed = -p.rotationSpeed * 1.2;
              collided = true;
              collisionSpeed = speed;
              break;
            } else if (minDist === distRight) {
              const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
              const angle = Math.atan2(p.vy, -p.vx) + randomAngle;
              p.vx = Math.cos(angle) * speed * bouncyBounceDamping + panelVel.vx * momentumTransfer;
              p.vy = Math.sin(angle) * speed * bouncyBounceDamping + panelVel.vy * momentumTransfer;
              p.x = collisionRight + 1;
              p.rotationSpeed = -p.rotationSpeed * 1.2;
              collided = true;
              collisionSpeed = speed;
              break;
            } else if (minDist === distTop) {
              // Check if should rest on top instead of bounce
              const shouldRest = p.vy >= 0 && Math.abs(p.vy) < 1.5 && panelVel.vy >= -5;
              if (shouldRest) {
                restingOnPanel = { fp, panelVel, collisionTop, panelLeft, panelRight };
              } else {
                const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
                const angle = Math.atan2(-p.vy, p.vx) + randomAngle;
                p.vx = Math.cos(angle) * speed * bouncyBounceDamping + panelVel.vx * momentumTransfer;
                p.vy = Math.sin(angle) * speed * bouncyBounceDamping + panelVel.vy * momentumTransfer;
                p.y = collisionTop - 1;
                p.rotationSpeed = -p.rotationSpeed * 1.2;
                collided = true;
                collisionSpeed = speed;
                break;
              }
            } else {
              const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
              const angle = Math.atan2(-p.vy, p.vx) + randomAngle;
              p.vx = Math.cos(angle) * speed * bouncyBounceDamping + panelVel.vx * momentumTransfer;
              p.vy = Math.sin(angle) * speed * bouncyBounceDamping + panelVel.vy * momentumTransfer;
              p.y = collisionBottom + 1;
              p.rotationSpeed = -p.rotationSpeed * 1.2;
              collided = true;
              collisionSpeed = speed;
              break;
            }
          }
        }

        // Play subtle collision sound (only for significant impacts, throttled)
        if (collided && collisionSpeed > 2.5) {
          const now = performance.now();
          if (now - lastParticleSoundTimeRef.current > 20) { // Min 20ms between sounds
            const normalizedSpeed = Math.min((collisionSpeed - 2.5) / 8, 1);
            const volume = 0.01 + normalizedSpeed * 0.03; // Very subtle: 0.01 to 0.04
            panelSounds.play(volume);
            lastParticleSoundTimeRef.current = now;
          }
        }

        // SECOND PASS: Handle resting on panel (only if no collision occurred)
        if (!collided && restingOnPanel) {
          const { panelVel, collisionTop, panelLeft, panelRight } = restingOnPanel;

          if (panelVel.vy < -5) {
            // Panel moving up fast - launch particle (with clamped velocity)
            const launchStrength = 0.4;
            const maxLaunchVel = 8;
            p.vx += Math.max(-maxLaunchVel, Math.min(maxLaunchVel, panelVel.vx * launchStrength));
            p.vy = Math.max(-maxLaunchVel, panelVel.vy * launchStrength);
            p.rotationSpeed += (Math.random() - 0.5) * 0.2;
          } else {
            // Rest on panel
            p.vx = panelVel.vx + (p.vx - panelVel.vx) * bouncySurfaceFriction;
            p.vy = 0;
            p.y = collisionTop - 1;
            p.rotationSpeed *= 0.85;

            const margin = pad + 2;
            if (p.x < panelLeft + margin) {
              p.x = panelLeft + margin;
              p.vx = Math.max(panelVel.vx, p.vx);
            }
            if (p.x > panelRight - margin) {
              p.x = panelRight - margin;
              p.vx = Math.min(panelVel.vx, p.vx);
            }
          }

          p.x += p.vx;
          p.rotation += p.rotationSpeed;
          return true;
        }

        // Move particle
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;

        return true;
      });
    };

    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    
    // Set polar grid parameters now that width/height are available
    polarCenterX = width / 2;
    polarCenterY = height / 2;
    // Extend grid to fill more of the screen, reaching closer to corners
    const diagonal = Math.sqrt(width * width + height * height);
    polarMaxRadius = diagonal * 0.6; // Use diagonal to reach corners better

    // Convert isometric grid coordinates to screen coordinates
    const isometricToScreen = (isoX: number, isoY: number) => {
      const screenX = (isoX - isoY) * (isometricTileWidth / 2);
      const screenY = (isoX + isoY) * (isometricTileHeight / 2);
      return { x: screenX, y: screenY };
    };
    
    // Convert screen coordinates to isometric grid coordinates
    const screenToIsometric = (screenX: number, screenY: number) => {
      const isoX = (screenX / (isometricTileWidth / 2) + screenY / (isometricTileHeight / 2)) / 2;
      const isoY = (screenY / (isometricTileHeight / 2) - screenX / (isometricTileWidth / 2)) / 2;
      return { isoX, isoY };
    };
    
    // Hexagonal grid: convert axial coordinates (q, r) to screen coordinates
    const hexToScreen = (q: number, r: number) => {
      const x = hexWidth * (q + r / 2);
      const y = hexHeight * r;
      return { x, y };
    };
    
    // Hexagonal grid: convert screen coordinates to axial coordinates
    const screenToHex = (screenX: number, screenY: number) => {
      const q = (screenX * 2/3) / hexSize;
      const r = (-screenX / 3 + screenY * Math.sqrt(3) / 3) / hexSize;
      return hexRound(q, r);
    };
    
    // Hexagonal grid: round to nearest hex coordinate
    const hexRound = (q: number, r: number) => {
      let s = -q - r;
      let rq = Math.round(q);
      let rr = Math.round(r);
      let rs = Math.round(s);
      const qDiff = Math.abs(rq - q);
      const rDiff = Math.abs(rr - r);
      const sDiff = Math.abs(rs - s);
      if (qDiff > rDiff && qDiff > sDiff) {
        rq = -rr - rs;
      } else if (rDiff > sDiff) {
        rr = -rq - rs;
      }
      return { q: rq, r: rr };
    };
    
    // Get hex neighbors (6 directions)
    const getHexNeighbors = (q: number, r: number) => {
      const directions = [
        { q: 1, r: 0 },
        { q: 1, r: -1 },
        { q: 0, r: -1 },
        { q: -1, r: 0 },
        { q: -1, r: 1 },
        { q: 0, r: 1 },
      ];
      return directions.map(d => ({ q: q + d.q, r: r + d.r }));
    };
    
    // Polar grid: convert polar coordinates (angle, radius) to screen coordinates
    const polarToScreen = (angle: number, radius: number) => {
      const x = polarCenterX + radius * Math.cos(angle);
      const y = polarCenterY + radius * Math.sin(angle);
      return { x, y };
    };
    
    // Polar grid: convert screen coordinates to polar coordinates
    const screenToPolar = (screenX: number, screenY: number) => {
      const dx = screenX - polarCenterX;
      const dy = screenY - polarCenterY;
      const radius = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      return { angle, radius };
    };

    const isWeb =
      gridType === 'web_one' ||
      gridType === 'quantum_web';

    // Initialize dots
    const computeLayout = (type: GridType) => {
      const out = new Map<string, { x: number; y: number }>();

      const isWeb = type === 'web_one' || type === 'quantum_web' || type === 'spiral';

      if (type === 'isometric') {
        const margin = 200;
        const offsetX = width / 2;
        const offsetY = height / 2;
        const corners = [
          { x: -margin, y: -margin },
          { x: width + margin, y: -margin },
          { x: -margin, y: height + margin },
          { x: width + margin, y: height + margin },
        ];
        let minIsoX = Infinity, maxIsoX = -Infinity;
        let minIsoY = Infinity, maxIsoY = -Infinity;
        corners.forEach(corner => {
          const { isoX, isoY } = screenToIsometric(corner.x - offsetX, corner.y - offsetY);
          minIsoX = Math.min(minIsoX, Math.floor(isoX) - 2);
          maxIsoX = Math.max(maxIsoX, Math.ceil(isoX) + 2);
          minIsoY = Math.min(minIsoY, Math.floor(isoY) - 2);
          maxIsoY = Math.max(maxIsoY, Math.ceil(isoY) + 2);
        });
        for (let isoX = minIsoX; isoX <= maxIsoX; isoX++) {
          for (let isoY = minIsoY; isoY <= maxIsoY; isoY++) {
            const screen = isometricToScreen(isoX, isoY);
            const x = screen.x + offsetX;
            const y = screen.y + offsetY;
            if (x >= -margin && x <= width + margin && y >= -margin && y <= height + margin) {
              out.set(`${isoX},${isoY}`, { x, y });
            }
          }
        }
        return out;
      }

      if (type === 'hexagonal') {
        const margin = 200;
        const offsetX = width / 2;
        const offsetY = height / 2;
        const radius = Math.ceil(Math.max(width, height) / hexSize) + 5;
        for (let q = -radius; q <= radius; q++) {
          for (let r = -radius; r <= radius; r++) {
            if (Math.abs(q + r) > radius) continue;
            const screen = hexToScreen(q, r);
            const x = screen.x + offsetX;
            const y = screen.y + offsetY;
            if (x >= -margin && x <= width + margin && y >= -margin && y <= height + margin) {
              out.set(`${q},${r}`, { x, y });
            }
          }
        }
        return out;
      }

      if (isWeb) {
        const margin = 200;
        // Spiral uses fewer lines for simplicity
        const spiralRadialLines = type === 'spiral' ? 16 : polarRadialLines; // Half the radial lines
        const spiralRings = type === 'spiral' ? 12 : polarRings; // Fewer rings
        const angleStep = (2 * Math.PI) / spiralRadialLines;
        const radiusStep = (polarMaxRadius - polarMinRadius) / spiralRings;
        for (let ring = 0; ring <= spiralRings; ring++) {
          const radius = polarMinRadius + ring * radiusStep;
          for (let radial = 0; radial < spiralRadialLines; radial++) {
            const angle = radial * angleStep;
            const screen = polarToScreen(angle, radius);
            if (screen.x >= -margin && screen.x <= width + margin && screen.y >= -margin && screen.y <= height + margin) {
              out.set(`polar_${ring}_${radial}`, { x: screen.x, y: screen.y });
            }
          }
        }
        return out;
      }

      if (type === 'triangular') {
        const margin = 200;
        const triStepX = gridSize;
        const triStepY = gridSize * 0.8660254037844386;
        const centerX = width / 2;
        const centerY = height / 2;
        const rows = Math.ceil((height + margin * 2) / triStepY) + 2;
        const cols = Math.ceil((width + margin * 2) / triStepX) + 2;
        for (let row = -rows; row <= rows; row++) {
          const rowOffset = (row & 1) ? triStepX * 0.5 : 0;
          const y = centerY + row * triStepY;
          for (let col = -cols; col <= cols; col++) {
            const x = centerX + col * triStepX + rowOffset;
            if (x >= -margin && x <= width + margin && y >= -margin && y <= height + margin) {
              out.set(`tri_${row}_${col}`, { x, y });
            }
          }
        }
        return out;
      }

      if (type === 'mesh') {
        const margin = 220;
        const stepX = gridSize * 1.6;
        const stepY = gridSize * 1.38;
        const jitter = gridSize * 0.45;
        const cols = Math.ceil((width + margin * 2) / stepX) + 2;
        const rows = Math.ceil((height + margin * 2) / stepY) + 2;
        const hash01 = (a: number, b: number, salt: number) => {
          let n = (a * 73856093) ^ (b * 19349663) ^ (salt * 83492791);
          n = (n ^ (n >>> 13)) >>> 0;
          n = (n * 1274126177) >>> 0;
          return (n >>> 0) / 0xffffffff;
        };
        for (let r = -1; r <= rows; r++) {
          for (let c = -1; c <= cols; c++) {
            const baseX = c * stepX - margin;
            const baseY = r * stepY - margin;
            const jx = (hash01(r, c, 1) - 0.5) * 2 * jitter;
            const jy = (hash01(r, c, 2) - 0.5) * 2 * jitter;
            const x = baseX + jx;
            const y = baseY + jy;
            if (x < -margin || x > width + margin || y < -margin || y > height + margin) continue;
            out.set(`mesh_${r}_${c}`, { x, y });
          }
        }
        return out;
      }

      if (type === 'flux') {
        // Flux: animated warped lattice (base positions stored, animation in animate loop)
        // Store base grid coordinates - animation will be applied in the animate loop
      for (let gx = -gridSize; gx < width + gridSize * 2; gx += gridSize) {
        for (let gy = -gridSize; gy < height + gridSize * 2; gy += gridSize) {
            // Store base grid position (will be animated)
            out.set(`${gx},${gy}`, { x: gx, y: gy });
          }
        }
        return out;
      }

      if (type === 'constellation') {
        // (same as existing init; will be built by initDots which also builds neighbor map)
        // We'll defer to initDots for now by returning empty and letting initDots handle it.
        return out;
      }

      if (type === 'floral') {
        // Floral tessellation: flower-like pattern with petal curves
        const margin = 200;
        const centerX = width / 2;
        const centerY = height / 2;
        const petalCount = 6; // 6 petals per flower
        const flowerSpacing = gridSize * 3.5;
        const rows = Math.ceil((height + margin * 2) / flowerSpacing) + 2;
        const cols = Math.ceil((width + margin * 2) / flowerSpacing) + 2;
        
        for (let row = -rows; row <= rows; row++) {
          for (let col = -cols; col <= cols; col++) {
            const flowerX = centerX + col * flowerSpacing;
            const flowerY = centerY + row * flowerSpacing;
            
            // Center of flower
            out.set(`floral_${row}_${col}_center`, { x: flowerX, y: flowerY });
            
            // Petals around each flower
            for (let p = 0; p < petalCount; p++) {
              const angle = (p * 2 * Math.PI) / petalCount;
              const petalDist = gridSize * 1.2;
              const petalX = flowerX + Math.cos(angle) * petalDist;
              const petalY = flowerY + Math.sin(angle) * petalDist;
              
              if (petalX >= -margin && petalX <= width + margin && 
                  petalY >= -margin && petalY <= height + margin) {
                out.set(`floral_${row}_${col}_petal_${p}`, { x: petalX, y: petalY });
              }
              
              // Secondary petals (smaller, between main petals)
              const secondaryAngle = angle + Math.PI / petalCount;
              const secondaryDist = gridSize * 0.7;
              const secondaryX = flowerX + Math.cos(secondaryAngle) * secondaryDist;
              const secondaryY = flowerY + Math.sin(secondaryAngle) * secondaryDist;
              
              if (secondaryX >= -margin && secondaryX <= width + margin && 
                  secondaryY >= -margin && secondaryY <= height + margin) {
                out.set(`floral_${row}_${col}_sec_${p}`, { x: secondaryX, y: secondaryY });
              }
            }
          }
        }
        return out;
      }

      if (type === 'waves') {
        // Waves: simple horizontal wave pattern (base positions, animation happens in animate loop)
        const margin = 100;
        const waveSpacing = gridSize * 2;
        const waveAmplitude = gridSize * 0.8;
        const waveFrequency = 0.015;
        
        // Create horizontal waves across the screen
        const numWaves = Math.ceil((height + margin * 2) / waveSpacing);
        const pointsPerWave = Math.ceil((width + margin * 2) / (gridSize * 0.8));
        
        for (let wave = -2; wave <= numWaves + 2; wave++) {
          const baseY = wave * waveSpacing; // Center y position of this wave
          
          for (let i = 0; i <= pointsPerWave; i++) {
            const x = (i / pointsPerWave) * (width + margin * 2) - margin;
            // Initial y position (will be animated in the animate loop)
            const y = baseY + Math.sin(x * waveFrequency + wave * 0.5) * waveAmplitude;
            
            if (x >= -margin && x <= width + margin && 
                y >= -margin && y <= height + margin) {
              // Store x as x, and baseY (center) will be used for animation
              out.set(`wave_${wave}_${i}`, { x, y });
            }
          }
        }
        
        return out;
      }

      if (type === 'organic') {
        // Organic: soft, rounded blob-like clusters that breathe and flow
        const margin = 200;
        const cellSize = gridSize * 2.5;
        const cols = Math.ceil((width + margin * 2) / cellSize);
        const rows = Math.ceil((height + margin * 2) / cellSize);
        
        // Deterministic hash for consistent organic shapes
        const hash = (n: number) => {
          n = (n ^ 61) ^ (n >>> 16);
          n = n + (n << 3);
          n = n ^ (n >>> 4);
          n = n * 0x27d4eb2d;
          n = n ^ (n >>> 15);
          return (n >>> 0) / 0xffffffff;
        };
        
        // Create organic blob clusters
        for (let row = -2; row <= rows + 2; row++) {
          for (let col = -2; col <= cols + 2; col++) {
            const centerX = col * cellSize - margin;
            const centerY = row * cellSize - margin;
            const seed = row * 1000 + col;
            
            // Each blob has 5-8 points arranged in a soft circle
            const pointCount = 5 + Math.floor(hash(seed) * 4); // 5-8 points
            const baseRadius = cellSize * (0.3 + hash(seed + 1) * 0.2); // Vary blob size
            
            for (let p = 0; p < pointCount; p++) {
              const angle = (p / pointCount) * Math.PI * 2 + hash(seed + p) * 0.3; // Slight random offset
              const radius = baseRadius * (0.8 + hash(seed + p + 10) * 0.4); // Vary point distance from center
              const x = centerX + Math.cos(angle) * radius;
              const y = centerY + Math.sin(angle) * radius;
              
              if (x >= -margin && x <= width + margin && 
                  y >= -margin && y <= height + margin) {
                out.set(`organic_${row}_${col}_${p}`, { x, y });
              }
            }
          }
        }
        
        return out;
      }

      // rectangular default
      for (let gx = -gridSize; gx < width + gridSize * 2; gx += gridSize) {
        for (let gy = -gridSize; gy < height + gridSize * 2; gy += gridSize) {
          out.set(`${gx},${gy}`, { x: gx, y: gy });
        }
      }
      return out;
    };

    const initDots = (type: GridType = gridTypeRef.current) => {
      dotsRef.current.clear();
      if (type === 'constellation') {
        // Constellation: deterministic star field + kNN links (stable)
        const margin = 220;
        const count = Math.floor((width * height) / 45000) + 60; // scale with viewport, ~60-120
        const pts: Array<{ key: string; x: number; y: number }> = [];

        const hash = (n: number) => {
          // 32-bit mix, deterministic
          n = (n ^ 61) ^ (n >>> 16);
          n = n + (n << 3);
          n = n ^ (n >>> 4);
          n = n * 0x27d4eb2d;
          n = n ^ (n >>> 15);
          return n >>> 0;
        };
        const rand01 = (seed: number) => (hash(seed) / 0xffffffff);

        for (let i = 0; i < count; i++) {
          const rx = rand01(i * 2 + 11);
          const ry = rand01(i * 2 + 97);
          // Center-weighted distribution (keeps content near where cards usually live)
          const cx = (rx - 0.5) * 2;
          const cy = (ry - 0.5) * 2;
          const w = 0.65;
          const x = width / 2 + cx * (width * w);
          const y = height / 2 + cy * (height * w);
          if (x < -margin || x > width + margin || y < -margin || y > height + margin) continue;
          const key = `star_${i}`;
          pts.push({ key, x, y });
          dotsRef.current.set(key, { x, y, baseX: x, baseY: y, vx: 0, vy: 0, size: 1, targetSize: 1, brightness: 1 });
        }

        // Build kNN neighbor map (undirected)
        const k = 3;
        const neighborMap = new Map<string, string[]>();
        for (let i = 0; i < pts.length; i++) neighborMap.set(pts[i].key, []);
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i];
          const dists: Array<{ key: string; d: number }> = [];
          for (let j = 0; j < pts.length; j++) {
            if (i === j) continue;
            const b = pts[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            dists.push({ key: b.key, d: dx * dx + dy * dy });
          }
          dists.sort((u, v) => u.d - v.d);
          for (let n = 0; n < Math.min(k, dists.length); n++) {
            const bKey = dists[n].key;
            neighborMap.get(a.key)!.push(bKey);
            neighborMap.get(bKey)!.push(a.key);
          }
        }

        // Store on dotsRef itself via a hidden map on the ref object (cheap)
        (dotsRef.current as unknown as { __constellation?: Map<string, string[]> }).__constellation = neighborMap;
      } else {
        const layout = computeLayout(type);
        for (const [key, p] of layout.entries()) {
          if (type === 'waves' && key.startsWith('wave_')) {
            // For waves, store the wave center y position in baseY for animation
            const parts = key.split('_');
            if (parts.length >= 3) {
              const waveIndex = parseInt(parts[1]);
              const waveSpacing = gridSize * 2;
              const baseYCenter = waveIndex * waveSpacing;
              dotsRef.current.set(key, { x: p.x, y: p.y, baseX: p.x, baseY: baseYCenter, vx: 0, vy: 0, size: 1, targetSize: 1, brightness: 1 });
            } else {
              dotsRef.current.set(key, { x: p.x, y: p.y, baseX: p.x, baseY: p.y, vx: 0, vy: 0, size: 1, targetSize: 1, brightness: 1 });
            }
          } else {
            dotsRef.current.set(key, { x: p.x, y: p.y, baseX: p.x, baseY: p.y, vx: 0, vy: 0, size: 1, targetSize: 1, brightness: 1 });
          }
        }
      }
    };

    const startTransitionTo = (nextType: GridType) => {
      const now = performance.now();
      transitionRef.current = { active: true, start: now, duration: 900 };

      // Build target layout
      const targetLayout = nextType === 'constellation' ? new Map<string, { x: number; y: number }>() : computeLayout(nextType);

      // Snapshot existing dots for spatial lookup
      const old = Array.from(dotsRef.current.entries()).map(([k, d]) => ({ k, d }));
      const used = new Set<string>();

      // Bin old dots for nearest search
      const cell = 90;
      const bins: Map<string, Array<{ k: string; x: number; y: number }>> = new Map();
      for (const { k, d } of old) {
        const ix = Math.floor(d.x / cell);
        const iy = Math.floor(d.y / cell);
        const bk = `${ix},${iy}`;
        const arr = bins.get(bk) ?? [];
        arr.push({ k, x: d.x, y: d.y });
        bins.set(bk, arr);
      }

      const nearestOld = (x: number, y: number): { k: string; x: number; y: number; d2: number } | null => {
        const ix0 = Math.floor(x / cell);
        const iy0 = Math.floor(y / cell);
        let best: { k: string; x: number; y: number; d2: number } | null = null;
        for (let r = 0; r <= 2; r++) {
          for (let dx = -r; dx <= r; dx++) {
            for (let dy = -r; dy <= r; dy++) {
              const bk = `${ix0 + dx},${iy0 + dy}`;
              const arr = bins.get(bk);
              if (!arr) continue;
              for (const p of arr) {
                if (used.has(p.k)) continue;
                const ddx = p.x - x;
                const ddy = p.y - y;
                const d2 = ddx * ddx + ddy * ddy;
                if (!best || d2 < best.d2) best = { ...p, d2 };
              }
            }
          }
          if (best) break;
        }
        if (best !== null) {
          used.add((best as { k: string }).k);
        }
        return best;
      };

      const nextDots = new Map<string, typeof old[number]['d']>();

      if (nextType === 'constellation') {
        // Re-init constellation fully but seed positions from old dots (soft)
        initDots('constellation');
        const stars = Array.from(dotsRef.current.entries());
        dotsRef.current.clear();
        for (const [k, d] of stars) {
          const m = nearestOld(d.baseX, d.baseY);
          const sx = m ? m.x : d.baseX;
          const sy = m ? m.y : d.baseY;
          nextDots.set(k, { ...d, x: sx, y: sy, vx: 0, vy: 0 });
        }
      } else {
        for (const [k, p] of targetLayout.entries()) {
          const m = nearestOld(p.x, p.y);
          const sx = m ? m.x : p.x;
          const sy = m ? m.y : p.y;
          nextDots.set(k, { x: sx, y: sy, baseX: p.x, baseY: p.y, vx: 0, vy: 0, size: 1, targetSize: 1, brightness: 1 });
        }
      }

      // Keep unmatched old dots around briefly (fade via size shrink)
      for (const { k, d } of old) {
        if (used.has(k)) continue;
        nextDots.set(`_old_${k}`, { ...d, baseX: d.x, baseY: d.y, vx: 0, vy: 0, size: 0.8, targetSize: 0.4, brightness: d.brightness });
      }

      dotsRef.current = nextDots;
    };

    // Initialize with current grid type
    let currentType: GridType = gridTypeRef.current;
    initDots(currentType);

    let lastTime = performance.now();

    const animate = () => {
      const now = performance.now();
      const deltaTime = now - lastTime;
      lastTime = now;

      // If the requested gridType changed, start a smooth transition
      if (gridTypeRef.current !== currentType) {
        startTransitionTo(gridTypeRef.current);
        currentType = gridTypeRef.current;
      }

      // Cleanup old dots after transition
      const tr = transitionRef.current;
      if (tr?.active) {
        const t = Math.min(1, (now - tr.start) / tr.duration);
        if (t >= 1) {
          // Drop any leftover _old_* dots
          for (const k of Array.from(dotsRef.current.keys())) {
            if (k.startsWith('_old_')) dotsRef.current.delete(k);
          }
          tr.active = false;
        }
      }

      // Check for new pulses and spawn particles
      for (const pulse of pulsesRef.current) {
        if (pulse.time > lastPulseTimeRef.current) {
          spawnParticles(pulse.x, pulse.y, pulse.intensity);
          spawnBouncyParticles(pulse.x, pulse.y, pulse.intensity);
          lastPulseTimeRef.current = pulse.time;
        }
      }

      // Update particles
      updateParticles(deltaTime);

      const currentPanel = lastPanelRef.current;

      // No parallax offset - grid stays centered (main panel removed)
      const offsetX = 0;
      const offsetY = 0;

      const panelLeft = currentPanel.x;
      const panelRight = currentPanel.x + currentPanel.width;
      const panelTop = currentPanel.y;
      const panelBottom = currentPanel.y + currentPanel.height;

      ctx.clearRect(0, 0, width, height);

      // Pulse settings
      const pulseSpeed = 400; // pixels per second
      const pulseWidth = 80; // width of the pulse wave
      const pulseDuration = 2000; // how long pulse lasts in ms
      const denseGridSize = gridSize / 2; // Hidden dense grid at half spacing

      // Calculate pulse intensity at a given point (factors in impact force)
      const getPulseIntensity = (x: number, y: number) => {
        let maxIntensity = 0;
        for (const pulse of pulsesRef.current) {
          const age = now - pulse.time;
          if (age > pulseDuration) continue;

          // Scale pulse speed and width by impact intensity
          const intensityScale = 0.5 + pulse.intensity * 0.5; // 0.5-1.0 range
          const scaledSpeed = pulseSpeed * intensityScale;
          const scaledWidth = pulseWidth * intensityScale;

          const radius = (age / 1000) * scaledSpeed;
          const distFromPulse = Math.sqrt((x - pulse.x) ** 2 + (y - pulse.y) ** 2);
          const distFromWave = Math.abs(distFromPulse - radius);

          if (distFromWave < scaledWidth) {
            const waveIntensity = 1 - (distFromWave / scaledWidth);
            const fadeOut = 1 - (age / pulseDuration);
            // Multiply by impact intensity for force-reactive pulses
            maxIntensity = Math.max(maxIntensity, waveIntensity * fadeOut * pulse.intensity);
          }
        }
        return maxIntensity;
      };

      // Calculate hover glow intensity at a given point
      const getHoverIntensity = (x: number, y: number) => {
        const mouse = mousePosRef.current;
        if (!mouse) return 0;

        const hoverRadius = 120; // Radius of the hover glow
        const dx = x - mouse.x;
        const dy = y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > hoverRadius) return 0;

        // Smooth falloff
        const intensity = Math.pow(1 - dist / hoverRadius, 2);
        return intensity * 0.6; // Max hover intensity
      };

      // Helper to calculate push from a single panel
      const getPanelPush = (baseX: number, baseY: number, pLeft: number, pRight: number, pTop: number, pBottom: number) => {
        const closestX = Math.max(pLeft, Math.min(baseX, pRight));
        const closestY = Math.max(pTop, Math.min(baseY, pBottom));
        const dx = baseX - closestX;
        const dy = baseY - closestY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const normalizedDist = Math.min(dist / maxDist, 1);
        let pushAmount = dist > 0 ? Math.pow(1 - normalizedDist, 2) * pushStrength : 0;
        
      // For web family, limit push to max 48px
      const isWeb =
        gridType === 'web_one' ||
        gridType === 'quantum_web';
      if (isWeb) {
          const maxPushDistance = 48;
          if (pushAmount > maxPushDistance) {
            pushAmount = maxPushDistance;
          }
        }
        
        const pushX = dist > 0 ? (dx / dist) * pushAmount : 0;
        const pushY = dist > 0 ? (dy / dist) * pushAmount : 0;
        return { x: pushX, y: pushY };
      };

      // Helper to calculate displaced position from ALL panels (main + floating)
      const getDisplacedPosition = (baseX: number, baseY: number) => {
        // Start with push from main panel
        let totalPushX = 0;
        let totalPushY = 0;

        const mainPush = getPanelPush(baseX, baseY, panelLeft, panelRight, panelTop, panelBottom);
        totalPushX += mainPush.x;
        totalPushY += mainPush.y;

        // Add push from all floating panels
        const floatingPanels = panelsRef.current;
        for (const fp of floatingPanels) {
          const fpPush = getPanelPush(baseX, baseY, fp.x, fp.x + fp.width, fp.y, fp.y + fp.height);
          totalPushX += fpPush.x;
          totalPushY += fpPush.y;
        }

        // For web family, clamp the TOTAL displacement vector so dots never move more than 48px.
        // (Per-panel clamping isn't enough once multiple panels contribute.)
        const isWeb =
          gridType === 'web_one' ||
          gridType === 'quantum_web';
        if (isWeb) {
          const maxTotalDisplacement = 48;
          const mag = Math.sqrt(totalPushX * totalPushX + totalPushY * totalPushY);
          if (mag > maxTotalDisplacement && mag > 0) {
            const s = maxTotalDisplacement / mag;
            totalPushX *= s;
            totalPushY *= s;
          }
        }

        return { x: baseX + totalPushX, y: baseY + totalPushY };
      };

      // Hidden dense grid - only visible during pulses
      // Draw at half the spacing (double density)
      if (gridType === 'rectangular') {
        // Only show dense grid for rectangular/hexagonal grids
      for (let gx = -denseGridSize; gx < width + denseGridSize * 2; gx += denseGridSize) {
        for (let gy = -denseGridSize; gy < height + denseGridSize * 2; gy += denseGridSize) {
          // Skip points that align with the main grid (they'll be drawn by the main wireframe)
          const isMainGridPoint = (gx % gridSize === 0) && (gy % gridSize === 0);
          if (isMainGridPoint) continue;

          // Calculate displaced position with parallax
          const baseX = gx + offsetX;
          const baseY = gy + offsetY;
          const pos = getDisplacedPosition(baseX, baseY);

          const pulseIntensity = getPulseIntensity(pos.x, pos.y);
          if (pulseIntensity < 0.05) continue; // Skip if no pulse

          // Draw horizontal line to next dense grid point
          const nextGx = gx + denseGridSize;
          const nextBaseX = nextGx + offsetX;
          const nextPosH = getDisplacedPosition(nextBaseX, baseY);
          const nextPulseH = getPulseIntensity(nextPosH.x, nextPosH.y);
          const avgPulseH = (pulseIntensity + nextPulseH) / 2;

          if (avgPulseH > 0.05) {
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);
            ctx.lineTo(nextPosH.x, nextPosH.y);
              const { r: ar, g: ag, b: ab } = accentRgbRef.current;
              ctx.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, ${avgPulseH * 0.9})`;
            ctx.lineWidth = 0.3 + avgPulseH * 0.5;
            ctx.stroke();
          }

          // Draw vertical line to next dense grid point
          const nextGy = gy + denseGridSize;
          const nextBaseY = nextGy + offsetY;
          const nextPosV = getDisplacedPosition(baseX, nextBaseY);
          const nextPulseV = getPulseIntensity(nextPosV.x, nextPosV.y);
          const avgPulseV = (pulseIntensity + nextPulseV) / 2;

          if (avgPulseV > 0.05) {
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);
            ctx.lineTo(nextPosV.x, nextPosV.y);
              const { r: ar2, g: ag2, b: ab2 } = accentRgbRef.current;
              ctx.strokeStyle = `rgba(${ar2}, ${ag2}, ${ab2}, ${avgPulseV * 0.9})`;
            ctx.lineWidth = 0.3 + avgPulseV * 0.5;
            ctx.stroke();
            }
          }
        }
      }

      // Main wireframe lines
      ctx.lineWidth = 0.5;
      dotsRef.current.forEach((dot, key) => {
        const [gxStr, gyStr] = key.split(',');
        
        let neighbors: Array<{ key: string; dot: typeof dot | undefined }> = [];
        
        if (gridType === 'isometric') {
          const isoX = parseInt(gxStr);
          const isoY = parseInt(gyStr);
          // In isometric grid, each dot connects to 3 neighbors:
          // 1. Northeast: (isoX+1, isoY)
          // 2. Southeast: (isoX, isoY+1)
          // 3. East: (isoX+1, isoY-1) - this creates the diamond pattern
          neighbors = [
            { key: `${isoX + 1},${isoY}`, dot: dotsRef.current.get(`${isoX + 1},${isoY}`) },
            { key: `${isoX},${isoY + 1}`, dot: dotsRef.current.get(`${isoX},${isoY + 1}`) },
            { key: `${isoX + 1},${isoY - 1}`, dot: dotsRef.current.get(`${isoX + 1},${isoY - 1}`) },
          ];
        } else if (gridType === 'hexagonal') {
          const q = parseInt(gxStr);
          const r = parseInt(gyStr);
          // Hexagonal grid: each hex connects to 6 neighbors
          const hexNeighbors = getHexNeighbors(q, r);
          neighbors = hexNeighbors.map(n => ({
            key: `${n.q},${n.r}`,
            dot: dotsRef.current.get(`${n.q},${n.r}`),
          }));
        } else if (gridType === 'web_one' || gridType === 'quantum_web' || gridType === 'spiral') {
          // Polar grid: parse the key format polar_ring_radial
          if (key.startsWith('polar_')) {
            const parts = key.split('_');
            if (parts.length >= 3) {
              const ring = parseInt(parts[1]);
              const radial = parseInt(parts[2]);
              
              // Connect to next/prev on same ring (same radius, different angle)
              const nextRadial = (radial + 1) % polarRadialLines;
              const prevRadial = (radial - 1 + polarRadialLines) % polarRadialLines;
              neighbors.push(
                { key: `polar_${ring}_${nextRadial}`, dot: dotsRef.current.get(`polar_${ring}_${nextRadial}`) },
                { key: `polar_${ring}_${prevRadial}`, dot: dotsRef.current.get(`polar_${ring}_${prevRadial}`) }
              );
              
              // Connect to next/prev on same radial line (same angle, different radius)
              if (ring > 0) {
                neighbors.push({
                  key: `polar_${ring - 1}_${radial}`,
                  dot: dotsRef.current.get(`polar_${ring - 1}_${radial}`),
                });
              }
              if (ring < polarRings) {
                neighbors.push({
                  key: `polar_${ring + 1}_${radial}`,
                  dot: dotsRef.current.get(`polar_${ring + 1}_${radial}`),
                });
              }
            }
          }
        } else if (gridType === 'triangular') {
          // Triangular lattice neighbors (6 around each point)
          if (key.startsWith('tri_')) {
            const parts = key.split('_');
            if (parts.length >= 3) {
              const row = parseInt(parts[1]);
              const col = parseInt(parts[2]);
              const parity = row & 1;

              const candidates = [
                `tri_${row}_${col - 1}`,
                `tri_${row}_${col + 1}`,
                `tri_${row - 1}_${col - parity}`,
                `tri_${row - 1}_${col - parity + 1}`,
                `tri_${row + 1}_${col - parity}`,
                `tri_${row + 1}_${col - parity + 1}`,
              ];

              neighbors = candidates.map(k => ({ key: k, dot: dotsRef.current.get(k) }));
            }
          }
        } else if (gridType === 'mesh') {
          // Mesh neighbors: 6-way connections on jittered grid indices
          if (key.startsWith('mesh_')) {
            const parts = key.split('_');
            if (parts.length >= 3) {
              const r = parseInt(parts[1]);
              const c = parseInt(parts[2]);
              const parity = r & 1;
              const candidates = [
                `mesh_${r}_${c - 1}`,
                `mesh_${r}_${c + 1}`,
                `mesh_${r - 1}_${c}`,
                `mesh_${r + 1}_${c}`,
                `mesh_${r - 1}_${c + (parity ? 1 : -1)}`,
                `mesh_${r + 1}_${c + (parity ? 1 : -1)}`,
              ];
              neighbors = candidates.map(k => ({ key: k, dot: dotsRef.current.get(k) }));
            }
          }
        } else if (gridType === 'constellation') {
          const map = (dotsRef.current as unknown as { __constellation?: Map<string, string[]> }).__constellation;
          const next = map?.get(key) ?? [];
          neighbors = next.map(k => ({ key: k, dot: dotsRef.current.get(k) }));
        } else if (gridType === 'floral') {
          // Floral: connect center to petals, petals to nearby petals
          if (key.startsWith('floral_')) {
            const parts = key.split('_');
            if (parts.length >= 4) {
              const row = parseInt(parts[1]);
              const col = parseInt(parts[2]);
              const part = parts[3];
              
              if (part === 'center') {
                // Center connects to all its petals
                for (let p = 0; p < 6; p++) {
                  neighbors.push({
                    key: `floral_${row}_${col}_petal_${p}`,
                    dot: dotsRef.current.get(`floral_${row}_${col}_petal_${p}`)
                  });
                }
              } else if (part === 'petal') {
                const petalIdx = parseInt(parts[4]);
                // Petal connects to center and adjacent petals
                neighbors.push({
                  key: `floral_${row}_${col}_center`,
                  dot: dotsRef.current.get(`floral_${row}_${col}_center`)
                });
                const nextPetal = (petalIdx + 1) % 6;
                const prevPetal = (petalIdx - 1 + 6) % 6;
                neighbors.push(
                  { key: `floral_${row}_${col}_petal_${nextPetal}`, dot: dotsRef.current.get(`floral_${row}_${col}_petal_${nextPetal}`) },
                  { key: `floral_${row}_${col}_petal_${prevPetal}`, dot: dotsRef.current.get(`floral_${row}_${col}_petal_${prevPetal}`) }
                );
                // Connect to secondary petal
                neighbors.push({
                  key: `floral_${row}_${col}_sec_${petalIdx}`,
                  dot: dotsRef.current.get(`floral_${row}_${col}_sec_${petalIdx}`)
                });
              } else if (part === 'sec') {
                const secIdx = parseInt(parts[4]);
                // Secondary petal connects to nearby main petals
                neighbors.push({
                  key: `floral_${row}_${col}_petal_${secIdx}`,
                  dot: dotsRef.current.get(`floral_${row}_${col}_petal_${secIdx}`)
                });
                const nextPetal = (secIdx + 1) % 6;
                neighbors.push({
                  key: `floral_${row}_${col}_petal_${nextPetal}`,
                  dot: dotsRef.current.get(`floral_${row}_${col}_petal_${nextPetal}`)
                });
              }
            }
          }
        } else if (gridType === 'waves') {
          // Waves: connect horizontally along the wave
          if (key.startsWith('wave_')) {
            const parts = key.split('_');
            if (parts.length >= 3) {
              const wave = parseInt(parts[1]);
              const point = parseInt(parts[2]);
              
              // Connect to next and previous point on same wave
              if (point > 0) {
                neighbors.push({
                  key: `wave_${wave}_${point - 1}`,
                  dot: dotsRef.current.get(`wave_${wave}_${point - 1}`)
                });
              }
              neighbors.push({
                key: `wave_${wave}_${point + 1}`,
                dot: dotsRef.current.get(`wave_${wave}_${point + 1}`)
              });
            }
          }
        } else {
          // Rectangular grid: right and bottom
        const gx = parseInt(gxStr);
        const gy = parseInt(gyStr);
        const rightKey = `${gx + gridSize},${gy}`;
        const bottomKey = `${gx},${gy + gridSize}`;
          neighbors = [
            { key: rightKey, dot: dotsRef.current.get(rightKey) },
            { key: bottomKey, dot: dotsRef.current.get(bottomKey) },
          ];
        }

        // Calculate opacity based on distance from closest panel
        let lineMinDist = Infinity;

        // Distance to main panel
        const mainClosestX2 = Math.max(panelLeft, Math.min(dot.x, panelRight));
        const mainClosestY2 = Math.max(panelTop, Math.min(dot.y, panelBottom));
        lineMinDist = Math.min(lineMinDist, Math.sqrt((dot.x - mainClosestX2) ** 2 + (dot.y - mainClosestY2) ** 2));

        // Distance to floating panels
        for (const fp of panelsRef.current) {
          const fpClosestX2 = Math.max(fp.x, Math.min(dot.x, fp.x + fp.width));
          const fpClosestY2 = Math.max(fp.y, Math.min(dot.y, fp.y + fp.height));
          lineMinDist = Math.min(lineMinDist, Math.sqrt((dot.x - fpClosestX2) ** 2 + (dot.y - fpClosestY2) ** 2));
        }

        const normalizedDist = Math.min(lineMinDist / maxDist, 1);
        const baseLineOpacity = (0.25 - normalizedDist * 0.2) * 0.5;

        // Get pulse intensity at this dot's position
        const pulseIntensity = getPulseIntensity(dot.x, dot.y);
        // Get hover intensity at this dot's position
        const hoverIntensity = getHoverIntensity(dot.x, dot.y);
        // Combined effect intensity
        const effectIntensity = Math.max(pulseIntensity, hoverIntensity);

        // Draw lines to all neighbors
        neighbors.forEach(({ key: neighborKey, dot: neighborDot }) => {
          if (!neighborDot) return;

          const avgPulse = (pulseIntensity + getPulseIntensity(neighborDot.x, neighborDot.y)) / 2;
          const avgHover = (hoverIntensity + getHoverIntensity(neighborDot.x, neighborDot.y)) / 2;
          const avgEffect = Math.max(avgPulse, avgHover);
          const lineOpacity = baseLineOpacity + avgEffect * 0.8;

          const { r: ar, g: ag, b: ab } = accentRgbRef.current;
          const isLight = themeRef.current === 'light';
          const baseGrey = isLight ? 40 : 160;
          const lineColor = avgEffect > 0.1
            ? `rgba(${ar}, ${Math.min(255, ag + avgEffect * 60)}, ${ab}, ${Math.max(0, lineOpacity + avgEffect * 0.7)})`
            : `rgba(${baseGrey}, ${baseGrey}, ${baseGrey}, ${Math.max(0, lineOpacity)})`;

          if (lineOpacity <= 0.01) return;

            ctx.beginPath();
            ctx.moveTo(dot.x, dot.y);

          if ((gridType === 'quantum_web' || gridType === 'spiral') && key.startsWith('polar_') && neighborKey?.startsWith('polar_')) {
            // Quantum Web and Spiral: Bezier webbing (deterministic subtle curve per edge)
            const partsA = key.split('_');
            const partsB = neighborKey.split('_');
            const ringA = parseInt(partsA[1] || '0', 10);
            const radialA = parseInt(partsA[2] || '0', 10);
            const ringB = parseInt(partsB[1] || '0', 10);
            const radialB = parseInt(partsB[2] || '0', 10);

            const x0 = dot.x, y0 = dot.y;
            const x3 = neighborDot.x, y3 = neighborDot.y;
            const dx = x3 - x0;
            const dy = y3 - y0;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const nx = -dy / len;
            const ny = dx / len;

            const sign = ((ringA + radialA + ringB + radialB) & 1) ? 1 : -1;
            const baseMag = Math.min(22, 6 + Math.max(ringA, ringB) * 0.35);
            const mag = (baseMag + avgEffect * 10) * sign;

            const x1 = x0 + dx / 3;
            const y1 = y0 + dy / 3;
            const x2 = x0 + (2 * dx) / 3;
            const y2 = y0 + (2 * dy) / 3;

            ctx.bezierCurveTo(
              x1 + nx * mag, y1 + ny * mag,
              x2 + nx * mag, y2 + ny * mag,
              x3, y3
            );
          } else {
            ctx.lineTo(neighborDot.x, neighborDot.y);
          }

            ctx.lineWidth = 0.5 + avgEffect * 2;
            ctx.strokeStyle = lineColor;
            ctx.stroke();
        });
      });

      // Second pass: draw dots on top
      dotsRef.current.forEach((dot, key) => {
        let baseX: number, baseY: number;
        
        if (gridType === 'isometric') {
        const [gxStr, gyStr] = key.split(',');
          const isoX = parseInt(gxStr);
          const isoY = parseInt(gyStr);
          const screen = isometricToScreen(isoX, isoY);
          const offsetX = width / 2;
          const offsetY = height / 2;
          baseX = screen.x + offsetX;
          baseY = screen.y + offsetY;
        } else if (gridType === 'hexagonal') {
          const [gxStr, gyStr] = key.split(',');
          const q = parseInt(gxStr);
          const r = parseInt(gyStr);
          const screen = hexToScreen(q, r);
          const offsetX = width / 2;
          const offsetY = height / 2;
          baseX = screen.x + offsetX;
          baseY = screen.y + offsetY;
        } else if (gridType === 'web_one' || gridType === 'quantum_web') {
          // Web One and Quantum Web: anchor to stable rest position
          baseX = dot.baseX;
          baseY = dot.baseY;
        } else if (gridType === 'spiral') {
          // Spiral: animate every other ring with rotation (simplified)
          if (key.startsWith('polar_')) {
            const parts = key.split('_');
            if (parts.length >= 3) {
              const ring = parseInt(parts[1]);
              const radial = parseInt(parts[2]);
              
              // Calculate base angle and radius (using simplified spiral parameters)
              const spiralRadialLines = 16;
              const spiralRings = 12;
              const angleStep = (2 * Math.PI) / spiralRadialLines;
              const radiusStep = (polarMaxRadius - polarMinRadius) / spiralRings;
              const baseRadius = polarMinRadius + ring * radiusStep;
              const baseAngle = radial * angleStep;
              
              // Rotate every other ring (even rings rotate one way, odd rings the other)
              const rotationSpeed = 0.0002; // Slow rotation speed
              const rotationDirection = ring % 2 === 0 ? 1 : -1; // Alternate direction
              const rotationAngle = baseAngle + (now * rotationSpeed * rotationDirection);
              
              // Convert to screen coordinates
              const screen = polarToScreen(rotationAngle, baseRadius);
              baseX = screen.x;
              baseY = screen.y;
            } else {
              baseX = dot.baseX;
              baseY = dot.baseY;
            }
          } else {
            baseX = dot.baseX;
            baseY = dot.baseY;
          }
        } else if (gridType === 'organic') {
          // Organic: animate with soft breathing/pulsing effect
          if (key.startsWith('organic_')) {
            const parts = key.split('_');
            if (parts.length >= 4) {
              const row = parseInt(parts[1]);
              const col = parseInt(parts[2]);
              const point = parseInt(parts[3]);
              const seed = row * 1000 + col;
              
              // Get base position
              const baseXPos = dot.baseX;
              const baseYPos = dot.baseY;
              
              // Calculate blob center
              const cellSize = gridSize * 2.5;
              const centerX = col * cellSize - 200;
              const centerY = row * cellSize - 200;
              
              // Soft breathing animation - gentle pulsing
              const breathTime = now * 0.0005; // Slow breathing
              const breathPhase = seed * 0.1; // Each blob breathes at slightly different phase
              const breathAmount = Math.sin(breathTime + breathPhase) * 0.15 + 1.0; // Pulse between 0.85x and 1.15x
              
              // Gentle floating motion
              const floatX = Math.sin(breathTime * 0.7 + seed * 0.05) * 3;
              const floatY = Math.cos(breathTime * 0.6 + seed * 0.07) * 3;
              
              // Calculate distance from center for radial breathing
              const dx = baseXPos - centerX;
              const dy = baseYPos - centerY;
              const dist = Math.sqrt(dx * dx + dy * dy);
              
              // Apply breathing (points move in/out from center)
              const newX = centerX + (dx * breathAmount) + floatX;
              const newY = centerY + (dy * breathAmount) + floatY;
              
              baseX = newX;
              baseY = newY;
            } else {
              baseX = dot.baseX;
              baseY = dot.baseY;
            }
          } else {
            baseX = dot.baseX;
            baseY = dot.baseY;
          }
        } else if (gridType === 'triangular') {
          // For triangular lattice, use stable rest position
          baseX = dot.baseX;
          baseY = dot.baseY;
        } else if (gridType === 'mesh') {
          // For mesh, use stable rest position
          baseX = dot.baseX;
          baseY = dot.baseY;
        } else if (gridType === 'flux') {
          // For flux, animate the warped lattice with time-based waves
          const fluxTime = now * 0.0004; // Slow animation speed
          const amp1 = 18;
          const amp2 = 10;
          const f1 = 0.012;
          const f2 = 0.009;
          
          // Parse grid coordinates from key (gx,gy)
        const [gxStr, gyStr] = key.split(',');
          if (gxStr && gyStr) {
        const gx = parseInt(gxStr);
        const gy = parseInt(gyStr);

            // Animated flux distortion with time-based phase
            const x = gx + amp1 * Math.sin(gy * f1 + fluxTime) + amp2 * Math.sin(gx * f2 + fluxTime * 0.7);
            const y = gy + amp1 * Math.cos(gx * f1 + fluxTime * 0.8) + amp2 * Math.cos(gy * f2 + fluxTime * 1.2);
            
            baseX = x;
            baseY = y;
          } else {
            baseX = dot.baseX;
            baseY = dot.baseY;
          }
        } else if (gridType === 'constellation') {
          // For constellation, use stable rest position (star field)
          baseX = dot.baseX;
          baseY = dot.baseY;
        } else if (gridType === 'floral') {
          // For floral, use stable rest position
          baseX = dot.baseX;
          baseY = dot.baseY;
        } else if (gridType === 'waves') {
          // For waves, animate the y position based on time for water-like movement
          const waveTime = (now * 0.0003) % (Math.PI * 2); // Slow animation (0.0003 = subtle speed)
          const waveSpacing = gridSize * 2;
          const waveAmplitude = gridSize * 0.8;
          const waveFrequency = 0.015;
          
          // Parse wave index from key (wave_${wave}_${i})
          const parts = key.split('_');
          if (parts.length >= 3) {
            const waveIndex = parseInt(parts[1]);
            const pointIndex = parseInt(parts[2]);
            
            // Get the stored base x position from the dot
            // For waves, baseX stores the x coordinate, baseY stores the center y
            const baseXPos = dot.baseX;
            // Calculate base y position (center of wave) from the wave index
            const baseYPos = waveIndex * waveSpacing;
            
            // Animate with phase offset per wave for water-like effect
            const phaseOffset = waveIndex * 0.5;
            const timeOffset = waveTime + phaseOffset;
            // Add horizontal wave propagation (sine wave along x-axis)
            const horizontalPhase = baseXPos * waveFrequency;
            const animatedY = baseYPos + Math.sin(horizontalPhase + timeOffset) * waveAmplitude;
            
            baseX = baseXPos;
            baseY = animatedY;
          } else {
            baseX = dot.baseX;
            baseY = dot.baseY;
          }
        } else {
        const [gxStr, gyStr] = key.split(',');
        const gx = parseInt(gxStr);
        const gy = parseInt(gyStr);
        // Base position with parallax
          baseX = gx + offsetX;
          baseY = gy + offsetY;
        }

        // Calculate target displacement from ALL panels
        let totalPushX = 0;
        let totalPushY = 0;
        let minDist = Infinity;

        // Push from main panel
        const mainPush = getPanelPush(baseX, baseY, panelLeft, panelRight, panelTop, panelBottom);
        totalPushX += mainPush.x;
        totalPushY += mainPush.y;

        // Calculate distance to main panel for brightness
        const mainClosestX = Math.max(panelLeft, Math.min(baseX, panelRight));
        const mainClosestY = Math.max(panelTop, Math.min(baseY, panelBottom));
        const mainDist = Math.sqrt((baseX - mainClosestX) ** 2 + (baseY - mainClosestY) ** 2);
        minDist = Math.min(minDist, mainDist);

        // Push from all floating panels
        const floatingPanels = panelsRef.current;
        for (const fp of floatingPanels) {
          const fpPush = getPanelPush(baseX, baseY, fp.x, fp.x + fp.width, fp.y, fp.y + fp.height);
          totalPushX += fpPush.x;
          totalPushY += fpPush.y;

          // Track closest panel for brightness
          const fpClosestX = Math.max(fp.x, Math.min(baseX, fp.x + fp.width));
          const fpClosestY = Math.max(fp.y, Math.min(baseY, fp.y + fp.height));
          const fpDist = Math.sqrt((baseX - fpClosestX) ** 2 + (baseY - fpClosestY) ** 2);
          minDist = Math.min(minDist, fpDist);
        }

        const targetX = baseX + totalPushX;
        const targetY = baseY + totalPushY;
        const dist = minDist; // Use closest panel distance for brightness
        const normalizedDist = Math.min(dist / maxDist, 1);

        // Spring physics
        const forceX = (targetX - dot.x) * springStiffness;
        const forceY = (targetY - dot.y) * springStiffness;

        dot.vx = (dot.vx + forceX) * damping;
        dot.vy = (dot.vy + forceY) * damping;

        dot.x += dot.vx;
        dot.y += dot.vy;

        // Ripple size effect: small near panel, peaks in middle, small at edges
        // Using sine curve for smooth ripple: smallest at 0, peak around 0.4-0.5, smallest at 1
        const ripple = Math.sin(normalizedDist * Math.PI);
        dot.targetSize = 0.8 + ripple * 2; // Range: 0.8 (near/far) to 2.8 (middle)
        dot.size += (dot.targetSize - dot.size) * 0.15;

        // Brightness uses a much tighter radius (only very close to panel)
        const brightnessRadius = 110;
        const brightnessDist = Math.min(dist / brightnessRadius, 1);
        const brightnessFalloff = Math.pow(brightnessDist, 2);

        // Base opacity for all dots
        const baseOpacity = 0.12;
        // Extra brightness only for dots very close to panel
        const brightnessBoost = (1 - brightnessFalloff) * 0.8;

        const opacity = baseOpacity + brightnessBoost;

        // Color: white near panel, grey far
        const colorValue = Math.round(130 + (1 - brightnessFalloff) * 125);

        ctx.beginPath();
        ctx.arc(dot.x, dot.y, Math.max(0.5, dot.size), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${colorValue}, ${colorValue}, ${colorValue}, ${Math.max(0, opacity)})`;
        ctx.fill();
      });

      // Draw grid-based connection lines using deformed dot positions
      const currentConnections = connectionsRef.current;
      const currentPanels = panelsRef.current;
      const currentDrag = connectionDragRef.current;
      const dots = dotsRef.current;

      // Helper to get panel center
      const getPanelCenter = (panelId: string) => {
        const panel = currentPanels.find(p => p.id === panelId);
        if (!panel) return null;
        return { x: panel.x + panel.width / 2, y: panel.y + panel.height / 2 };
      };

      // Snap to nearest grid coordinate (returns base grid coords, not actual position)
      const snapToGridCoords = (x: number, y: number) => {
        if (gridType === 'isometric') {
          // Convert screen to isometric, then round to nearest grid point
          const offsetX = width / 2;
          const offsetY = height / 2;
          const relX = x - offsetX;
          const relY = y - offsetY;
          const { isoX, isoY } = screenToIsometric(relX, relY);
          return { gx: Math.round(isoX), gy: Math.round(isoY) };
        } else if (gridType === 'hexagonal') {
          const offsetX = width / 2;
          const offsetY = height / 2;
          const relX = x - offsetX;
          const relY = y - offsetY;
          const { q, r } = screenToHex(relX, relY);
          return { gx: q, gy: r };
        } else if (gridType === 'web_one' || gridType === 'quantum_web' || gridType === 'spiral') {
          // For polar, find nearest dot
          let nearestKey = '';
          let minDist = Infinity;
          
          dotsRef.current.forEach((d, k) => {
            if (k.startsWith('polar_')) {
              const dist = Math.sqrt((d.x - x) ** 2 + (d.y - y) ** 2);
              if (dist < minDist) {
                minDist = dist;
                nearestKey = k;
              }
            }
          });
          return { gx: 0, gy: 0, key: nearestKey };
        } else if (gridType === 'organic') {
          // For organic, find nearest dot
          let nearestKey = '';
          let minDist = Infinity;
          dotsRef.current.forEach((d, k) => {
            if (k.startsWith('organic_')) {
              const dist = Math.sqrt((d.x - x) ** 2 + (d.y - y) ** 2);
              if (dist < minDist) {
                minDist = dist;
                nearestKey = k;
              }
            }
          });
          return { gx: 0, gy: 0, key: nearestKey };
        } else if (gridType === 'constellation') {
          // For constellation, find nearest star
          let nearestKey = '';
          let minDist = Infinity;
          dotsRef.current.forEach((d, k) => {
            if (!k.startsWith('star_')) return;
            const dist = Math.sqrt((d.x - x) ** 2 + (d.y - y) ** 2);
            if (dist < minDist) {
              minDist = dist;
              nearestKey = k;
            }
          });
          return { gx: 0, gy: 0, key: nearestKey };
        } else if (gridType === 'triangular') {
          // For triangular, find nearest dot
          let nearestKey = '';
          let minDist = Infinity;

          dotsRef.current.forEach((d, k) => {
            if (k.startsWith('tri_')) {
              const dist = Math.sqrt((d.x - x) ** 2 + (d.y - y) ** 2);
              if (dist < minDist) {
                minDist = dist;
                nearestKey = k;
              }
            }
          });
          return { gx: 0, gy: 0, key: nearestKey };
        } else if (gridType === 'mesh') {
          // For mesh, find nearest dot
          let nearestKey = '';
          let minDist = Infinity;
          dotsRef.current.forEach((d, k) => {
            if (!k.startsWith('mesh_')) return;
            const dist = Math.sqrt((d.x - x) ** 2 + (d.y - y) ** 2);
            if (dist < minDist) {
              minDist = dist;
              nearestKey = k;
            }
          });
          return { gx: 0, gy: 0, key: nearestKey };
        } else if (gridType === 'flux') {
          // For flux, find nearest dot among rectangular keys
          let nearestKey = '';
          let minDist = Infinity;

          dotsRef.current.forEach((d, k) => {
            if (k.includes(',') && !k.startsWith('polar_') && !k.startsWith('tri_')) {
              const dist = Math.sqrt((d.x - x) ** 2 + (d.y - y) ** 2);
              if (dist < minDist) {
                minDist = dist;
                nearestKey = k;
              }
            }
          });

          if (nearestKey) {
            const [gxStr, gyStr] = nearestKey.split(',');
            const gx = parseInt(gxStr, 10);
            const gy = parseInt(gyStr, 10);
            return { gx, gy, key: nearestKey };
          }

          return { gx: Math.round(x / gridSize) * gridSize, gy: Math.round(y / gridSize) * gridSize };
        } else if (gridType === 'floral') {
          // For floral, find nearest dot
          let nearestKey = '';
          let minDist = Infinity;
          dotsRef.current.forEach((d, k) => {
            if (k.startsWith('floral_')) {
              const dist = Math.sqrt((d.x - x) ** 2 + (d.y - y) ** 2);
              if (dist < minDist) {
                minDist = dist;
                nearestKey = k;
              }
            }
          });
          return { gx: 0, gy: 0, key: nearestKey };
        } else if (gridType === 'waves') {
          // For waves, find nearest dot
          let nearestKey = '';
          let minDist = Infinity;
          dotsRef.current.forEach((d, k) => {
            if (k.startsWith('wave_')) {
              const dist = Math.sqrt((d.x - x) ** 2 + (d.y - y) ** 2);
              if (dist < minDist) {
                minDist = dist;
                nearestKey = k;
              }
            }
          });
          return { gx: 0, gy: 0, key: nearestKey };
        } else {
          return {
        gx: Math.round(x / gridSize) * gridSize,
        gy: Math.round(y / gridSize) * gridSize,
          };
        }
      };

      // Get actual deformed dot position from grid coordinates
      const getDotPos = (gx: number, gy: number, key?: string) => {
        let dotKey = key || `${gx},${gy}`;
        const dot = dots.get(dotKey);
        if (dot) return { x: dot.x, y: dot.y };
        
        // Fallback: convert grid coords to screen coords
        if (gridType === 'isometric') {
          const screen = isometricToScreen(gx, gy);
          const offsetX = width / 2;
          const offsetY = height / 2;
          return { x: screen.x + offsetX, y: screen.y + offsetY };
        } else if (gridType === 'hexagonal') {
          const screen = hexToScreen(gx, gy);
          const offsetX = width / 2;
          const offsetY = height / 2;
          return { x: screen.x + offsetX, y: screen.y + offsetY };
        }
        
        return { x: gx, y: gy };
      };

      // Helper to check if a point is inside a panel (with margin)
      const isPointInPanel = (x: number, y: number, panel: FloatingPanelData, margin: number = 10) => {
        return x >= panel.x - margin && x <= panel.x + panel.width + margin &&
               y >= panel.y - margin && y <= panel.y + panel.height + margin;
      };

      // Helper to check if a path collides with any panel (except excluded ones)
      const pathCollidesWithPanels = (points: Array<{ gx: number; gy: number; key?: string }>, excludePanelIds: string[]) => {
        for (const point of points) {
          const pos = getDotPos(point.gx, point.gy, point.key);
          for (const panel of currentPanels) {
            if (excludePanelIds.includes(panel.id)) continue;
            if (isPointInPanel(pos.x, pos.y, panel)) {
              return true;
            }
          }
        }
        return false;
      };

      // Build an L-shaped path (horizontal first or vertical first)
      // For isometric, uses diagonal movement along grid axes
      const buildLPath = (startGrid: { gx: number; gy: number; key?: string }, endGrid: { gx: number; gy: number; key?: string }, horizontalFirst: boolean) => {
        const pathPoints: Array<{ gx: number; gy: number; key?: string }> = [];

        if (gridType === 'isometric') {
          // For isometric, move along the three axes: northeast, southeast, or east
          let currentX = startGrid.gx;
          let currentY = startGrid.gy;
          pathPoints.push({ gx: currentX, gy: currentY });

          // Simple pathfinding: move in the direction that reduces distance most
          while (currentX !== endGrid.gx || currentY !== endGrid.gy) {
            const dx = endGrid.gx - currentX;
            const dy = endGrid.gy - currentY;

            // Try moving in the direction that reduces distance most
            if (Math.abs(dx) > Math.abs(dy)) {
              // Move east/west
              currentX += dx > 0 ? 1 : -1;
            } else if (dy !== 0) {
              // Move southeast/northwest
              currentY += dy > 0 ? 1 : -1;
            } else {
              // Move northeast/southwest (diagonal)
              currentX += dx > 0 ? 1 : -1;
              currentY += dy > 0 ? -1 : 1;
            }

            pathPoints.push({ gx: currentX, gy: currentY });
            
            // Safety check to prevent infinite loops
            if (pathPoints.length > 100) break;
          }
        } else if (gridType === 'hexagonal') {
          // Hexagonal pathfinding using axial coordinates
          let currentQ = startGrid.gx;
          let currentR = startGrid.gy;
          pathPoints.push({ gx: currentQ, gy: currentR });

          while (currentQ !== endGrid.gx || currentR !== endGrid.gy) {
            const dq = endGrid.gx - currentQ;
            const dr = endGrid.gy - currentR;
            
            // Move in the direction that reduces distance most
            if (Math.abs(dq) > Math.abs(dr)) {
              currentQ += dq > 0 ? 1 : -1;
            } else if (dr !== 0) {
              currentR += dr > 0 ? 1 : -1;
            } else {
              // Move diagonally
              currentQ += dq > 0 ? 1 : -1;
              currentR += dr > 0 ? -1 : 1;
            }

            pathPoints.push({ gx: currentQ, gy: currentR });
            if (pathPoints.length > 100) break;
          }
        } else if (gridType === 'web_one' || gridType === 'quantum_web') {
          // Web family: pathfind through polar coordinates
          const startKey = startGrid.key || `${startGrid.gx},${startGrid.gy}`;
          const endKey = endGrid.key || `${endGrid.gx},${endGrid.gy}`;
          
          if (startKey.startsWith('polar_') && endKey.startsWith('polar_')) {
            const startParts = startKey.split('_');
            const endParts = endKey.split('_');
            if (startParts.length >= 3 && endParts.length >= 3) {
              let ring = parseInt(startParts[1]);
              let radial = parseInt(startParts[2]);
              const endRing = parseInt(endParts[1]);
              const endRadial = parseInt(endParts[2]);
              
              pathPoints.push({ gx: ring, gy: radial, key: startKey });
              
              // Move through rings first, then radial
              while (ring !== endRing) {
                ring += ring < endRing ? 1 : -1;
                const key = `polar_${ring}_${radial}`;
                if (dotsRef.current.has(key)) {
                  pathPoints.push({ gx: ring, gy: radial, key });
                }
                if (pathPoints.length > 100) break;
              }
              
              // Then move radial (handle wrap-around)
              while (radial !== endRadial) {
                const diff = ((endRadial - radial + polarRadialLines) % polarRadialLines);
                const forward = diff <= polarRadialLines / 2;
                radial = (radial + (forward ? 1 : -1) + polarRadialLines) % polarRadialLines;
                const key = `polar_${ring}_${radial}`;
                if (dotsRef.current.has(key)) {
                  pathPoints.push({ gx: ring, gy: radial, key });
                }
                if (pathPoints.length > 100) break;
              }
              
              if (pathPoints[pathPoints.length - 1].key !== endKey) {
                pathPoints.push({ gx: endRing, gy: endRadial, key: endKey });
              }
            }
          } else {
            pathPoints.push({ gx: startGrid.gx, gy: startGrid.gy, key: startKey });
            pathPoints.push({ gx: endGrid.gx, gy: endGrid.gy, key: endKey });
          }
        } else if (gridType === 'triangular') {
          // Triangular lattice: shortest path over neighbor graph (BFS)
          const startKey = startGrid.key || `${startGrid.gx},${startGrid.gy}`;
          const endKey = endGrid.key || `${endGrid.gx},${endGrid.gy}`;

          if (startKey.startsWith('tri_') && endKey.startsWith('tri_') && startKey !== '' && endKey !== '') {
            const parse = (k: string) => {
              const parts = k.split('_');
              return { row: parseInt(parts[1]), col: parseInt(parts[2]) };
            };
            const neighborsOf = (k: string) => {
              const { row, col } = parse(k);
              const parity = row & 1;
              const candidates = [
                `tri_${row}_${col - 1}`,
                `tri_${row}_${col + 1}`,
                `tri_${row - 1}_${col - parity}`,
                `tri_${row - 1}_${col - parity + 1}`,
                `tri_${row + 1}_${col - parity}`,
                `tri_${row + 1}_${col - parity + 1}`,
              ];
              return candidates.filter(c => dotsRef.current.has(c));
            };

            const queue: string[] = [startKey];
            const prev = new Map<string, string | null>();
            prev.set(startKey, null);

            while (queue.length) {
              const cur = queue.shift()!;
              if (cur === endKey) break;
              for (const n of neighborsOf(cur)) {
                if (prev.has(n)) continue;
                prev.set(n, cur);
                queue.push(n);
              }
              if (prev.size > 2000) break; // safety
            }

            if (prev.has(endKey)) {
              const pathKeys: string[] = [];
              let cur: string | null = endKey;
              while (cur) {
                pathKeys.push(cur);
                cur = prev.get(cur) ?? null;
              }
              pathKeys.reverse();
              for (const k of pathKeys) pathPoints.push({ gx: 0, gy: 0, key: k });
            } else {
              // fallback direct
              pathPoints.push({ gx: 0, gy: 0, key: startKey });
              pathPoints.push({ gx: 0, gy: 0, key: endKey });
            }
          } else {
            pathPoints.push({ gx: startGrid.gx, gy: startGrid.gy, key: startKey });
            pathPoints.push({ gx: endGrid.gx, gy: endGrid.gy, key: endKey });
          }
        } else if (gridType === 'mesh') {
          // Mesh: BFS over neighbor graph (same topology as neighbors section)
          const startKey = startGrid.key || `${startGrid.gx},${startGrid.gy}`;
          const endKey = endGrid.key || `${endGrid.gx},${endGrid.gy}`;

          if (startKey.startsWith('mesh_') && endKey.startsWith('mesh_') && startKey !== '' && endKey !== '') {
            const parse = (k: string) => {
              const parts = k.split('_');
              return { r: parseInt(parts[1]), c: parseInt(parts[2]) };
            };
            const neighborsOf = (k: string) => {
              const { r, c } = parse(k);
              const parity = r & 1;
              const candidates = [
                `mesh_${r}_${c - 1}`,
                `mesh_${r}_${c + 1}`,
                `mesh_${r - 1}_${c}`,
                `mesh_${r + 1}_${c}`,
                `mesh_${r - 1}_${c + (parity ? 1 : -1)}`,
                `mesh_${r + 1}_${c + (parity ? 1 : -1)}`,
              ];
              return candidates.filter(cand => dotsRef.current.has(cand));
            };

            const queue: string[] = [startKey];
            const prev = new Map<string, string | null>();
            prev.set(startKey, null);
            while (queue.length) {
              const cur = queue.shift()!;
              if (cur === endKey) break;
              for (const n of neighborsOf(cur)) {
                if (prev.has(n)) continue;
                prev.set(n, cur);
                queue.push(n);
              }
              if (prev.size > 4000) break;
            }

            if (prev.has(endKey)) {
              const pathKeys: string[] = [];
              let cur: string | null = endKey;
              while (cur) {
                pathKeys.push(cur);
                cur = prev.get(cur) ?? null;
              }
              pathKeys.reverse();
              for (const k of pathKeys) pathPoints.push({ gx: 0, gy: 0, key: k });
            } else {
              pathPoints.push({ gx: 0, gy: 0, key: startKey });
              pathPoints.push({ gx: 0, gy: 0, key: endKey });
            }
          } else {
            pathPoints.push({ gx: startGrid.gx, gy: startGrid.gy, key: startKey });
            pathPoints.push({ gx: endGrid.gx, gy: endGrid.gy, key: endKey });
          }
        } else {
          // Rectangular grid path
        if (horizontalFirst) {
          // Horizontal then vertical
          const xStep = startGrid.gx < endGrid.gx ? gridSize : -gridSize;
          if (startGrid.gx !== endGrid.gx) {
            for (let gx = startGrid.gx; xStep > 0 ? gx <= endGrid.gx : gx >= endGrid.gx; gx += xStep) {
              pathPoints.push({ gx, gy: startGrid.gy });
            }
          } else {
            pathPoints.push({ gx: startGrid.gx, gy: startGrid.gy });
          }
          const yStep = startGrid.gy < endGrid.gy ? gridSize : -gridSize;
          if (startGrid.gy !== endGrid.gy) {
            for (let gy = startGrid.gy + yStep; yStep > 0 ? gy <= endGrid.gy : gy >= endGrid.gy; gy += yStep) {
              pathPoints.push({ gx: endGrid.gx, gy });
            }
          }
        } else {
          // Vertical then horizontal
          const yStep = startGrid.gy < endGrid.gy ? gridSize : -gridSize;
          if (startGrid.gy !== endGrid.gy) {
            for (let gy = startGrid.gy; yStep > 0 ? gy <= endGrid.gy : gy >= endGrid.gy; gy += yStep) {
              pathPoints.push({ gx: startGrid.gx, gy });
            }
          } else {
            pathPoints.push({ gx: startGrid.gx, gy: startGrid.gy });
          }
          const xStep = startGrid.gx < endGrid.gx ? gridSize : -gridSize;
          if (startGrid.gx !== endGrid.gx) {
            for (let gx = startGrid.gx + xStep; xStep > 0 ? gx <= endGrid.gx : gx >= endGrid.gx; gx += xStep) {
              pathPoints.push({ gx, gy: endGrid.gy });
              }
            }
          }
        }

        return pathPoints;
      };

      // Draw a path through actual deformed grid dots, avoiding other panels
      const drawGridPath = (fromX: number, fromY: number, toX: number, toY: number, color: string, lineWidth: number, alpha: number, excludePanelIds: string[] = [], animated: boolean = false) => {
        const startGrid = snapToGridCoords(fromX, fromY);
        const endGrid = snapToGridCoords(toX, toY);

        // Try horizontal-first path
        let pathPoints = buildLPath(startGrid, endGrid, true);
        const horizontalFirstCollides = pathCollidesWithPanels(pathPoints, excludePanelIds);

        // Try vertical-first path
        const verticalFirstPath = buildLPath(startGrid, endGrid, false);
        const verticalFirstCollides = pathCollidesWithPanels(verticalFirstPath, excludePanelIds);

        // Choose the better path
        if (horizontalFirstCollides && !verticalFirstCollides) {
          pathPoints = verticalFirstPath;
        } else if (!horizontalFirstCollides && verticalFirstCollides) {
          // Keep horizontal-first (already set)
        } else if (horizontalFirstCollides && verticalFirstCollides) {
          // Both collide - try to find a path around
          // For now, just use the shorter one; could implement proper A* later
          if (verticalFirstPath.length < pathPoints.length) {
            pathPoints = verticalFirstPath;
          }
        }

        if (pathPoints.length < 2) return;

        // Get actual deformed positions for all path points
        const actualPoints = pathPoints.map(p => getDotPos(p.gx, p.gy, p.key));

        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = alpha;

        // Draw smooth curved path through deformed dot positions
        ctx.beginPath();
        ctx.moveTo(actualPoints[0].x, actualPoints[0].y);

        if (actualPoints.length === 2) {
          // Just two points - straight line
          ctx.lineTo(actualPoints[1].x, actualPoints[1].y);
        } else {
          // Use quadratic curves for smooth corners
          for (let i = 1; i < actualPoints.length - 1; i++) {
            const prev = actualPoints[i - 1];
            const curr = actualPoints[i];
            const next = actualPoints[i + 1];

            // Calculate midpoints for smooth transitions
            const midX1 = (prev.x + curr.x) / 2;
            const midY1 = (prev.y + curr.y) / 2;
            const midX2 = (curr.x + next.x) / 2;
            const midY2 = (curr.y + next.y) / 2;

            if (i === 1) {
              // First segment: line to first midpoint, then curve
              ctx.lineTo(midX1, midY1);
            }

            // Quadratic curve through the corner point
            ctx.quadraticCurveTo(curr.x, curr.y, midX2, midY2);
          }

          // Final segment to last point
          ctx.lineTo(actualPoints[actualPoints.length - 1].x, actualPoints[actualPoints.length - 1].y);
        }
        ctx.stroke();

        // Draw energy flow - bright segment with gradient that flows along curved path
        if (animated && actualPoints.length >= 2) {
          // Sample points along the actual curved path (same curve logic as main drawing)
          const sampledPoints: { x: number; y: number }[] = [];
          const samplesPerSegment = 8;

          if (actualPoints.length === 2) {
            // Straight line - just use endpoints
            sampledPoints.push(actualPoints[0], actualPoints[1]);
          } else {
            // Sample along the curved path
            sampledPoints.push(actualPoints[0]);

            for (let i = 1; i < actualPoints.length - 1; i++) {
              const prev = actualPoints[i - 1];
              const curr = actualPoints[i];
              const next = actualPoints[i + 1];

              const midX1 = (prev.x + curr.x) / 2;
              const midY1 = (prev.y + curr.y) / 2;
              const midX2 = (curr.x + next.x) / 2;
              const midY2 = (curr.y + next.y) / 2;

              if (i === 1) {
                // Line from start to first midpoint
                for (let t = 1; t <= samplesPerSegment; t++) {
                  const tt = t / samplesPerSegment;
                  sampledPoints.push({
                    x: actualPoints[0].x + (midX1 - actualPoints[0].x) * tt,
                    y: actualPoints[0].y + (midY1 - actualPoints[0].y) * tt
                  });
                }
              }

              // Quadratic bezier from midX1,midY1 through curr to midX2,midY2
              for (let t = 1; t <= samplesPerSegment; t++) {
                const tt = t / samplesPerSegment;
                // Quadratic bezier formula: (1-t)²P0 + 2(1-t)tP1 + t²P2
                const x = (1-tt)*(1-tt)*midX1 + 2*(1-tt)*tt*curr.x + tt*tt*midX2;
                const y = (1-tt)*(1-tt)*midY1 + 2*(1-tt)*tt*curr.y + tt*tt*midY2;
                sampledPoints.push({ x, y });
              }
            }

            // Line from last midpoint to end
            const lastMidX = (actualPoints[actualPoints.length-2].x + actualPoints[actualPoints.length-1].x) / 2;
            const lastMidY = (actualPoints[actualPoints.length-2].y + actualPoints[actualPoints.length-1].y) / 2;
            for (let t = 1; t <= samplesPerSegment; t++) {
              const tt = t / samplesPerSegment;
              sampledPoints.push({
                x: lastMidX + (actualPoints[actualPoints.length-1].x - lastMidX) * tt,
                y: lastMidY + (actualPoints[actualPoints.length-1].y - lastMidY) * tt
              });
            }
          }

          // Calculate cumulative distances along sampled path
          const cumDist: number[] = [0];
          for (let i = 1; i < sampledPoints.length; i++) {
            const dx = sampledPoints[i].x - sampledPoints[i-1].x;
            const dy = sampledPoints[i].y - sampledPoints[i-1].y;
            cumDist.push(cumDist[i-1] + Math.sqrt(dx*dx + dy*dy));
          }
          const totalLen = cumDist[cumDist.length - 1];

          if (totalLen > 20) {
            // Continuous flowing energy - multiple soft pulses
            const speed = 0.12; // pixels per ms (faster)
            const pulseSpacing = 100; // distance between pulse centers
            const pulseWidth = 60; // width of each pulse's falloff

            // Draw curved segments with smooth flowing brightness
            for (let i = 0; i < sampledPoints.length - 1; i++) {
              const segMid = (cumDist[i] + cumDist[i + 1]) / 2;

              // Calculate brightness from multiple flowing pulses
              let brightness = 0;
              const flowPos = (now * speed) % pulseSpacing;

              // Check distance to nearest pulse (repeating pattern)
              for (let offset = -pulseSpacing; offset <= totalLen + pulseSpacing; offset += pulseSpacing) {
                const pulseCenter = flowPos + offset;
                const dist = Math.abs(segMid - pulseCenter);
                // Smooth cosine falloff
                if (dist < pulseWidth) {
                  const intensity = (Math.cos((dist / pulseWidth) * Math.PI) + 1) / 2;
                  brightness = Math.max(brightness, intensity);
                }
              }

              if (brightness > 0.02) {
                ctx.save();
                ctx.strokeStyle = `rgba(0, 200, 255, ${brightness * 0.9})`;
                ctx.lineWidth = lineWidth + brightness * 1.5;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(sampledPoints[i].x, sampledPoints[i].y);
                ctx.lineTo(sampledPoints[i+1].x, sampledPoints[i+1].y);
                ctx.stroke();
                ctx.restore();
              }
            }
          }
        }

        // Draw nodes at start and end
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(actualPoints[0].x, actualPoints[0].y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(actualPoints[actualPoints.length - 1].x, actualPoints[actualPoints.length - 1].y, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      };

      // Draw established connections with energy flow animation
      for (const conn of currentConnections) {
        const from = getPanelCenter(conn.fromPanelId);
        const to = getPanelCenter(conn.toPanelId);
        if (from && to) {
          const { r: ar, g: ag, b: ab } = accentRgbRef.current;
          drawGridPath(from.x, from.y, to.x, to.y, `rgb(${ar}, ${ag}, ${ab})`, 2, 0.7, [conn.fromPanelId, conn.toPanelId], true);
        }
      }

      // Draw cut connection retraction animations
      const currentCutConnections = cutConnectionsRef.current;
      const cutAnimationDuration = 600; // 600ms retraction

      for (const cut of currentCutConnections) {
        const fromPanel = currentPanels.find(p => p.id === cut.fromPanelId);
        const toPanel = currentPanels.find(p => p.id === cut.toPanelId);

        if (fromPanel && toPanel) {
          const fromCenter = { x: fromPanel.x + fromPanel.width / 2, y: fromPanel.y + fromPanel.height / 2 };
          const toCenter = { x: toPanel.x + toPanel.width / 2, y: toPanel.y + toPanel.height / 2 };

          // Build the FULL original path (same as regular connection)
          const startGrid = snapToGridCoords(fromCenter.x, fromCenter.y);
          const endGrid = snapToGridCoords(toCenter.x, toCenter.y);

          const pathPoints: { gx: number; gy: number }[] = [];
          const xStep = startGrid.gx < endGrid.gx ? gridSize : -gridSize;
          if (startGrid.gx !== endGrid.gx) {
            for (let gx = startGrid.gx; xStep > 0 ? gx <= endGrid.gx : gx >= endGrid.gx; gx += xStep) {
              pathPoints.push({ gx, gy: startGrid.gy });
            }
          } else {
            pathPoints.push({ gx: startGrid.gx, gy: startGrid.gy });
          }
          const yStep = startGrid.gy < endGrid.gy ? gridSize : -gridSize;
          if (startGrid.gy !== endGrid.gy) {
            for (let gy = startGrid.gy + yStep; yStep > 0 ? gy <= endGrid.gy : gy >= endGrid.gy; gy += yStep) {
              pathPoints.push({ gx: endGrid.gx, gy });
            }
          }

          if (pathPoints.length < 2) continue;

          // Get actual deformed positions
          const actualPoints = pathPoints.map(p => getDotPos(p.gx, p.gy));

          // Find the point closest to the cut location (approximate middle of path)
          let cutIndex = Math.floor(actualPoints.length / 2);
          let minDist = Infinity;
          for (let i = 0; i < actualPoints.length; i++) {
            const d = Math.sqrt((actualPoints[i].x - cut.cutX) ** 2 + (actualPoints[i].y - cut.cutY) ** 2);
            if (d < minDist) {
              minDist = d;
              cutIndex = i;
            }
          }

          const elapsed = now - cut.cutTime;
          const progress = Math.min(1, elapsed / cutAnimationDuration);
          const easeOut = 1 - Math.pow(1 - progress, 3); // Cubic ease out
          const fadeAlpha = 0.7 * (1 - easeOut * 0.8);

          if (progress < 1) {
            ctx.save();
            {
              const { r: ar, g: ag, b: ab } = accentRgbRef.current;
              ctx.strokeStyle = `rgb(${ar}, ${ag}, ${ab})`;
            }
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.globalAlpha = fadeAlpha;

            // "From" side: points 0 to cutIndex, retracting toward 0
            const fromPointsCount = cutIndex + 1;
            const fromRetractAmount = Math.floor(fromPointsCount * easeOut);
            const fromVisibleEnd = Math.max(1, cutIndex - fromRetractAmount);

            if (fromVisibleEnd > 0) {
              const fromPoints = actualPoints.slice(0, fromVisibleEnd + 1);
              ctx.beginPath();
              ctx.moveTo(fromPoints[0].x, fromPoints[0].y);
              if (fromPoints.length === 2) {
                ctx.lineTo(fromPoints[1].x, fromPoints[1].y);
              } else if (fromPoints.length > 2) {
                for (let i = 1; i < fromPoints.length - 1; i++) {
                  const prev = fromPoints[i - 1];
                  const curr = fromPoints[i];
                  const next = fromPoints[i + 1];
                  const midX1 = (prev.x + curr.x) / 2;
                  const midY1 = (prev.y + curr.y) / 2;
                  const midX2 = (curr.x + next.x) / 2;
                  const midY2 = (curr.y + next.y) / 2;
                  if (i === 1) ctx.lineTo(midX1, midY1);
                  ctx.quadraticCurveTo(curr.x, curr.y, midX2, midY2);
                }
                ctx.lineTo(fromPoints[fromPoints.length - 1].x, fromPoints[fromPoints.length - 1].y);
              }
              ctx.stroke();
            }

            // "To" side: points cutIndex to end, retracting toward end
            const toPointsCount = actualPoints.length - cutIndex;
            const toRetractAmount = Math.floor(toPointsCount * easeOut);
            const toVisibleStart = Math.min(actualPoints.length - 2, cutIndex + toRetractAmount);

            if (toVisibleStart < actualPoints.length - 1) {
              const toPoints = actualPoints.slice(toVisibleStart);
              ctx.beginPath();
              ctx.moveTo(toPoints[0].x, toPoints[0].y);
              if (toPoints.length === 2) {
                ctx.lineTo(toPoints[1].x, toPoints[1].y);
              } else if (toPoints.length > 2) {
                for (let i = 1; i < toPoints.length - 1; i++) {
                  const prev = toPoints[i - 1];
                  const curr = toPoints[i];
                  const next = toPoints[i + 1];
                  const midX1 = (prev.x + curr.x) / 2;
                  const midY1 = (prev.y + curr.y) / 2;
                  const midX2 = (curr.x + next.x) / 2;
                  const midY2 = (curr.y + next.y) / 2;
                  if (i === 1) ctx.lineTo(midX1, midY1);
                  ctx.quadraticCurveTo(curr.x, curr.y, midX2, midY2);
                }
                ctx.lineTo(toPoints[toPoints.length - 1].x, toPoints[toPoints.length - 1].y);
              }
              ctx.stroke();
            }

            ctx.restore();
          } else {
            onCutAnimationCompleteRef.current(cut.id);
          }
        }
      }

      // Draw active drag
      if (currentDrag) {
        const from = getPanelCenter(currentDrag.fromPanelId);
        if (from) {
          // Grey while dragging, blue when over valid target
          const alpha = currentDrag.targetPanelId ? 0.85 : 0.5;
          const color = currentDrag.targetPanelId
            ? (() => {
                const { r: ar, g: ag, b: ab } = accentRgbRef.current;
                return `rgb(${ar}, ${ag}, ${ab})`;
              })()
            : '#888888';
          const excludeIds = currentDrag.targetPanelId
            ? [currentDrag.fromPanelId, currentDrag.targetPanelId]
            : [currentDrag.fromPanelId];
          drawGridPath(from.x, from.y, currentDrag.toX, currentDrag.toY, color, 2, alpha, excludeIds);
        }
      }

      // Draw slice trail - clean neon pink line
      const currentSliceTrail = sliceTrailRef.current;
      if (currentSliceTrail.length > 1) {
        const now = performance.now();

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 2;

        ctx.beginPath();
        let started = false;
        for (let i = 0; i < currentSliceTrail.length; i++) {
          const point = currentSliceTrail[i];
          const age = now - point.time;
          const maxAge = 200; // Trail fades over 200ms

          if (age < maxAge) {
            if (!started) {
              ctx.moveTo(point.x, point.y);
              started = true;
            } else {
              ctx.lineTo(point.x, point.y);
            }
          }
        }
        // Light grey slice line
        const trailAlpha = currentSliceTrail.length > 0 ? Math.max(0, 1 - (now - currentSliceTrail[currentSliceTrail.length - 1].time) / 200) : 0;
        ctx.strokeStyle = `rgba(180, 180, 180, ${trailAlpha * 0.8})`;
        ctx.stroke();

        ctx.restore();
      }

      // Update bouncy particles with panel collision
      updateBouncyParticles(deltaTime);

      // Draw regular particles on top
      for (const particle of particlesRef.current) {
        drawParticle(ctx, particle);
      }

      // Draw bouncy particles (on top of everything)
      for (const particle of bouncyParticlesRef.current) {
        drawBouncyParticle(ctx, particle);
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      initDots(gridTypeRef.current);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  // Update refs when props change
  useEffect(() => {
    lastPanelRef.current = { x: panelX, y: panelY, width: panelWidth, height: panelHeight };
  }, [panelX, panelY, panelWidth, panelHeight]);

  useEffect(() => {
    pulsesRef.current = pulses;
  }, [pulses]);

  useEffect(() => {
    mousePosRef.current = mousePos;
  }, [mousePos]);

  useEffect(() => {
    panelsRef.current = panels;
  }, [panels]);

  useEffect(() => {
    connectionsRef.current = connections;
  }, [connections]);


  useEffect(() => {
    sliceTrailRef.current = sliceTrail;
  }, [sliceTrail]);

  useEffect(() => {
    cutConnectionsRef.current = cutConnections;
  }, [cutConnections]);

  useEffect(() => {
    onCutAnimationCompleteRef.current = onCutAnimationComplete;
  }, [onCutAnimationComplete]);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    const hex = (accentHex || '').trim();
    const m = hex.match(/^#?([0-9a-fA-F]{6})$/);
    if (!m) return;
    const v = m[1];
    accentRgbRef.current = {
      r: parseInt(v.slice(0, 2), 16),
      g: parseInt(v.slice(2, 4), 16),
      b: parseInt(v.slice(4, 6), 16),
    };
  }, [accentHex]);

  useEffect(() => {
    gridTypeRef.current = gridType;
  }, [gridType]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
}

type GridType =
  | 'rectangular'
  | 'hexagonal'
  | 'isometric'
  | 'web_one'
  | 'quantum_web'
  | 'triangular'
  | 'mesh'
  | 'flux'
  | 'constellation'
  | 'floral'
  | 'waves'
  | 'spiral'
  | 'organic';

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

  const GRID_STORY: GridType[] = [
    'rectangular',
    'hexagonal',
    'isometric',
    'web_one',
    'quantum_web',
    'triangular',
    'mesh',
    'flux',
    'constellation',
    'floral',
    'waves',
    'spiral',
    'organic',
  ];

  // Keyboard: ArrowRight / ArrowDown advances the grid story
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      e.stopPropagation();
      soundEffects.playQuickStartClick();
      setGridType(prev => {
        const idx = GRID_STORY.indexOf(prev);
        const next = GRID_STORY[(idx >= 0 ? idx + 1 : 0) % GRID_STORY.length];
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
    const code = `import React from 'react';

export function NodeGridStory() {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[var(--app-bg)] text-[var(--app-fg)]">
      {/* Your Node Grid Canvas component goes here. */}
      <div className="absolute right-8 top-8 flex items-center gap-2">
        <button className="rounded-lg border border-[var(--btn-outline)] bg-white/10 px-3 py-2 text-xs font-semibold">
          {/* Theme */}
        </button>
        <input type="color" defaultValue="${accentHex}" className="h-8 w-8 cursor-pointer rounded-lg border border-[var(--btn-outline)] bg-transparent p-0" />
        <input defaultValue="${accentHex}" className="w-28 rounded-lg border border-[var(--btn-outline)] bg-white/10 px-2 py-2 font-mono text-xs outline-none" />
      </div>
      <div className="pointer-events-none absolute inset-0" />
    </div>
  );
}
`;

    await navigator.clipboard.writeText(code);
  }, [accentHex]);

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
            title="Copy React + Tailwind code"
          >
            Copy Code
          </button>
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
          {([
            'rectangular',
            'hexagonal',
            'isometric',
            'web_one',
            'quantum_web',
            'triangular',
            'mesh',
            'flux',
            'constellation',
            'floral',
            'waves',
            'spiral',
            'organic',
          ] as GridType[]).map((type) => {
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



