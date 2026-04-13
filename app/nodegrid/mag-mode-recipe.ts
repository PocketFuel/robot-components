import { NODEGRID_GITHUB_BASE } from './grid-types';

/**
 * Portable description of “mag mode” (node-grid magnifier) for LLMs and humans.
 * Keep in sync with: magnifier-playground.tsx, magnifier-dom-lens.tsx,
 * magnifier-grid-occlusion.tsx, dot-grid-canvas.tsx (onCanvasReady + externalMousePosRef).
 */
export const MAG_MODE_LLM_RECIPE = `/**
 * Robot Components — Node Grid MAG MODE (circular loupe)
 * ---------------------------------------------------------------------------
 * Upstream source tree: ${NODEGRID_GITHUB_BASE}
 *
 * WHAT IT IS
 * Full-viewport animated dot grid (DotGridCanvas) plus optional DOM “hero”
 * card. A circular lens follows the pointer and shows a TRUE magnified view:
 * same pixels as the scene (canvas mirror + duplicated hero subtree), not a
 * separate fake grid. Export PNG still samples only the grid canvas.
 *
 * ROUTE
 * - Page: app/nodegrid/magnifier/page.tsx → <MagnifierPlayground />
 * - URL path: /nodegrid/magnifier
 *
 * FILES TO COPY (minimal set for mag mode)
 * - app/nodegrid/grid.css
 * - app/nodegrid/grid-types.ts
 * - app/nodegrid/_components/panel-sounds.ts
 * - app/nodegrid/_components/dot-grid-canvas.tsx   (NoiseOverlay export optional)
 * - app/nodegrid/_components/magnifier-dom-lens.tsx
 * - app/nodegrid/_components/magnifier-grid-occlusion.tsx
 * - app/nodegrid/_components/magnifier-playground.tsx
 * - app/nodegrid/magnifier/page.tsx
 *
 * RENDER STACK (bottom → top, approximate z-index)
 * 1. DotGridCanvas (z 0, pointer-events none) — full-screen grid; panels off.
 * 2. Optional hit layer for “click to place markers” (z 1).
 * 3. Hero card (z 2, pointer-events none on shell; auto on card).
 * 4. MagnifierGridOcclusion (z 3) — fills a slightly oversized circle with
 *    --app-bg so unmagnified grid (and hero) do not show through under the lens.
 * 5. NoiseOverlay (z 4) — WebGL grain; not mirrored inside the lens.
 * 6. MagnifierDomLens (z 5) — circular overflow:hidden portal; see TRANSFORM.
 * 7. Marker nodes / HUD (z ≥ 6 and 10).
 *
 * POINTER + PERFORMANCE
 * - Do NOT setState on every mousemove (causes update-depth loops and jank).
 * - Keep pointer in a MutableRefObject; DotGridCanvas reads
 *   externalMousePosRef each animation frame for hover physics.
 * - MagnifierDomLens + MagnifierGridOcclusion read the same ref in rAF.
 *
 * CANVAS READY CALLBACK (avoid infinite re-renders)
 * - DotGridCanvas: store onCanvasReady in a ref; useEffect(..., []) calls it
 *   once on mount / null on unmount. Parent should use useCallback for the
 *   handler and setState only when canvas identity changes.
 *
 * DOM LENS TRANSFORM (MagnifierDomLens)
 * - Outer shell: fixed, width/height = 2*radius, border-radius 50%, left/top =
 *   mouseX - radius, mouseY - radius (CSS px).
 * - Inner: width 100vw, height 100vh, transform:
 *     translate(radius - mouseX * zoom, radius - mouseY * zoom) scale(zoom)
 *   transform-origin: 0 0
 * - Inner children: (a) mirror canvas — same backing resolution as source
 *   DotGridCanvas; each frame drawImage(source,0,0); imageSmoothingEnabled
 *   false + CSS image-rendering crisp-edges for sharp grid under scale.
 *   (b) Non-interactive clone of hero so typography/card align with primary.
 *
 * LENS CHROME
 * - Flat “coin” rim: two 1px box-shadow rings only (no large soft drop shadow).
 *
 * INTEGRATION SNIPPET (adjust paths after you copy files into your tree)
 */
import './grid.css';
import { MagnifierPlayground } from './_components/magnifier-playground';

export default function MagModePage() {
  return <MagnifierPlayground />;
}

/*
 * RELATED (not mag mode)
 * - Full editor with panels: GridPlayground + /nodegrid/[slug]
 * - Background-only grid: NodeGridIsolated
 */
`;
