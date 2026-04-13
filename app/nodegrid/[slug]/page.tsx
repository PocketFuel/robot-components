import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  ALL_NODE_GRID_SLUGS,
  NODEGRID_GITHUB_BASE,
  gridTypeLabel,
  slugToGridType,
} from '../grid-types';
import { NodeGridIsolated } from '../_components/node-grid-isolated';

export const generateStaticParams = () => ALL_NODE_GRID_SLUGS.map((slug) => ({ slug }));

type PageProps = { params: Promise<{ slug: string }> };

export const generateMetadata = async ({ params }: PageProps): Promise<Metadata> => {
  const { slug } = await params;
  const gridType = slugToGridType(slug);
  if (!gridType) {
    return { title: 'Node Grid' };
  }
  const label = gridTypeLabel(gridType);
  return {
    title: `Node Grid — ${label}`,
    description: `Isolated "${label}" animated node-grid background (canvas + optional grain). Implementation: ${NODEGRID_GITHUB_BASE} — copy grid-types.ts, grid.css, _components/*.tsx into your app.`,
    robots: { index: true, follow: true },
    openGraph: {
      title: `Node Grid — ${label}`,
      description: `Isolated ${label} background preset from robot-components.`,
    },
  };
};

export default async function NodeGridSlugPage({ params }: PageProps) {
  const { slug } = await params;
  const gridType = slugToGridType(slug);
  if (!gridType) {
    notFound();
  }

  return <NodeGridIsolated gridType={gridType} />;
}
