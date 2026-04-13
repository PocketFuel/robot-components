/** Base spacing for rectangular snap logic and canvas layout (px) */
export const DEFAULT_GRID_CELL_SIZE = 40;
export const DEFAULT_STROKE_SCALE = 1;
export const GRID_CELL_SIZE_MIN = 16;
export const GRID_CELL_SIZE_MAX = 120;
export const STROKE_SCALE_MIN = 0.25;
export const STROKE_SCALE_MAX = 4;

/** Internal grid algorithm keys used by DotGridCanvas */
export type GridType =
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
  | 'organic'
  | 'automate';

/** Stable URL segment for each grid (kebab-case, matches /nodegrid/[slug]) */
export const GRID_TYPE_TO_SLUG: Record<GridType, string> = {
  rectangular: 'rectangular',
  hexagonal: 'hexagonal',
  isometric: 'isometric',
  web_one: 'web-one',
  quantum_web: 'quantum-web',
  triangular: 'truss',
  mesh: 'mesh',
  flux: 'flux',
  constellation: 'constellation',
  floral: 'floral',
  waves: 'waves',
  spiral: 'spiral',
  organic: 'organic',
  automate: 'automate',
};

const SLUG_TO_GRID_TYPE: Record<string, GridType> = Object.fromEntries(
  (Object.entries(GRID_TYPE_TO_SLUG) as [GridType, string][]).map(([k, v]) => [v, k]),
) as Record<string, GridType>;

export const NODE_GRID_ORDER: GridType[] = [
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
  'automate',
];

export const slugToGridType = (slug: string): GridType | null => SLUG_TO_GRID_TYPE[slug] ?? null;

export const gridTypeToSlug = (type: GridType): string => GRID_TYPE_TO_SLUG[type];

export const gridTypeLabel = (type: GridType): string => {
  if (type === 'web_one') return 'Web One';
  if (type === 'quantum_web') return 'Quantum Web';
  if (type === 'triangular') return 'Truss';
  if (type === 'mesh') return 'Mesh';
  if (type === 'flux') return 'Flux';
  if (type === 'constellation') return 'Constellation';
  if (type === 'floral') return 'Floral';
  if (type === 'waves') return 'Waves';
  if (type === 'spiral') return 'Spiral';
  if (type === 'organic') return 'Organic';
  if (type === 'automate') return 'Automate';
  return type.charAt(0).toUpperCase() + type.slice(1);
};

export const NODEGRID_GITHUB_BASE =
  'https://github.com/dashrobotco/robot-components/tree/main/app/nodegrid';

/** Every URL segment served under /nodegrid/[slug] */
export const ALL_NODE_GRID_SLUGS: string[] = [...new Set(Object.values(GRID_TYPE_TO_SLUG))];
