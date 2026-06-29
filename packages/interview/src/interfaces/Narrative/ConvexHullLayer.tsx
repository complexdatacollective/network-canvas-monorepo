import concaveman from 'concaveman';
import { useEffect, useRef } from 'react';

import type {
  VariableOption,
  VariableOptionValue,
} from '@codaco/protocol-validation';
import { entityPrimaryKeyProperty, type NcNode } from '@codaco/shared-consts';
import { getGroupKeys } from '~/canvas/groupMembership';
import type { CanvasStoreApi } from '~/canvas/useCanvasStore';

type ConvexHullLayerProps = {
  store: CanvasStoreApi;
  nodes: NcNode[];
  groupVariable: string;
  categoricalOptions: VariableOption[];
};

type GroupData = {
  nodeIds: string[];
  colorIndex: number;
};

/**
 * Groups nodes by their categorical variable values.
 * A single node can belong to multiple groups if the value is an array,
 * or a single group if the value is a plain string/number/boolean.
 */
/**
 * Color index for a group value. Known codebook options keep their stable,
 * 1-based position. Values that are not in the option set (e.g. from external
 * import) are allocated distinct indices AFTER all known options, so they never
 * collide with `--cat-1`. Out-of-codebook values are sorted so their indices
 * are deterministic regardless of node iteration order.
 */
function buildColorIndexResolver(
  nodes: NcNode[],
  groupVariable: string,
  categoricalOptions: VariableOption[],
): (value: VariableOptionValue) => number {
  const knownValues = new Set(categoricalOptions.map((opt) => opt.value));

  const extraValues = new Set<VariableOptionValue>();
  for (const node of nodes) {
    for (const value of getGroupKeys(node, groupVariable)) {
      if (!knownValues.has(value)) extraValues.add(value);
    }
  }

  const extraIndex = new Map<VariableOptionValue, number>();
  const sortedExtras = [...extraValues].toSorted((a, b) =>
    String(a).localeCompare(String(b)),
  );
  sortedExtras.forEach((value, i) => {
    extraIndex.set(value, categoricalOptions.length + 1 + i);
  });

  return (value) => {
    const optionIndex = categoricalOptions.findIndex(
      (opt) => opt.value === value,
    );
    if (optionIndex >= 0) return optionIndex + 1;
    return extraIndex.get(value) ?? categoricalOptions.length + 1;
  };
}

export function groupNodesByVariable(
  nodes: NcNode[],
  groupVariable: string,
  categoricalOptions: VariableOption[],
): Map<VariableOptionValue, GroupData> {
  const groups = new Map<VariableOptionValue, GroupData>();
  const resolveColorIndex = buildColorIndexResolver(
    nodes,
    groupVariable,
    categoricalOptions,
  );

  for (const node of nodes) {
    for (const value of getGroupKeys(node, groupVariable)) {
      let group = groups.get(value);
      if (!group) {
        group = {
          nodeIds: [],
          colorIndex: resolveColorIndex(value),
        };
        groups.set(value, group);
      }
      group.nodeIds.push(node[entityPrimaryKeyProperty]);
    }
  }

  return groups;
}

export default function ConvexHullLayer({
  store,
  nodes,
  groupVariable,
  categoricalOptions,
}: ConvexHullLayerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const elementsRef = useRef<SVGElement[]>([]);
  const rafRef = useRef<number | null>(null);
  const groupsRef = useRef<Map<VariableOptionValue, GroupData>>(new Map());

  // Update groups when nodes or groupVariable change
  useEffect(() => {
    groupsRef.current = groupNodesByVariable(
      nodes,
      groupVariable,
      categoricalOptions,
    );
  }, [nodes, groupVariable, categoricalOptions]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    // Clean up previous elements
    for (const el of elementsRef.current) {
      if (el.parentNode === svg) svg.removeChild(el);
    }
    elementsRef.current = [];

    const groups = groupNodesByVariable(
      nodes,
      groupVariable,
      categoricalOptions,
    );
    groupsRef.current = groups;

    const svgNS = svg.namespaceURI;
    const elementMap = new Map<VariableOptionValue, SVGElement>();

    for (const [value, group] of groups) {
      // Create a polygon for each group (will be updated to circle/ellipse as needed)
      const el = document.createElementNS(
        svgNS,
        'polygon',
      ) as SVGPolygonElement;
      el.setAttribute('fill', `var(--cat-${group.colorIndex})`);
      el.setAttribute('stroke', `var(--cat-${group.colorIndex})`);
      el.setAttribute('opacity', '0.45');
      el.setAttribute('stroke-width', '140');
      el.setAttribute('vector-effect', 'non-scaling-stroke');
      el.setAttribute('paint-order', 'stroke fill');
      el.setAttribute('stroke-linejoin', 'round');
      el.setAttribute('stroke-linecap', 'round');
      el.setAttribute('visibility', 'hidden');
      svg.appendChild(el);
      elementMap.set(value, el);
      elementsRef.current.push(el);
    }

    const updateHulls = () => {
      const { positions } = store.getState();
      const currentGroups = groupsRef.current;

      for (const [value, group] of currentGroups) {
        const el = elementMap.get(value);
        if (!el) continue;

        const coords: number[][] = [];
        for (const nodeId of group.nodeIds) {
          const pos = positions.get(nodeId);
          if (pos) coords.push([pos.x, pos.y]);
        }

        if (coords.length === 0) {
          el.setAttribute('visibility', 'hidden');
          continue;
        }

        el.setAttribute('visibility', 'visible');

        if (coords.length === 1) {
          // Single node: micro-triangle at node center.
          // The 48px non-scaling stroke radius creates a circle visually.
          const coord = coords[0]!;
          const cx = coord[0] ?? 0;
          const cy = coord[1] ?? 0;
          const r = 0.001;
          const points = [0, 1, 2]
            .map((i) => {
              const angle = (i / 3) * Math.PI * 2;
              return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
            })
            .join(' ');
          el.setAttribute('points', points);
        } else if (coords.length === 2) {
          // Two nodes: just the two center points.
          // Round stroke-linecap/linejoin + 96px stroke creates a capsule.
          const p1 = coords[0]!;
          const p2 = coords[1]!;
          el.setAttribute(
            'points',
            `${p1[0] ?? 0},${p1[1] ?? 0} ${p2[0] ?? 0},${p2[1] ?? 0}`,
          );
        } else {
          // 3+ nodes: raw concaveman hull points.
          // The stroke provides all visual padding.
          const hull = concaveman(coords, 0.6, 0);
          const points = hull.map((p) => `${p[0] ?? 0},${p[1] ?? 0}`).join(' ');
          el.setAttribute('points', points);
        }
      }

      rafRef.current = requestAnimationFrame(updateHulls);
    };

    rafRef.current = requestAnimationFrame(updateHulls);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      for (const el of elementsRef.current) {
        if (el.parentNode === svg) svg.removeChild(el);
      }
    };
  }, [nodes, groupVariable, categoricalOptions, store]);

  if (!groupVariable || nodes.length === 0) return null;

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 1 1"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full overflow-visible"
    />
  );
}
