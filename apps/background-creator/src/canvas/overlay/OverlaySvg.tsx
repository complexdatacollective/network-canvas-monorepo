import type { ReactElement } from 'react';

import type { BackgroundDocument, Vec, Zone } from '~/model/types';
import type { Bounds } from '~/state/documentGeometry';
import type { Draft } from '~/state/editorStore';

// Explicit stroke-only paint props (never `points`, which would collide with the
// Vec[] geometry props below when spread onto an SVG element).
type StrokePaint = {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  strokeOpacity?: number;
  vectorEffect?: 'non-scaling-stroke';
};

// Editor-only chrome painted over the byte-faithful background <img>. It carries
// no pointer events (the parent sets pointer-events-none); interaction lives on
// the stage and the HTML handle/pill layers.

// Raw design tokens (not the @theme-inline `--color-*` names, which don't exist
// as runtime custom properties) so the values resolve inside inline SVG paint.
const ZONE_HUES = [
  '--cat-1',
  '--cat-2',
  '--cat-3',
  '--cat-4',
  '--cat-5',
  '--cat-6',
  '--cat-7',
  '--cat-8',
  '--cat-9',
  '--cat-10',
] as const;

const pc = (n: number): string => `${n * 100}%`;

function ZoneOutline({ zone, hue }: { zone: Zone; hue: string }): ReactElement {
  const stroke = `var(${hue})`;
  const common = {
    fill: 'none',
    stroke,
    strokeWidth: 1.5,
    strokeDasharray: '6 5',
    strokeOpacity: 0.75,
    vectorEffect: 'non-scaling-stroke' as const,
  };
  if (zone.shape === 'rect') {
    return (
      <rect
        x={pc(zone.x)}
        y={pc(zone.y)}
        width={pc(zone.width)}
        height={pc(zone.height)}
        {...common}
      />
    );
  }
  if (zone.shape === 'circle') {
    // A normalized circle is an on-screen ellipse when the canvas is not square.
    return (
      <ellipse
        cx={pc(zone.cx)}
        cy={pc(zone.cy)}
        rx={pc(zone.r)}
        ry={pc(zone.r)}
        {...common}
      />
    );
  }
  return <PolygonOutline points={zone.points} closed {...common} />;
}

function PolygonOutline({
  points,
  closed,
  ...paint
}: {
  points: Vec[];
  closed: boolean;
} & StrokePaint): ReactElement {
  // Percentages are invalid inside a <polygon points> attribute, so each edge is
  // an individual <line> whose x1/y1/x2/y2 accept percentages.
  const segments: ReactElement[] = [];
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (!a || !b) continue;
    segments.push(
      <line
        key={i}
        x1={pc(a.x)}
        y1={pc(a.y)}
        x2={pc(b.x)}
        y2={pc(b.y)}
        {...paint}
      />,
    );
  }
  return <>{segments}</>;
}

function SelectionOutline({ bounds }: { bounds: Bounds }): ReactElement {
  const x = pc(bounds.minX);
  const y = pc(bounds.minY);
  const width = pc(bounds.maxX - bounds.minX);
  const height = pc(bounds.maxY - bounds.minY);
  // Two-tone (dark under, light over) so the outline stays visible on any
  // artwork colour and on every preview surface.
  return (
    <>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="none"
        stroke="var(--overlay)"
        strokeWidth={3}
        vectorEffect="non-scaling-stroke"
      />
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="none"
        stroke="white"
        strokeWidth={1.5}
        strokeDasharray="5 4"
        vectorEffect="non-scaling-stroke"
      />
    </>
  );
}

function DraftShape({ draft }: { draft: Draft }): ReactElement | null {
  const stroke = 'var(--selected)';
  const paint = {
    fill: 'none',
    stroke,
    strokeWidth: 2,
    strokeDasharray: '6 4',
    vectorEffect: 'non-scaling-stroke' as const,
  };

  if (draft.mode === 'drag') {
    const { start, current, tool } = draft;
    if (tool === 'line') {
      return (
        <line
          x1={pc(start.x)}
          y1={pc(start.y)}
          x2={pc(current.x)}
          y2={pc(current.y)}
          {...paint}
        />
      );
    }
    if (tool === 'zone-circle') {
      const r = Math.hypot(current.x - start.x, current.y - start.y);
      return (
        <ellipse
          cx={pc(start.x)}
          cy={pc(start.y)}
          rx={pc(r)}
          ry={pc(r)}
          {...paint}
        />
      );
    }
    const x = pc(Math.min(start.x, current.x));
    const y = pc(Math.min(start.y, current.y));
    const width = pc(Math.abs(current.x - start.x));
    const height = pc(Math.abs(current.y - start.y));
    if (tool === 'ellipse') {
      const cx = pc((start.x + current.x) / 2);
      const cy = pc((start.y + current.y) / 2);
      const rx = pc(Math.abs(current.x - start.x) / 2);
      const ry = pc(Math.abs(current.y - start.y) / 2);
      return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} {...paint} />;
    }
    return <rect x={x} y={y} width={width} height={height} {...paint} />;
  }

  const { points, current } = draft;
  const preview = [...points, current];
  return (
    <>
      <PolygonOutline points={preview} closed={false} {...paint} />
      {points.map((p, i) => (
        <circle key={i} cx={pc(p.x)} cy={pc(p.y)} r={3.5} fill={stroke} />
      ))}
    </>
  );
}

type OverlaySvgProps = {
  doc: BackgroundDocument;
  selectionBounds: Bounds | null;
  draft: Draft | null;
  zonesVisible: boolean;
};

export function OverlaySvg({
  doc,
  selectionBounds,
  draft,
  zonesVisible,
}: OverlaySvgProps): ReactElement {
  return (
    <svg
      className="pointer-events-none absolute inset-0 size-full"
      width="100%"
      height="100%"
      aria-hidden="true"
    >
      {zonesVisible &&
        doc.zones.map((zone, index) => {
          const hue = ZONE_HUES[index % ZONE_HUES.length] ?? ZONE_HUES[0];
          return <ZoneOutline key={zone.id} zone={zone} hue={hue} />;
        })}
      {selectionBounds && <SelectionOutline bounds={selectionBounds} />}
      {draft && <DraftShape draft={draft} />}
    </svg>
  );
}
