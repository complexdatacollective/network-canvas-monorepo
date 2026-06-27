import { get } from 'es-toolkit/compat';
import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';

import { entityPrimaryKeyProperty, type NcEdge } from '@codaco/shared-consts';

import { getCodebook } from '../store/modules/protocol';
import type { RootState } from '../store/store';
import type { CanvasStoreApi } from './useCanvasStore';

type EdgeLayerProps = {
  edges: NcEdge[];
  store: CanvasStoreApi;
  /** When provided, each edge line becomes clickable and calls this with the edge id. */
  onEdgeSelect?: (edgeId: string) => void;
};

export default function EdgeLayer({
  edges,
  store,
  onEdgeSelect,
}: EdgeLayerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const rafRef = useRef<number | null>(null);
  const edgeDefinitions = useSelector(
    (state: RootState) => getCodebook(state).edge,
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const svgNS = svg.namespaceURI;
    const clickListeners: Array<() => void> = [];

    // Create one visual line per edge, plus a transparent wider hit line when
    // onEdgeSelect is provided so narrow 6 px strokes are easy to click.
    const visualLines: SVGLineElement[] = [];
    const hitLines: SVGLineElement[] = [];

    edges.forEach((edge) => {
      const edgeId = edge[entityPrimaryKeyProperty];
      const colorToken = get(
        edgeDefinitions,
        [edge.type, 'color'],
        'edge-color-seq-1',
      ) as string;
      // Codebook stores 'edge-color-seq-N', CSS variable is '--edge-N'
      const n = /\d+$/.exec(colorToken)?.[0] ?? '1';

      const visual = document.createElementNS(svgNS, 'line') as SVGLineElement;
      visual.setAttribute('stroke', `var(--edge-${n})`);
      visual.setAttribute('stroke-width', '6');
      visual.setAttribute('stroke-linecap', 'round');
      visual.setAttribute('vector-effect', 'non-scaling-stroke');
      visual.setAttribute('data-edge-id', edgeId);

      if (onEdgeSelect) {
        visual.style.pointerEvents = 'stroke';
        visual.style.cursor = 'pointer';
        const handler = () => onEdgeSelect(edgeId);
        visual.addEventListener('click', handler);
        clickListeners.push(() => visual.removeEventListener('click', handler));
      }

      svg.appendChild(visual);
      visualLines.push(visual);

      if (onEdgeSelect) {
        // Transparent wider line above the visual to widen the click hit area.
        const hit = document.createElementNS(svgNS, 'line') as SVGLineElement;
        hit.setAttribute('stroke', 'transparent');
        hit.setAttribute('stroke-width', '20');
        hit.setAttribute('stroke-linecap', 'round');
        hit.setAttribute('vector-effect', 'non-scaling-stroke');
        hit.style.pointerEvents = 'stroke';
        hit.style.cursor = 'pointer';
        const hitHandler = () => onEdgeSelect(edgeId);
        hit.addEventListener('click', hitHandler);
        clickListeners.push(() => hit.removeEventListener('click', hitHandler));
        svg.appendChild(hit);
        hitLines.push(hit);
      }
    });

    const updatePositions = () => {
      const { positions } = store.getState();

      edges.forEach((edge, i) => {
        const visual = visualLines[i];
        const hit = hitLines[i];
        if (!visual) return;

        const from = positions.get(edge.from);
        const to = positions.get(edge.to);

        if (!from || !to) {
          visual.setAttribute('visibility', 'hidden');
          if (hit) hit.setAttribute('visibility', 'hidden');
          return;
        }

        visual.setAttribute('visibility', 'visible');
        visual.setAttribute('x1', String(from.x));
        visual.setAttribute('y1', String(from.y));
        visual.setAttribute('x2', String(to.x));
        visual.setAttribute('y2', String(to.y));

        if (hit) {
          hit.setAttribute('visibility', 'visible');
          hit.setAttribute('x1', String(from.x));
          hit.setAttribute('y1', String(from.y));
          hit.setAttribute('x2', String(to.x));
          hit.setAttribute('y2', String(to.y));
        }
      });

      rafRef.current = requestAnimationFrame(updatePositions);
    };

    rafRef.current = requestAnimationFrame(updatePositions);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      clickListeners.forEach((remove) => remove());
      visualLines.forEach((el) => {
        if (el.parentNode === svg) svg.removeChild(el);
      });
      hitLines.forEach((el) => {
        if (el.parentNode === svg) svg.removeChild(el);
      });
    };
  }, [edges, edgeDefinitions, store, onEdgeSelect]);

  if (edges.length === 0) return null;

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 1 1"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
      className={`absolute inset-0 size-full ${onEdgeSelect ? '' : 'pointer-events-none'}`}
    />
  );
}
