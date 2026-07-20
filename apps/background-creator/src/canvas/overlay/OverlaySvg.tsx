import { useId, type ReactElement } from 'react';

import { zonesOf } from '~/geometry/zones';
import type { BackgroundDocument, Vec, ZoneElement } from '~/model/types';
import type { Bounds } from '~/state/documentGeometry';
import type { Draft } from '~/state/editorStore';
import type { SnapGuides } from '~/state/snapping';

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

// One diagonal-hatch tile per zone hue, referenced by the zone fills below.
// userSpaceOnUse keeps the tile a fixed 8px regardless of the shapes'
// percentage geometry; the low-opacity line reads over light and dark artwork.
// Alternating hues counter-rotate (45°/135°) so overlapping zones — nested
// concentric rings especially — cross-hatch instead of stacking coincident
// lines into one illegible blend.
function ZoneHatchDefs({
  prefix,
  hues,
}: {
  prefix: string;
  hues: readonly string[];
}): ReactElement {
  return (
    <defs>
      {hues.map((hue, index) => (
        <pattern
          key={hue}
          id={`${prefix}${hue}`}
          patternUnits="userSpaceOnUse"
          width={8}
          height={8}
          patternTransform={`rotate(${index % 2 === 0 ? 45 : 135})`}
        >
          <line
            x1={4}
            y1={0}
            x2={4}
            y2={8}
            stroke={`var(${hue})`}
            strokeWidth={1.5}
            strokeOpacity={0.35}
          />
        </pattern>
      ))}
    </defs>
  );
}

function ZoneOutline({
  zone,
  hue,
  patternPrefix,
}: {
  zone: ZoneElement;
  hue: string;
  patternPrefix: string;
}): ReactElement {
  const fill = `url(#${patternPrefix}${hue})`;
  const outline = {
    stroke: `var(${hue})`,
    strokeWidth: 1,
    strokeOpacity: 0.6,
    vectorEffect: 'non-scaling-stroke' as const,
  };
  if (zone.kind === 'rect') {
    return (
      <rect
        x={pc(zone.x)}
        y={pc(zone.y)}
        width={pc(zone.width)}
        height={pc(zone.height)}
        fill={fill}
        {...outline}
      />
    );
  }
  if (zone.kind === 'ellipse') {
    return (
      <ellipse
        cx={pc(zone.cx)}
        cy={pc(zone.cy)}
        rx={pc(zone.rx)}
        ry={pc(zone.ry)}
        fill={fill}
        {...outline}
      />
    );
  }
  // Percentages are invalid in <polygon points>, so the hatch is a full-stage
  // rect clipped by an objectBoundingBox polygon (the zone's 0..1 fractions map
  // directly), while the boundary stays the percentage-based per-edge lines.
  const clipId = `${patternPrefix}clip-${zone.id}`;
  return (
    <>
      <clipPath id={clipId} clipPathUnits="objectBoundingBox">
        <polygon points={zone.points.map((p) => `${p.x},${p.y}`).join(' ')} />
      </clipPath>
      <rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        fill={fill}
        clipPath={`url(#${clipId})`}
      />
      <PolygonOutline points={zone.points} closed fill="none" {...outline} />
    </>
  );
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

// Alignment guides drawn while a gesture is snapping: a thin dashed line spanning
// the stage at each active snapped axis. Accent-toned to read as active chrome,
// aria-hidden (the SVG already is). Uses the raw `--accent` token, which resolves
// at runtime inside inline SVG (unlike the @theme-inline `--color-*` names).
function SnapGuideLines({
  guides,
}: {
  guides: SnapGuides;
}): ReactElement | null {
  if (guides.x === null && guides.y === null) return null;
  const paint = {
    stroke: 'var(--accent)',
    strokeWidth: 1,
    strokeDasharray: '4 4',
    vectorEffect: 'non-scaling-stroke' as const,
  };
  return (
    <>
      {guides.x !== null && (
        <line
          x1={pc(guides.x)}
          y1="0%"
          x2={pc(guides.x)}
          y2="100%"
          {...paint}
        />
      )}
      {guides.y !== null && (
        <line
          x1="0%"
          y1={pc(guides.y)}
          x2="100%"
          y2={pc(guides.y)}
          {...paint}
        />
      )}
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
  guides: SnapGuides;
};

export function OverlaySvg({
  doc,
  selectionBounds,
  draft,
  zonesVisible,
  guides,
}: OverlaySvgProps): ReactElement {
  // useId output is stripped to its alphanumeric token: the raw value's
  // delimiter characters are awkward inside SVG url(#...) references.
  const patternPrefix = `zone-hatch-${useId().replace(/\W/g, '')}`;
  const zones = zonesVisible ? zonesOf(doc) : [];
  return (
    <svg
      className="pointer-events-none absolute inset-0 size-full"
      width="100%"
      height="100%"
      aria-hidden="true"
    >
      {zones.length > 0 && (
        <ZoneHatchDefs
          prefix={patternPrefix}
          hues={ZONE_HUES.slice(0, zones.length)}
        />
      )}
      {zones.map((zone, index) => {
        const hue = ZONE_HUES[index % ZONE_HUES.length] ?? ZONE_HUES[0];
        return (
          <ZoneOutline
            key={zone.id}
            zone={zone}
            hue={hue}
            patternPrefix={patternPrefix}
          />
        );
      })}
      {selectionBounds && <SelectionOutline bounds={selectionBounds} />}
      {draft && <DraftShape draft={draft} />}
      <SnapGuideLines guides={guides} />
    </svg>
  );
}
