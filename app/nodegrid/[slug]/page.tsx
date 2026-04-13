import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  ALL_NODE_GRID_SLUGS,
  DEFAULT_GRID_CELL_SIZE,
  DEFAULT_STROKE_SCALE,
  GRID_CELL_SIZE_MAX,
  GRID_CELL_SIZE_MIN,
  NODEGRID_GITHUB_BASE,
  STROKE_SCALE_MAX,
  STROKE_SCALE_MIN,
  gridTypeLabel,
  slugToGridType,
} from '../grid-types';
import { GridPlayground } from '../_components/grid-playground';

export const generateStaticParams = () => ALL_NODE_GRID_SLUGS.map((slug) => ({ slug }));

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const firstParam = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

const parseTheme = (raw: string | undefined): 'dark' | 'light' =>
  raw === 'light' ? 'light' : 'dark';

const parseAccent = (raw: string | undefined, fallback: string): string => {
  if (!raw) return fallback;
  const decoded = decodeURIComponent(raw.trim());
  const m = decoded.match(/^#?([0-9a-fA-F]{6})$/);
  return m ? `#${m[1].toLowerCase()}` : fallback;
};

const parseClampedNumber = (
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number => {
  const n = raw != null ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

export const generateMetadata = async ({ params }: PageProps): Promise<Metadata> => {
  const { slug } = await params;
  const gridType = slugToGridType(slug);
  if (!gridType) {
    return { title: 'Node Grid' };
  }
  const label = gridTypeLabel(gridType);
  return {
    title: `Node Grid — ${label}`,
    description: `Interactive "${label}" node editor (panels, connections, sounds). Source: ${NODEGRID_GITHUB_BASE}. Optional query: theme, accent, cell, stroke.`,
    robots: { index: true, follow: true },
    openGraph: {
      title: `Node Grid — ${label}`,
      description: `Interactive ${label} preset from robot-components.`,
    },
  };
};

export default async function NodeGridSlugPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  const gridType = slugToGridType(slug);
  if (!gridType) {
    notFound();
  }

  const theme = parseTheme(firstParam(sp.theme));
  const accent = parseAccent(firstParam(sp.accent), '#2563eb');
  const cell = parseClampedNumber(
    firstParam(sp.cell),
    DEFAULT_GRID_CELL_SIZE,
    GRID_CELL_SIZE_MIN,
    GRID_CELL_SIZE_MAX,
  );
  const stroke = parseClampedNumber(
    firstParam(sp.stroke),
    DEFAULT_STROKE_SCALE,
    STROKE_SCALE_MIN,
    STROKE_SCALE_MAX,
  );

  return (
    <GridPlayground
      initialGridType={gridType}
      initialTheme={theme}
      initialAccentHex={accent}
      initialGridCellSize={cell}
      initialStrokeScale={stroke}
    />
  );
}
