'use client';

import { get } from 'es-toolkit/compat';
import { useEffect, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';

import { isDirectedEdgeType } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import { resolveNodeShape } from '../selectors/session';
import { getCodebook } from '../store/modules/protocol';
import { nodeBoundaryDistance } from './nodeBoundary';
import type { CanvasStoreApi } from './useCanvasStore';

const SVG_NS = 'http://www.w3.org/2000/svg';

// An arrowhead's length and half its width, in pixels. Between two close
// nodes a head shrinks to fit the gap, down to the shortest that still reads
// as an arrowhead; below that the line shows no arrowheads at all.
const ARROW_LENGTH = 16;
const ARROW_HALF_WIDTH = 8;
const MIN_ARROW_LENGTH = 8;

type EdgeLayerProps = {
  edges: NcEdge[];
  /**
   * The nodes on the canvas, from which each arrowhead learns the shape of
   * the node it points to. A node not listed is treated as a circle.
   */
  nodes?: readonly NcNode[];
  store: CanvasStoreApi;
  /**
   * When provided, each edge line becomes clickable and calls this with the
   * ids of the edges it draws: one, or both edges of a reciprocal pair.
   */
  onEdgeSelect?: (edgeIds: readonly string[]) => void;
};

/**
 * One drawn line: an undirected edge, or the edges of a directed type between
 * one pair of nodes, with an arrowhead at each node one of them points to.
 */
type Line = {
  from: string;
  to: string;
  type: string;
  ids: string[];
  arrowAtFrom: boolean;
  arrowAtTo: boolean;
};

/**
 * The lines that draw `edges`. Edges of a directed type are grouped by the
 * unordered pair they join, so a reciprocal pair is one line with an
 * arrowhead at each end.
 */
function linesFor(
  edges: readonly NcEdge[],
  isDirected: (type: string) => boolean,
): Line[] {
  const lines: Line[] = [];
  const directedLines = new Map<string, Line>();
  for (const edge of edges) {
    const id = edge[entityPrimaryKeyProperty];
    if (!isDirected(edge.type)) {
      lines.push({
        from: edge.from,
        to: edge.to,
        type: edge.type,
        ids: [id],
        arrowAtFrom: false,
        arrowAtTo: false,
      });
      continue;
    }
    const [first, second] = [edge.from, edge.to].toSorted();
    const key = JSON.stringify([edge.type, first, second]);
    const existing = directedLines.get(key);
    if (existing === undefined) {
      const line: Line = {
        from: edge.from,
        to: edge.to,
        type: edge.type,
        ids: [id],
        arrowAtFrom: false,
        arrowAtTo: true,
      };
      directedLines.set(key, line);
      lines.push(line);
      continue;
    }
    existing.ids.push(id);
    if (edge.to === existing.to) existing.arrowAtTo = true;
    else existing.arrowAtFrom = true;
  }
  return lines;
}

type Point = { x: number; y: number };

const setLine = (element: SVGLineElement, start: Point, end: Point) => {
  element.setAttribute('visibility', 'visible');
  element.setAttribute('x1', String(start.x));
  element.setAttribute('y1', String(start.y));
  element.setAttribute('x2', String(end.x));
  element.setAttribute('y2', String(end.y));
};

export default function EdgeLayer({
  edges,
  nodes,
  store,
  onEdgeSelect,
}: EdgeLayerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const rafRef = useRef<number | null>(null);
  const codebook = useSelector(getCodebook);
  const edgeDefinitions = codebook.edge;
  const nodeDefinitions = codebook.node;

  // One line per node that is not a circle, `<shape> <node id>`: a string, so
  // that a node changing anything but its shape does not rebuild the lines.
  const shapesKey = useMemo(
    () =>
      (nodes ?? [])
        .flatMap((node) => {
          const definition = nodeDefinitions?.[node.type];
          if (definition === undefined) return [];
          const shape = resolveNodeShape(
            definition,
            node[entityAttributesProperty],
            {},
          );
          return typeof shape === 'string' && shape !== 'circle'
            ? [`${shape} ${node[entityPrimaryKeyProperty]}`]
            : [];
        })
        .join('\n'),
    [nodes, nodeDefinitions],
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;

    const clickListeners: Array<() => void> = [];
    const shapes = new Map<string, string>(
      shapesKey
        .split('\n')
        .filter((entry) => entry !== '')
        .map((entry) => {
          const space = entry.indexOf(' ');
          return [entry.slice(space + 1), entry.slice(0, space)];
        }),
    );
    const lines = linesFor(edges, (type) =>
      isDirectedEdgeType({ edge: edgeDefinitions }, type),
    );

    // One visual line per drawn line, plus a transparent wider hit line when
    // onEdgeSelect is provided so narrow 6 px strokes are easy to click, and
    // an arrowhead at each end a directed edge points to.
    const drawn = lines.map((line) => {
      const colorToken = get(
        edgeDefinitions,
        [line.type, 'color'],
        'edge-color-seq-1',
      ) as string;
      // Codebook stores 'edge-color-seq-N', CSS variable is '--edge-N'
      const n = /\d+$/.exec(colorToken)?.[0] ?? '1';
      const [firstId = ''] = line.ids;

      const visual = document.createElementNS(SVG_NS, 'line');
      visual.setAttribute('stroke', `var(--edge-${n})`);
      visual.setAttribute('stroke-width', '6');
      visual.setAttribute('stroke-linecap', 'round');
      visual.setAttribute('vector-effect', 'non-scaling-stroke');
      visual.setAttribute('data-edge-id', firstId);
      if (line.ids.length > 1) {
        visual.setAttribute('data-edge-ids', line.ids.join(' '));
      }

      const select = () => onEdgeSelect?.(line.ids);
      if (onEdgeSelect) {
        visual.style.pointerEvents = 'stroke';
        visual.style.cursor = 'pointer';
        visual.addEventListener('click', select);
        clickListeners.push(() => visual.removeEventListener('click', select));
      }
      svg.appendChild(visual);

      let hit: SVGLineElement | undefined;
      if (onEdgeSelect) {
        // Transparent wider line above the visual to widen the click hit area.
        hit = document.createElementNS(SVG_NS, 'line');
        hit.setAttribute('stroke', 'transparent');
        hit.setAttribute('stroke-width', '20');
        hit.setAttribute('stroke-linecap', 'round');
        hit.setAttribute('vector-effect', 'non-scaling-stroke');
        hit.style.pointerEvents = 'stroke';
        hit.style.cursor = 'pointer';
        const hitLine = hit;
        hitLine.addEventListener('click', select);
        clickListeners.push(() => hitLine.removeEventListener('click', select));
        svg.appendChild(hitLine);
      }

      const arrowhead = (pointsTo: string) => {
        const polygon = document.createElementNS(SVG_NS, 'polygon');
        polygon.setAttribute('fill', `var(--edge-${n})`);
        polygon.setAttribute('data-edge-arrowhead', pointsTo);
        svg.appendChild(polygon);
        return polygon;
      };
      const arrowAtTo = line.arrowAtTo ? arrowhead(line.to) : undefined;
      const arrowAtFrom = line.arrowAtFrom ? arrowhead(line.from) : undefined;

      return { line, visual, hit, arrowAtTo, arrowAtFrom };
    });

    const updatePositions = () => {
      const { positions, canvasDimensions, nodeRadius } = store.getState();
      const width = canvasDimensions?.width ?? 0;
      const height = canvasDimensions?.height ?? 0;
      const measured = width > 0 && height > 0;

      for (const { line, visual, hit, arrowAtTo, arrowAtFrom } of drawn) {
        const from = positions.get(line.from);
        const to = positions.get(line.to);
        const arrows = [arrowAtTo, arrowAtFrom];

        if (!from || !to) {
          for (const element of [visual, hit, ...arrows]) {
            element?.setAttribute('visibility', 'hidden');
          }
          continue;
        }

        // The line in pixels, from which the arrowheads are drawn so that
        // they keep their shape however the canvas is stretched.
        const dx = (to.x - from.x) * width;
        const dy = (to.y - from.y) * height;
        const length = Math.hypot(dx, dy);
        const ux = length > 0 ? dx / length : 0;
        const uy = length > 0 ? dy / length : 0;
        // How far each end's node reaches along the line, by its own shape.
        const reachAtTo = nodeBoundaryDistance(
          shapes.get(line.to),
          nodeRadius,
          -ux,
          -uy,
        );
        const reachAtFrom = nodeBoundaryDistance(
          shapes.get(line.from),
          nodeRadius,
          ux,
          uy,
        );
        const heads = arrows.filter((arrow) => arrow !== undefined).length;
        const headLength =
          heads === 0
            ? 0
            : Math.min(
                ARROW_LENGTH,
                (length - reachAtTo - reachAtFrom) / heads,
              );
        // A line of no length has no direction, so it has no room for a head.
        if (
          heads === 0 ||
          !measured ||
          length === 0 ||
          !(headLength >= MIN_ARROW_LENGTH)
        ) {
          setLine(visual, from, to);
          if (hit) setLine(hit, from, to);
          for (const element of arrows) {
            element?.setAttribute('visibility', 'hidden');
          }
          continue;
        }
        const headHalfWidth = (ARROW_HALF_WIDTH * headLength) / ARROW_LENGTH;

        // A point `along` pixels from `point` towards the other end and
        // `across` pixels to its side, in the canvas's own units.
        const offset = (
          point: Point,
          towards: 1 | -1,
          along: number,
          across = 0,
        ): Point => ({
          x: point.x + (towards * ux * along - uy * across) / width,
          y: point.y + (towards * uy * along + ux * across) / height,
        });
        // The tip touches the node's edge, and the line ends inside the
        // arrowhead so its rounded end does not show past it.
        const drawArrow = (
          polygon: SVGPolygonElement,
          at: Point,
          towards: 1 | -1,
          reach: number,
        ): Point => {
          const tip = offset(at, towards, reach);
          const left = offset(at, towards, reach + headLength, headHalfWidth);
          const right = offset(at, towards, reach + headLength, -headHalfWidth);
          polygon.setAttribute(
            'points',
            [tip, left, right].map(({ x, y }) => `${x},${y}`).join(' '),
          );
          polygon.setAttribute('visibility', 'visible');
          return offset(at, towards, reach + headLength / 2);
        };
        const end = arrowAtTo ? drawArrow(arrowAtTo, to, -1, reachAtTo) : to;
        const start = arrowAtFrom
          ? drawArrow(arrowAtFrom, from, 1, reachAtFrom)
          : from;
        setLine(visual, start, end);
        if (hit) setLine(hit, from, to);
      }
    };

    // Redraw when a position, the canvas size or the node size changes, at
    // most once a frame, so a canvas where nothing moves does no work.
    updatePositions();
    const scheduleRedraw = () => {
      rafRef.current ??= requestAnimationFrame(() => {
        rafRef.current = null;
        updatePositions();
      });
    };
    const unsubscribers = [
      store.subscribe((state) => state.positions, scheduleRedraw),
      store.subscribe((state) => state.canvasDimensions, scheduleRedraw),
      store.subscribe((state) => state.nodeRadius, scheduleRedraw),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      clickListeners.forEach((remove) => remove());
      for (const { visual, hit, arrowAtTo, arrowAtFrom } of drawn) {
        for (const element of [visual, hit, arrowAtTo, arrowAtFrom]) {
          if (element?.parentNode === svg) svg.removeChild(element);
        }
      }
    };
  }, [edges, edgeDefinitions, shapesKey, store, onEdgeSelect]);

  if (edges.length === 0) return null;

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 1 1"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full"
    />
  );
}
