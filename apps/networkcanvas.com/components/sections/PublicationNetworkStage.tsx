'use client';

import {
  type MotionValue,
  motion,
  useMotionValueEvent,
  useSpring,
  useTransform,
} from 'motion/react';
import {
  type CSSProperties,
  memo,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { cn } from '~/lib/cn';
import type { Publication } from '~/lib/siteContent';

import {
  columnMask,
  safeArea,
  type StageView,
} from './publicationNetworkFraming';
import {
  AUTHOR_RADIUS,
  type AuthorNode,
  type AuthorshipGraph,
  type Box,
  type Hub,
  layoutLabels,
} from './publicationNetworkLayout';

// The publications network, drawn as an SVG stage behind the section's
// cards: a page per publication, a dot per author, an edge for each
// authorship. A camera follows the card being read; publications that share
// an author with it can be pointed at and opened.

export type StageKind = 'intro' | 'card' | 'finale';
type Emphasis = 'active' | 'partner' | 'intro' | 'finale' | 'dim';
type Size = { width: number; height: number };
type Rect = Size & { x: number; y: number };

// Never frame a publication so tightly that its neighbours drop out of view.
const MIN_FRAME = 250;
// On-screen size, in CSS pixels, of the author names drawn in the SVG.
const LABEL_PX = 13;
const cameraSpring = { stiffness: 70, damping: 19, mass: 1 };

export const hubColor = (index: number) => `var(--node-${(index % 8) + 1})`;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeOutCubic = (value: number) => 1 - (1 - value) ** 3;

// Dimming mixes a colour toward the ground the network is drawn on instead of
// making it translucent, so a dimmed node still hides the edges that end
// behind it.
function mute(color: string, amount: number) {
  return amount >= 1
    ? color
    : `color-mix(in oklab, ${color} ${Math.round(amount * 100)}%, var(--network-ground))`;
}

const hubStrength: Record<Emphasis, number> = {
  active: 1,
  partner: 0.85,
  intro: 0.9,
  finale: 1,
  dim: 0.22,
};

function edgeStyle(emphasis: Emphasis, color: string): CSSProperties {
  const styles: Record<Emphasis, CSSProperties> = {
    active: { stroke: color, strokeOpacity: 0.9, strokeWidth: 2.25 },
    partner: { stroke: color, strokeOpacity: 0.55, strokeWidth: 1.6 },
    intro: { stroke: 'var(--text)', strokeOpacity: 0.18, strokeWidth: 1.35 },
    finale: { stroke: color, strokeOpacity: 0.55, strokeWidth: 1.35 },
    dim: { stroke: 'var(--text)', strokeOpacity: 0.09, strokeWidth: 1.25 },
  };
  return styles[emphasis];
}

function authorFill(emphasis: Emphasis, color: string) {
  const fills: Record<Emphasis, string> = {
    active: color,
    partner: mute(color, 0.7),
    intro: mute('var(--text)', 0.4),
    finale: mute(color, 0.85),
    dim: mute('var(--text)', 0.12),
  };
  return fills[emphasis];
}

function hubEmphasis(hub: Hub, kind: StageKind, active?: Hub): Emphasis {
  if (kind === 'intro') return 'intro';
  if (kind === 'finale' || !active) return 'finale';
  if (hub.index === active.index) return 'active';
  if (active.partners.includes(hub.index)) return 'partner';
  return 'dim';
}

// A page with its top corner folded over: reads as a document, not a person.
function pagePath(x: number, y: number, radius: number) {
  const width = radius * 1.5;
  const height = radius * 1.95;
  const fold = width * 0.34;
  const left = x - width / 2;
  const top = y - height / 2;
  return {
    page: `M${left} ${top}H${left + width - fold}L${left + width} ${top + fold}V${top + height}H${left}Z`,
    fold: `M${left + width - fold} ${top}V${top + fold}H${left + width}Z`,
  };
}

/** The publication glyph, for use in a 12×14 viewBox. */
export function PageGlyph() {
  const { page, fold } = pagePath(6, 7, 6.6);
  return (
    <>
      <path d={page} strokeLinejoin="round" />
      <path d={fold} className="fill-white/45" />
    </>
  );
}

function boxString(box: Box) {
  return `${box.x} ${box.y} ${box.width} ${box.height}`;
}

function withContext(box: Box): Box {
  const width = Math.max(MIN_FRAME, box.width + 30);
  const height = Math.max(MIN_FRAME, box.height + 30);
  return {
    x: box.x - (width - box.width) / 2,
    y: box.y - (height - box.height) / 2,
    width,
    height,
  };
}

/**
 * The viewBox that shows `box` as large as it fits inside `safe` (a region
 * of the stage, in pixels), with the rest of the stage showing whatever lies
 * around it — so the network runs on under the text column and off the edges.
 */
function cameraFor(box: Box, view: Size, safe: Rect): Box {
  const scale = Math.min(safe.width / box.width, safe.height / box.height);
  return {
    x: box.x + box.width / 2 - (safe.x + safe.width / 2) / scale,
    y: box.y + box.height / 2 - (safe.y + safe.height / 2) / scale,
    width: view.width / scale,
    height: view.height / scale,
  };
}

type Shown = { index: number; pinned: boolean };

export function PublicationNetworkStage({
  graph,
  publications,
  kind,
  active,
  bloom,
  motionEnabled,
  columnRef,
  focusedRelated,
  legend,
}: {
  graph: AuthorshipGraph;
  publications: readonly Publication[];
  kind: StageKind;
  active: Hub | undefined;
  bloom: MotionValue<number>;
  motionEnabled: boolean;
  columnRef: RefObject<HTMLDivElement | null>;
  // A related publication whose link in the card has keyboard focus.
  focusedRelated: number | null;
  legend: { publication: string; author: string };
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const overlayRef = useRef<HTMLAnchorElement>(null);
  const [view, setView] = useState<StageView | null>(null);
  const focus = active && motionEnabled ? graph.focus[active.index] : null;
  const target = useMemo(
    () => (focus ? withContext(focus) : graph.overview),
    [focus, graph.overview],
  );
  const safe = view ? safeArea(view, !focus && kind === 'intro') : null;
  const frame = view && safe ? cameraFor(target, view, safe) : graph.overview;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const column = columnRef.current;
    const measure = () => {
      const box = svg.getBoundingClientRect();
      const columnBox = column ? column.getBoundingClientRect() : null;
      const columnLeft = columnBox ? columnBox.left - box.left : 0;
      const columnRight = columnBox ? columnBox.right - box.left : 0;
      setView((current) =>
        current &&
        current.width === box.width &&
        current.height === box.height &&
        current.columnLeft === columnLeft &&
        current.columnRight === columnRight
          ? current
          : { width: box.width, height: box.height, columnLeft, columnRight },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    if (column) observer.observe(column);
    return () => observer.disconnect();
  }, [columnRef]);

  const x = useSpring(frame.x, cameraSpring);
  const y = useSpring(frame.y, cameraSpring);
  const width = useSpring(frame.width, cameraSpring);
  const height = useSpring(frame.height, cameraSpring);
  // The first measured frame is cut to, not flown to.
  const settledRef = useRef(false);

  useEffect(() => {
    if (!view) return;
    if (motionEnabled && settledRef.current) {
      x.set(frame.x);
      y.set(frame.y);
      width.set(frame.width);
      height.set(frame.height);
    } else {
      x.jump(frame.x);
      y.jump(frame.y);
      width.jump(frame.width);
      height.jump(frame.height);
    }
    settledRef.current = true;
  }, [
    view,
    frame.x,
    frame.y,
    frame.width,
    frame.height,
    motionEnabled,
    x,
    y,
    width,
    height,
  ]);

  // Publications that share an author with the one being read can be
  // pointed at (their title shows) and opened.
  const related = useMemo(() => new Set(active?.partners ?? []), [active]);
  const [pointed, setPointedState] = useState<Shown | null>(null);
  // Mirrored for event handlers, which must decide before React re-renders.
  const pointedRef = useRef<Shown | null>(null);
  const setPointed = useCallback((next: Shown | null) => {
    pointedRef.current = next;
    setPointedState(next);
  }, []);
  // Only a publication related to the current card can show its title, so a
  // new card puts away whatever was shown for the last one.
  const shown: Shown | null =
    focusedRelated !== null && related.has(focusedRelated)
      ? { index: focusedRelated, pinned: false }
      : pointed && related.has(pointed.index)
        ? pointed
        : null;
  const shownHub = shown ? graph.hubs[shown.index] : undefined;
  const shownPublication = shown ? publications[shown.index] : undefined;

  // Keeps the title beside its publication while the camera moves.
  const placeOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    const svg = svgRef.current;
    const container = containerRef.current;
    if (!overlay || !svg || !container || !shownHub) return;
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const box = container.getBoundingClientRect();
    const top = new DOMPoint(
      shownHub.x,
      shownHub.y - shownHub.radius * 1.2,
    ).matrixTransform(matrix);
    const bottom = new DOMPoint(
      shownHub.x,
      shownHub.y + shownHub.radius * 1.2,
    ).matrixTransform(matrix);
    const half = overlay.offsetWidth / 2;
    const left = Math.min(
      Math.max(top.x - box.left, half + 8),
      box.width - half - 8,
    );
    const below = top.y - box.top < overlay.offsetHeight + 16;
    overlay.style.transform = below
      ? `translate(${left - half}px, ${bottom.y - box.top + 10}px)`
      : `translate(${left - half}px, ${top.y - box.top - overlay.offsetHeight - 10}px)`;
  }, [shownHub]);
  useLayoutEffect(placeOverlay, [placeOverlay, shownPublication]);

  const viewBox = useTransform(
    () => `${x.get()} ${y.get()} ${width.get()} ${height.get()}`,
  );
  useMotionValueEvent(viewBox, 'change', (value) => {
    svgRef.current?.setAttribute('viewBox', value);
    placeOverlay();
  });

  // A touch shows the title first; a second tap on the publication, or a
  // tap on its title, opens it. A tap anywhere else puts the title away.
  const pointerTypeRef = useRef('mouse');
  const pinned = shown?.pinned ?? false;
  useEffect(() => {
    if (!pinned) return undefined;
    const dismiss = (event: globalThis.PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('[data-related-publication]')
      ) {
        return;
      }
      setPointed(null);
    };
    document.addEventListener('pointerdown', dismiss, true);
    return () => document.removeEventListener('pointerdown', dismiss, true);
  }, [pinned, setPointed]);

  const onRelatedPointer = useCallback(
    (index: number, event: PointerEvent) => {
      pointerTypeRef.current = event.pointerType;
      if (event.type === 'pointerdown') return;
      if (event.pointerType !== 'mouse' || pointedRef.current?.pinned) return;
      setPointed(
        event.type === 'pointerleave' ? null : { index, pinned: false },
      );
    },
    [setPointed],
  );
  const onRelatedClick = useCallback(
    (index: number, event: MouseEvent) => {
      if (pointerTypeRef.current === 'mouse') return;
      const current = pointedRef.current;
      if (current?.index === index && current.pinned) return;
      event.preventDefault();
      setPointed({ index, pinned: true });
    },
    [setPointed],
  );

  // SVG user units per CSS pixel in the frame being read, so author names
  // keep one on-screen size whichever publication the camera frames.
  const unit = safe
    ? 1 / Math.min(safe.width / target.width, safe.height / target.height)
    : 0.33;

  // Under the text column the network recedes, so the cards stay easy to
  // read; top and bottom fade where the stage meets the page.
  const mask = view
    ? {
        maskImage: `${columnMask(view)}, linear-gradient(to bottom, transparent, black 9%, black 91%, transparent)`,
        maskComposite: 'intersect',
      }
    : undefined;

  return (
    <div ref={containerRef} className="relative size-full overflow-hidden">
      <svg
        ref={svgRef}
        data-network
        viewBox={boxString(graph.overview)}
        preserveAspectRatio="xMidYMid meet"
        className="size-full"
        style={mask}
      >
        <SociogramRings
          graph={graph}
          bloom={bloom}
          motionEnabled={motionEnabled}
        />
        {graph.bridges.map((bridge) => (
          <BridgeGroup
            key={bridge.key}
            graph={graph}
            bridge={bridge}
            kind={kind}
            focus={
              active && bridge.hubs.includes(active.index)
                ? active.index
                : undefined
            }
            bloom={bloom}
            motionEnabled={motionEnabled}
          />
        ))}
        {graph.hubs.map((hub) => (
          <Cluster
            key={hub.index}
            graph={graph}
            hub={hub}
            emphasis={hubEmphasis(hub, kind, active)}
            bloom={bloom}
            motionEnabled={motionEnabled}
            link={related.has(hub.index) ? publications[hub.index] : undefined}
            shown={shown?.index === hub.index}
            onPointer={onRelatedPointer}
            onLinkClick={onRelatedClick}
          />
        ))}
        {active && motionEnabled ? (
          <ActiveLabels
            key={active.index}
            graph={graph}
            hub={active}
            unit={unit}
          />
        ) : null}
      </svg>
      {shownPublication ? (
        <a
          ref={overlayRef}
          href={shownPublication.href}
          target="_blank"
          rel="noreferrer"
          tabIndex={-1}
          data-related-publication
          className={cn(
            // oxlint-disable-next-line tailwindcss/enforce-logical -- `placeOverlay` moves it with a transform measured from the left edge
            'bg-surface text-text elevation-medium absolute top-0 left-0 z-10 block w-max max-w-72 rounded px-4 py-3 text-sm leading-snug font-semibold',
            shown?.pinned ? 'pointer-events-auto' : 'pointer-events-none',
          )}
        >
          {shownPublication.title}
        </a>
      ) : null}
      <Legend {...legend} />
    </div>
  );
}

function useBloom(
  bloom: MotionValue<number>,
  order: number,
  count: number,
  delay = 0,
) {
  const start = (order / count) * 0.6 + delay;
  return useTransform(bloom, (p) => easeOutCubic(clamp01((p - start) / 0.38)));
}

function SociogramRings({
  graph,
  bloom,
  motionEnabled,
}: {
  graph: AuthorshipGraph;
  bloom: MotionValue<number>;
  motionEnabled: boolean;
}) {
  const scale = useTransform(
    bloom,
    (p) => 0.6 + 0.4 * easeOutCubic(clamp01(p / 0.7)),
  );
  const opacity = useTransform(bloom, (p) => clamp01(p / 0.5));
  const rings = [0.28, 0.52, 0.76, 1].map((k) => graph.extent * k + 20);
  return (
    <motion.g
      style={
        motionEnabled
          ? { scale, opacity, originX: '0px', originY: '0px' }
          : undefined
      }
    >
      {rings.map((r) => (
        <circle
          key={r}
          cx={0}
          cy={0}
          r={r}
          fill="none"
          className="stroke-text/8"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </motion.g>
  );
}

// Memoised so a change of card only re-renders the clusters whose emphasis
// changes, not all of them.
const Cluster = memo(function Cluster({
  graph,
  hub,
  emphasis,
  bloom,
  motionEnabled,
  link,
  shown,
  onPointer,
  onLinkClick,
}: {
  graph: AuthorshipGraph;
  hub: Hub;
  emphasis: Emphasis;
  bloom: MotionValue<number>;
  motionEnabled: boolean;
  // Set while this publication shares an author with the one being read.
  link: Publication | undefined;
  shown: boolean;
  onPointer: (index: number, event: PointerEvent) => void;
  onLinkClick: (index: number, event: MouseEvent) => void;
}) {
  const progress = useBloom(bloom, hub.order, graph.hubs.length);
  const scale = useTransform(progress, (v) => 0.2 + 0.8 * v);
  const rotate = useTransform(progress, (v) => (1 - v) * -80);
  const color = hubColor(hub.index);
  const own = hub.authorKeys
    .map((key) => graph.authors.get(key))
    .filter(
      (author): author is AuthorNode =>
        author !== undefined && author.hubs.length === 1,
    );
  const { page, fold } = pagePath(hub.x, hub.y, hub.radius);
  const halo = pagePath(hub.x, hub.y, hub.radius + 3.2);
  const fill = mute(color, hubStrength[emphasis]);

  const pageShape = (
    <>
      <path
        d={page}
        data-node="publication"
        stroke={fill}
        strokeWidth={hub.radius * 0.22}
        strokeLinejoin="round"
        className="transition-[fill,stroke] duration-500"
        style={{ fill }}
      />
      <path d={fold} className="fill-white/50" />
    </>
  );

  return (
    <motion.g
      style={motionEnabled ? { opacity: progress, scale, rotate } : undefined}
    >
      {/* Keeps the group's box centred on the publication, so it turns about it. */}
      <circle
        cx={hub.x}
        cy={hub.y}
        r={hub.ring + AUTHOR_RADIUS}
        fill="none"
        stroke="none"
      />
      {own.map((author) => (
        <line
          key={author.key}
          data-edge
          x1={hub.x}
          y1={hub.y}
          x2={author.x}
          y2={author.y}
          vectorEffect="non-scaling-stroke"
          className="transition-[stroke,stroke-opacity,stroke-width] duration-500"
          style={edgeStyle(emphasis, color)}
        />
      ))}
      {own.map((author) => (
        <circle
          key={author.key}
          cx={author.x}
          cy={author.y}
          r={AUTHOR_RADIUS}
          data-node="author"
          className="transition-[fill] duration-500"
          style={{ fill: authorFill(emphasis, color) }}
        />
      ))}
      {emphasis === 'active' || (emphasis === 'finale' && motionEnabled) ? (
        <motion.path
          key={`pulse-${emphasis}`}
          d={page}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          initial={{ scale: 1, opacity: 0 }}
          animate={{ scale: [1, 2.6], opacity: [0.85, 0] }}
          transition={{
            duration: 1.4,
            ease: [0.22, 1, 0.36, 1],
            delay: emphasis === 'finale' ? 0.25 + hub.order * 0.022 : 0,
          }}
        />
      ) : null}
      {link ? (
        <a
          href={link.href}
          target="_blank"
          rel="noreferrer"
          tabIndex={-1}
          data-related-publication
          className="cursor-pointer"
          onPointerDown={(event) => onPointer(hub.index, event)}
          onPointerEnter={(event) => onPointer(hub.index, event)}
          onPointerLeave={(event) => onPointer(hub.index, event)}
          onClick={(event) => onLinkClick(hub.index, event)}
        >
          {/* A generous target around a small page. */}
          <circle
            cx={hub.x}
            cy={hub.y}
            r={Math.max(hub.radius * 1.8, 9)}
            fill="transparent"
          />
          {pageShape}
        </a>
      ) : (
        pageShape
      )}
      <path
        d={halo.page}
        fill="none"
        strokeWidth={2}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className={cn(
          'pointer-events-none',
          // Pointing or keyboard focus shows at once; the reading halo eases.
          !shown && 'transition-[stroke-opacity] duration-500',
        )}
        style={{
          stroke: shown ? 'var(--text)' : color,
          strokeOpacity: shown ? 0.9 : emphasis === 'active' ? 0.55 : 0,
        }}
      />
    </motion.g>
  );
});

const BridgeGroup = memo(function BridgeGroup({
  graph,
  bridge,
  kind,
  focus,
  bloom,
  motionEnabled,
}: {
  graph: AuthorshipGraph;
  bridge: AuthorshipGraph['bridges'][number];
  kind: StageKind;
  // The publication being read, when it is one of this group's.
  focus: number | undefined;
  bloom: MotionValue<number>;
  motionEnabled: boolean;
}) {
  const hubs = bridge.hubs
    .map((index) => graph.hubs[index])
    .filter((hub): hub is Hub => Boolean(hub));
  const lastOrder = Math.max(...hubs.map((hub) => hub.order));
  const progress = useBloom(bloom, lastOrder, graph.hubs.length, 0.06);
  const scale = useTransform(progress, (v) => 0.05 + 0.95 * v);
  const authors = bridge.authorKeys
    .map((key) => graph.authors.get(key))
    .filter((author) => author !== undefined);
  const involved = focus !== undefined;
  // Authors take the colour of their newest publication when nothing is
  // being read — the same rule as every other author.
  const newest = Math.min(...bridge.hubs);
  const authorEmphasis: Emphasis =
    kind === 'card' ? (involved ? 'active' : 'dim') : kind;
  const authorColor = hubColor(focus ?? newest);

  return (
    <motion.g style={motionEnabled ? { opacity: progress, scale } : undefined}>
      {hubs.map((hub) => {
        const emphasis: Emphasis =
          kind !== 'card'
            ? kind
            : hub.index === focus
              ? 'active'
              : involved
                ? 'partner'
                : 'dim';
        return authors.map((author) => (
          <line
            key={`${hub.index}-${author.key}`}
            data-edge
            x1={hub.x}
            y1={hub.y}
            x2={author.x}
            y2={author.y}
            vectorEffect="non-scaling-stroke"
            className="transition-[stroke,stroke-opacity,stroke-width] duration-500"
            style={edgeStyle(emphasis, hubColor(hub.index))}
          />
        ));
      })}
      {authors.map((author) => (
        <circle
          key={author.key}
          cx={author.x}
          cy={author.y}
          r={AUTHOR_RADIUS}
          data-node="author"
          className="transition-[fill] duration-500"
          style={{ fill: authorFill(authorEmphasis, authorColor) }}
        />
      ))}
    </motion.g>
  );
});

function ActiveLabels({
  graph,
  hub,
  unit,
}: {
  graph: AuthorshipGraph;
  hub: Hub;
  // SVG user units per CSS pixel in the frame the labels are read in.
  unit: number;
}) {
  const fontSize = LABEL_PX * unit;
  const labels = useMemo(
    () => layoutLabels(graph, hub, fontSize, 7 * unit),
    [graph, hub, fontSize, unit],
  );
  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.45, ease: 'easeOut' }}
      className="font-body pointer-events-none"
    >
      {labels.map(({ key, name, x, y, angle, leader }) => {
        const flip = Math.cos(angle) < 0;
        const degrees = (angle * 180) / Math.PI + (flip ? 180 : 0);
        return (
          <g key={key}>
            {leader && (
              <line
                {...leader}
                vectorEffect="non-scaling-stroke"
                className="stroke-text/35"
                strokeWidth={1}
              />
            )}
            <text
              data-label
              x={x}
              y={y}
              fontSize={fontSize}
              dominantBaseline="central"
              textAnchor={flip ? 'end' : 'start'}
              transform={`rotate(${degrees.toFixed(1)} ${x} ${y})`}
              className="fill-text font-semibold"
              style={{
                paintOrder: 'stroke',
                stroke: 'var(--network-ground)',
                strokeWidth: fontSize * 0.45,
                strokeLinejoin: 'round',
              }}
            >
              {name}
            </text>
          </g>
        );
      })}
    </motion.g>
  );
}

function Legend({
  publication,
  author,
}: {
  publication: string;
  author: string;
}) {
  return (
    <ul className="text-text/70 tablet-landscape:flex pointer-events-none absolute inset-e-12 bottom-9 hidden gap-x-5 text-xs">
      <li className="flex items-center gap-2">
        <svg aria-hidden viewBox="0 0 12 14" className="fill-node-1 h-3.5 w-3">
          <PageGlyph />
        </svg>
        {publication}
      </li>
      <li className="flex items-center gap-2">
        <svg aria-hidden viewBox="0 0 12 12" className="size-3">
          <circle cx={6} cy={6} r={3.4} className="fill-text/60" />
        </svg>
        {author}
      </li>
    </ul>
  );
}
