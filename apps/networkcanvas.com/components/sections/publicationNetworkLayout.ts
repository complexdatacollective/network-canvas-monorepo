import type { Publication } from '~/lib/siteContent';

// A two-mode (affiliation) network derived from the publication list alone:
// one node per publication, one per author, an edge for each authorship. An
// author who appears on several publications is a single node joined to each
// of them — the picture adds nothing the author lists do not already say.
//
// Layout runs in two passes, both deterministic. Publications are placed by a
// small force simulation: publications that share authors attract, every
// publication keeps clear of the others, and newer publications are pulled
// harder toward the centre, so the most recent work sits in the middle with
// the older body of work around it. Authors are then placed geometrically:
// each publication's own authors on a ring around it, shared authors between
// the publications they connect. A last pass keeps clear space around every
// node and moves authors off edges that are not theirs.
//
// The layout takes tens of milliseconds, so it runs where the page is
// prerendered (see Publications.tsx); the browser only receives the result.

export type AuthorNode = {
  key: string;
  name: string;
  x: number;
  y: number;
  hubs: number[];
};

export type Hub = {
  index: number;
  x: number;
  y: number;
  radius: number;
  ring: number;
  footprint: number;
  // Rank by distance from the centre — the order the network blooms in.
  order: number;
  authorKeys: string[];
  // Publications sharing at least one author, most shared first.
  partners: number[];
};

export type Bridge = {
  key: string;
  hubs: number[];
  authorKeys: string[];
};

export type Box = { x: number; y: number; width: number; height: number };

export type AuthorshipGraph = {
  hubs: Hub[];
  authors: Map<string, AuthorNode>;
  bridges: Bridge[];
  overview: Box;
  focus: Box[];
  // Distance from the centre to the outermost publication.
  extent: number;
};

export const AUTHOR_RADIUS = 3.2;
const LABEL_SIZE = 4.2;
const SHARED_SPACING = 12;
// Clear space between two publications' author rings.
const GAP = 30;
// Clear space between any two nodes once everything is placed.
const NODE_GAP = 6;
// The layout is held in an ellipse this much wider than it is tall, to suit
// a full-width stage.
const ASPECT = 1.3;

function splitAuthors(authors: string) {
  return authors
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

// Notation only, never a guess about people: a trailing "Jr" is dropped
// ("Green HD Jr" is "Green HD" elsewhere in the data), "2nd"/"3rd" are written
// as "II"/"III", and case is ignored for matching ("Phillips Ii G").
const ordinalSuffixes: Record<string, string> = { '2nd': 'II', '3rd': 'III' };

function normaliseAuthor(name: string) {
  return name
    .trim()
    .replace(/\s+Jr\.?$/i, '')
    .split(/\s+/)
    .map((word) => ordinalSuffixes[word.toLowerCase()] ?? word)
    .join(' ');
}

const keyOf = (name: string) => normaliseAuthor(name).toLowerCase();

function splitKey(key: string) {
  const parts = key.split(' ');
  return {
    surname: parts.slice(0, -1).join(' '),
    initials: parts.at(-1) ?? '',
  };
}

type ResolvedAuthor = { written: string; original: string; key: string };

/**
 * Author keys for each publication. A name with fewer initials ("Wagner G")
 * is joined to a fuller one with the same surname ("Wagner GJ") only on a
 * publication that shares at least two other authors with the fuller name's
 * publications — and only when exactly one fuller name qualifies.
 */
function resolveAuthors(
  publications: readonly Publication[],
): ResolvedAuthor[][] {
  const papers = publications.map((publication) => {
    const seen = new Set<string>();
    return splitAuthors(publication.authors)
      .map((name) => ({
        written: normaliseAuthor(name),
        original: keyOf(name),
      }))
      .filter(({ original }) => {
        if (seen.has(original)) return false;
        seen.add(original);
        return true;
      });
  });
  const coauthorsOf = new Map<string, Set<string>>();
  for (const authors of papers) {
    for (const { original } of authors) {
      const set = coauthorsOf.get(original) ?? new Set<string>();
      for (const other of authors) {
        if (other.original !== original) set.add(other.original);
      }
      coauthorsOf.set(original, set);
    }
  }
  const bySurname = new Map<string, { key: string; initials: string }[]>();
  for (const key of coauthorsOf.keys()) {
    const { surname, initials } = splitKey(key);
    bySurname.set(surname, [
      ...(bySurname.get(surname) ?? []),
      { key, initials },
    ]);
  }

  return papers.map((authors) =>
    authors.map((author) => {
      const { surname, initials } = splitKey(author.original);
      const supported = (bySurname.get(surname) ?? []).flatMap((other) => {
        const candidate = other.key;
        if (other.initials.length <= initials.length) return [];
        if (!other.initials.startsWith(initials)) return [];
        const theirs = coauthorsOf.get(candidate) ?? new Set<string>();
        const shared = authors.filter(
          ({ original }) =>
            original !== author.original && theirs.has(original),
        );
        return shared.length >= 2 ? [candidate] : [];
      });
      const key =
        supported.length === 1 && supported[0] ? supported[0] : author.original;
      return { ...author, key };
    }),
  );
}

const round = (value: number) => Math.round(value * 10) / 10;

function labelLength(name: string) {
  return name.length * LABEL_SIZE * 0.56 + 6;
}

function boxAround(points: { x: number; y: number; pad: number }[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { x, y, pad } of points) {
    minX = Math.min(minX, x - pad);
    minY = Math.min(minY, y - pad);
    maxX = Math.max(maxX, x + pad);
    maxY = Math.max(maxY, y + pad);
  }
  return {
    x: round(minX),
    y: round(minY),
    width: round(maxX - minX),
    height: round(maxY - minY),
  };
}

/** Labels run straight out from the publication being read, like spokes. */
function labelAngle(hub: Hub, author: AuthorNode) {
  return Math.atan2(author.y - hub.y, author.x - hub.x);
}

export type AuthorLabel = {
  key: string;
  name: string;
  // Where the text starts, and the direction it runs (radians).
  x: number;
  y: number;
  angle: number;
  // A short line from the author to a label that had to move aside.
  leader: { x1: number; y1: number; x2: number; y2: number } | null;
};

/**
 * Spoke labels for one publication's authors. Each label starts just past
 * its author and runs outward; labels whose spokes would overlap are fanned
 * apart around the publication, with a leader line back to their author.
 */
export function layoutLabels(
  graph: AuthorshipGraph,
  hub: Hub,
  fontSize: number,
  gap: number,
): AuthorLabel[] {
  const items = hub.authorKeys.flatMap((key) => {
    const author = graph.authors.get(key);
    if (!author) return [];
    const angle = labelAngle(hub, author);
    const inner =
      Math.hypot(author.x - hub.x, author.y - hub.y) + AUTHOR_RADIUS + gap;
    return [
      {
        author,
        home: angle,
        angle,
        inner,
        outer: inner + author.name.length * fontSize * 0.56,
      },
    ];
  });
  const spacing = fontSize * 1.25;

  // Everything a label could run across: publications and authors near
  // enough to matter.
  const reach = Math.max(0, ...items.map((item) => item.outer)) + 12;
  const obstacles = [
    ...graph.hubs.map((other) => ({
      key: `#${other.index}`,
      x: other.x,
      y: other.y,
      r: other.radius * 1.3,
    })),
    ...[...graph.authors.values()].map((node) => ({
      key: node.key,
      x: node.x,
      y: node.y,
      r: AUTHOR_RADIUS,
    })),
  ].filter(
    (obstacle) =>
      Math.hypot(obstacle.x - hub.x, obstacle.y - hub.y) <= reach + obstacle.r,
  );
  const clash = (
    a: { inner: number; outer: number; angle: number },
    b: { inner: number; outer: number; angle: number },
  ) => {
    const from = Math.max(a.inner, b.inner);
    if (from >= Math.min(a.outer, b.outer)) return false;
    const delta = Math.atan2(
      Math.sin(b.angle - a.angle),
      Math.cos(b.angle - a.angle),
    );
    return Math.abs(delta) < spacing / from;
  };

  // Each label takes the direction nearest its spoke that runs clear of
  // other nodes and of the labels already placed, innermost first.
  const placed: typeof items = [];
  for (const item of items.toSorted((a, b) => a.inner - b.inner)) {
    let best = item.home;
    let bestScore = Infinity;
    for (let step = 0; step <= 24; step++) {
      const offset = (step % 2 === 0 ? 1 : -1) * Math.ceil(step / 2) * 0.07;
      const angle = item.home + offset;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const hits = obstacles.filter((obstacle) => {
        if (obstacle.key === item.author.key) return false;
        // Distance from the obstacle to the stretch of spoke the label takes.
        const { t } = fromSegment(
          obstacle.x,
          obstacle.y,
          hub.x + cos * item.inner,
          hub.y + sin * item.inner,
          hub.x + cos * item.outer,
          hub.y + sin * item.outer,
        );
        const along =
          item.inner + Math.min(1, Math.max(0, t)) * (item.outer - item.inner);
        return (
          Math.hypot(
            obstacle.x - (hub.x + cos * along),
            obstacle.y - (hub.y + sin * along),
          ) <
          obstacle.r + fontSize * 0.62
        );
      }).length;
      const clashes = placed.filter((other) =>
        clash({ ...item, angle }, other),
      ).length;
      const score = hits * 5 + clashes * 8 + Math.abs(offset) * 2;
      if (score < bestScore) {
        bestScore = score;
        best = angle;
      }
    }
    item.angle = best;
    placed.push(item);
  }

  for (let pass = 0; pass < 60; pass++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        if (!a || !b) continue;
        const from = Math.max(a.inner, b.inner);
        const to = Math.min(a.outer, b.outer);
        if (from >= to) continue;
        let delta = b.angle - a.angle;
        delta = Math.atan2(Math.sin(delta), Math.cos(delta));
        const needed = spacing / from;
        if (Math.abs(delta) >= needed) continue;
        const push = (needed - Math.abs(delta)) / 2 + 0.002;
        const direction = delta >= 0 ? 1 : -1;
        a.angle -= push * direction;
        b.angle += push * direction;
        moved = true;
      }
    }
    if (!moved) break;
  }

  return items.map(({ author, home, angle, inner }) => {
    const x = hub.x + Math.cos(angle) * inner;
    const y = hub.y + Math.sin(angle) * inner;
    const shifted =
      Math.abs(Math.atan2(Math.sin(angle - home), Math.cos(angle - home))) >
      0.03;
    return {
      key: author.key,
      name: author.name,
      x,
      y,
      angle,
      leader: shifted
        ? {
            x1: author.x + Math.cos(home) * AUTHOR_RADIUS,
            y1: author.y + Math.sin(home) * AUTHOR_RADIUS,
            x2: hub.x + Math.cos(angle) * (inner - gap * 0.4),
            y2: hub.y + Math.sin(angle) * (inner - gap * 0.4),
          }
        : null,
    };
  });
}

type Link = { a: number; b: number; weight: number };

function layoutHubs(hubs: Hub[], links: Link[]) {
  const count = hubs.length;
  const velocity = hubs.map(() => ({ x: 0, y: 0 }));
  // Start from a sunflower spiral, newest first, but with publications that
  // share authors (directly or through others) seated together, so no group
  // has to pull itself through another to close up.
  const group = hubs.map((_, i) => i);
  const root = (i: number): number => {
    let at = i;
    while (group[at] !== at) at = group[at] ?? at;
    return at;
  };
  for (const { a, b } of links) {
    const ra = root(a);
    const rb = root(b);
    group[Math.max(ra, rb)] = Math.min(ra, rb);
  }
  hubs
    .map((hub, i) => ({ hub, group: root(i) }))
    .toSorted((x, y) => x.group - y.group || x.hub.index - y.hub.index)
    .forEach(({ hub }, i) => {
      const r = 40 * Math.sqrt(i + 0.6);
      const angle = i * 2.399963;
      hub.x = r * Math.cos(angle) * Math.sqrt(ASPECT);
      hub.y = (r * Math.sin(angle)) / Math.sqrt(ASPECT);
    });

  const ticks = 420;
  for (let tick = 0; tick < ticks; tick++) {
    const alpha = 1 - tick / ticks;

    for (const { a, b, weight } of links) {
      const p = hubs[a];
      const q = hubs[b];
      const vp = velocity[a];
      const vq = velocity[b];
      if (!p || !q || !vp || !vq) continue;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const distance = Math.hypot(dx, dy) || 1;
      const target = p.footprint + q.footprint + (weight >= 3 ? 62 : 46);
      const pull =
        ((distance - target) / distance) *
        0.22 *
        Math.min(1, 0.45 + 0.15 * weight) *
        alpha;
      vp.x += dx * pull;
      vp.y += dy * pull;
      vq.x -= dx * pull;
      vq.y -= dy * pull;
    }

    for (let i = 0; i < count; i++) {
      const p = hubs[i];
      const vp = velocity[i];
      if (!p || !vp) continue;
      // Newer publications are held closer to the centre.
      const recency = 1 - i / count;
      const gravity = (0.014 + 0.022 * recency * recency) * alpha;
      vp.x -= (p.x * gravity) / ASPECT;
      vp.y -= p.y * gravity * ASPECT;
      for (let j = i + 1; j < count; j++) {
        const q = hubs[j];
        const vq = velocity[j];
        if (!q || !vq) continue;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const distance = Math.hypot(dx, dy) || 1;
        if (distance > 320) continue;
        const push = (60 / (distance * distance)) * alpha;
        vp.x -= dx * push;
        vp.y -= dy * push;
        vq.x += dx * push;
        vq.y += dy * push;
      }
    }

    hubs.forEach((hub, i) => {
      const v = velocity[i];
      if (!v) return;
      hub.x += v.x;
      hub.y += v.y;
      v.x *= 0.55;
      v.y *= 0.55;
    });

    // Hard spacing: no two publications' author rings may touch.
    for (let i = 0; i < count; i++) {
      const p = hubs[i];
      if (!p) continue;
      for (let j = i + 1; j < count; j++) {
        const q = hubs[j];
        if (!q) continue;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const distance = Math.hypot(dx, dy) || 1;
        const minimum = p.footprint + q.footprint + GAP;
        if (distance >= minimum) continue;
        const shift = ((minimum - distance) / distance) * 0.5;
        p.x -= dx * shift;
        p.y -= dy * shift;
        q.x += dx * shift;
        q.y += dy * shift;
      }
    }

    // Keep each publication off the line between two others that share
    // authors, so their shared authors' edges never run through it.
    if (tick > ticks * 0.25) keepOffLinks(hubs, links);
  }
}

function keepOffLinks(hubs: Hub[], links: Link[]) {
  for (const { a, b } of links) {
    const p = hubs[a];
    const q = hubs[b];
    if (!p || !q) continue;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const length = dx * dx + dy * dy || 1;
    for (const other of hubs) {
      if (other === p || other === q) continue;
      const t = ((other.x - p.x) * dx + (other.y - p.y) * dy) / length;
      if (t <= 0 || t >= 1) continue;
      const ex = other.x - (p.x + t * dx);
      const ey = other.y - (p.y + t * dy);
      const distance = Math.hypot(ex, ey) || 1;
      const minimum = other.footprint + SHARED_SPACING;
      if (distance >= minimum) continue;
      const shift = ((minimum - distance) / distance) * 0.4;
      other.x += ex * shift;
      other.y += ey * shift;
      p.x -= ex * shift * (1 - t) * 0.5;
      p.y -= ey * shift * (1 - t) * 0.5;
      q.x -= ex * shift * t * 0.5;
      q.y -= ey * shift * t * 0.5;
    }
  }
}

// The clearance a node needs around it: an author is a dot, a publication a
// page (half its diagonal, stroke included).
const clearance = (hub: Hub) => hub.radius * 1.3;

// Distance from a point to a segment, and the offset that points away from it.
function fromSegment(
  x: number,
  y: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1);
  const ex = x - (ax + t * dx);
  const ey = y - (ay + t * dy);
  return { t, ex, ey, distance: Math.hypot(ex, ey) || 1 };
}

/**
 * A last pass that guarantees clear space around every node: authors are
 * nudged apart from each other, off any publication and off any edge that is
 * not theirs, until no two nodes come within NODE_GAP and no edge runs
 * through a node. Publications stay where the layout put them.
 */
function separateNodes(hubs: Hub[], authors: AuthorNode[]) {
  const byKey = new Map(authors.map((node) => [node.key, node]));
  const edges = hubs.flatMap((hub) =>
    hub.authorKeys.flatMap((key) => {
      const node = byKey.get(key);
      return node ? [{ hub, node }] : [];
    }),
  );
  // Nodes near each edge, refreshed now and then: they move only a little.
  let near: { authors: AuthorNode[]; hubs: Hub[] }[] = [];
  const nearEdges = () =>
    edges.map(({ hub, node }) => {
      const minX = Math.min(hub.x, node.x) - 30;
      const maxX = Math.max(hub.x, node.x) + 30;
      const minY = Math.min(hub.y, node.y) - 30;
      const maxY = Math.max(hub.y, node.y) + 30;
      const inside = (point: { x: number; y: number }) =>
        point.x > minX && point.x < maxX && point.y > minY && point.y < maxY;
      return {
        authors: authors.filter((other) => other !== node && inside(other)),
        hubs: hubs.filter((other) => other !== hub && inside(other)),
      };
    });
  for (let pass = 0; pass < 80; pass++) {
    let moved = false;
    if (pass % 20 === 0) near = nearEdges();
    for (const [e, { hub, node }] of edges.entries()) {
      const candidates = near[e];
      if (!candidates) continue;
      // Another author on the edge steps off it.
      for (const other of candidates.authors) {
        const { t, ex, ey, distance } = fromSegment(
          other.x,
          other.y,
          hub.x,
          hub.y,
          node.x,
          node.y,
        );
        const minimum = AUTHOR_RADIUS + 2.5;
        if (t <= 0 || t >= 1 || distance >= minimum) continue;
        const shift = (minimum - distance) / distance;
        other.x += ex * shift * 0.6;
        other.y += ey * shift * 0.6;
        node.x -= ex * shift * 0.4 * t;
        node.y -= ey * shift * 0.4 * t;
        moved = true;
      }
      // An edge across another publication swings away from it, about its
      // own publication.
      for (const other of candidates.hubs) {
        const { t, ex, ey, distance } = fromSegment(
          other.x,
          other.y,
          hub.x,
          hub.y,
          node.x,
          node.y,
        );
        const minimum = clearance(other) + 2;
        if (t <= 0 || t >= 1 || distance >= minimum) continue;
        const shift = ((minimum - distance) / distance) * Math.min(1, 1 / t);
        node.x -= ex * shift * 0.5;
        node.y -= ey * shift * 0.5;
        moved = true;
      }
    }
    for (let i = 0; i < authors.length; i++) {
      const node = authors[i];
      if (!node) continue;
      for (const hub of hubs) {
        const dx = node.x - hub.x;
        const dy = node.y - hub.y;
        const distance = Math.hypot(dx, dy) || 1;
        const minimum = clearance(hub) + AUTHOR_RADIUS + NODE_GAP;
        if (distance >= minimum) continue;
        const shift = (minimum - distance) / distance;
        node.x += dx * shift;
        node.y += dy * shift;
        moved = true;
      }
      for (let j = i + 1; j < authors.length; j++) {
        const other = authors[j];
        if (!other) continue;
        const dx = node.x - other.x;
        const dy = node.y - other.y;
        if (Math.abs(dx) > 20 || Math.abs(dy) > 20) continue;
        const distance = Math.hypot(dx, dy) || 1;
        const minimum = AUTHOR_RADIUS * 2 + NODE_GAP;
        if (distance >= minimum) continue;
        const shift = ((minimum - distance) / distance) * 0.5;
        node.x += dx * shift;
        node.y += dy * shift;
        other.x -= dx * shift;
        other.y -= dy * shift;
        moved = true;
      }
    }
    if (!moved) return;
  }
}

// Spread arc length evenly over the parts of a ring not facing shared authors.
function ringAngles(count: number, blocked: number[], start: number) {
  if (count === 0) return [];
  const half = 0.34;
  const intervals = blocked
    .map((angle) => {
      const normal =
        (((angle - start) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      return [normal - half, normal + half] as const;
    })
    .toSorted((a, b) => a[0] - b[0]);
  const free: [number, number][] = [];
  let cursor = 0;
  for (const [from, to] of intervals) {
    if (from > cursor) free.push([cursor, from]);
    cursor = Math.max(cursor, to);
  }
  if (cursor < Math.PI * 2) free.push([cursor, Math.PI * 2]);
  const total = free.reduce((sum, [from, to]) => sum + (to - from), 0);
  if (total < 0.8) {
    return Array.from(
      { length: count },
      (_, i) => start + (Math.PI * 2 * i) / count,
    );
  }
  const step = total / count;
  const angles: number[] = [];
  let travelled = step / 2;
  for (const [from, to] of free) {
    while (angles.length < count && travelled <= to - from) {
      angles.push(start + from + travelled);
      travelled += step;
    }
    travelled -= to - from;
  }
  return angles;
}

export function buildAuthorshipGraph(
  publications: readonly Publication[],
): AuthorshipGraph {
  const resolved = resolveAuthors(publications);
  const paperKeys = resolved.map((authors) =>
    authors.map((author) => author.key),
  );

  // Display names: the most common written form of each key. A short form
  // that was joined to a fuller one never names the node.
  const spellings = new Map<string, Map<string, number>>();
  for (const authors of resolved) {
    for (const { written, original, key } of authors) {
      if (key !== original) continue;
      const counts = spellings.get(key) ?? new Map<string, number>();
      counts.set(written, (counts.get(written) ?? 0) + 1);
      spellings.set(key, counts);
    }
  }
  const nameOf = (key: string) => {
    const counts = spellings.get(key);
    if (!counts) return key;
    return [...counts.entries()].toSorted((a, b) => b[1] - a[1])[0]?.[0] ?? key;
  };

  const authorPapers = new Map<string, number[]>();
  paperKeys.forEach((keys, index) => {
    for (const key of new Set(keys)) {
      authorPapers.set(key, [...(authorPapers.get(key) ?? []), index]);
    }
  });

  const isShared = (key: string) => (authorPapers.get(key)?.length ?? 0) > 1;

  const linkWeights = new Map<string, number>();
  for (const papers of authorPapers.values()) {
    for (let i = 0; i < papers.length; i++) {
      for (let j = i + 1; j < papers.length; j++) {
        const id = `${papers[i]}-${papers[j]}`;
        linkWeights.set(id, (linkWeights.get(id) ?? 0) + 1);
      }
    }
  }
  const links: Link[] = [...linkWeights.entries()].map(([id, weight]) => {
    const [a = 0, b = 0] = id.split('-').map(Number);
    return { a, b, weight };
  });

  const hubs: Hub[] = paperKeys.map((keys, index) => {
    const unique = [...new Set(keys)];
    const own = unique.filter((key) => !isShared(key)).length;
    const radius = 3.6 + Math.sqrt(unique.length) * 0.85;
    const ring = own === 0 ? radius : radius + 8 + own * 1.7;
    const weights = links
      .filter((link) => link.a === index || link.b === index)
      .toSorted((x, y) => y.weight - x.weight);
    return {
      index,
      x: 0,
      y: 0,
      radius,
      ring,
      footprint: ring + AUTHOR_RADIUS + 2,
      order: 0,
      authorKeys: unique,
      partners: weights.map((link) => (link.a === index ? link.b : link.a)),
    };
  });

  layoutHubs(hubs, links);

  // Bloom order: centre outwards.
  hubs
    .map((hub) => ({ hub, distance: Math.hypot(hub.x, hub.y) }))
    .toSorted((a, b) => a.distance - b.distance)
    .forEach(({ hub }, rank) => {
      hub.order = rank;
    });

  // Shared authors, grouped by the exact set of publications they connect.
  const authors = new Map<string, AuthorNode>();
  const groups = new Map<string, string[]>();
  for (const [key, papers] of authorPapers) {
    if (papers.length < 2) continue;
    const groupKey = papers.join('-');
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), key]);
  }

  const bridges: Bridge[] = [];
  for (const [groupKey, keys] of groups) {
    const members = groupKey
      .split('-')
      .map((index) => hubs[Number(index)])
      .filter((hub): hub is Hub => Boolean(hub));
    const [a, b] = members;
    if (!a || !b) continue;
    let cx: number;
    let cy: number;
    let ux = 1;
    let uy = 0;
    if (members.length === 2) {
      const distance = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      ux = (b.x - a.x) / distance;
      uy = (b.y - a.y) / distance;
      const along = a.footprint + (distance - a.footprint - b.footprint) / 2;
      cx = a.x + ux * along;
      cy = a.y + uy * along;
    } else {
      cx = members.reduce((sum, hub) => sum + hub.x, 0) / members.length;
      cy = members.reduce((sum, hub) => sum + hub.y, 0) / members.length;
    }
    keys.forEach((key, i) => {
      let x: number;
      let y: number;
      if (members.length === 2) {
        const offset = (i - (keys.length - 1) / 2) * SHARED_SPACING;
        x = cx - uy * offset;
        y = cy + ux * offset;
      } else {
        const r = SHARED_SPACING * Math.sqrt(i);
        x = cx + r * Math.cos(i * 2.399963);
        y = cy + r * Math.sin(i * 2.399963);
      }
      authors.set(key, {
        key,
        name: nameOf(key),
        x,
        y,
        hubs: members.map((hub) => hub.index),
      });
    });
    bridges.push({
      key: groupKey,
      hubs: members.map((hub) => hub.index),
      authorKeys: keys,
    });
  }

  // Ease shared authors off any ring or other author they landed on.
  const shared = [...authors.values()];
  for (let pass = 0; pass < 40; pass++) {
    for (const node of shared) {
      for (const hub of hubs) {
        const dx = node.x - hub.x;
        const dy = node.y - hub.y;
        const distance = Math.hypot(dx, dy) || 1;
        // Outside every ring, its own publications' included, so no edge
        // to it runs through another author.
        const minimum =
          hub.footprint + (hub.authorKeys.includes(node.key) ? 3 : 8);
        if (distance >= minimum) continue;
        const shift = (minimum - distance) / distance;
        node.x += dx * shift * 0.5;
        node.y += dy * shift * 0.5;
      }
      for (const other of shared) {
        if (other === node) continue;
        const dx = node.x - other.x;
        const dy = node.y - other.y;
        const distance = Math.hypot(dx, dy) || 1;
        const minimum = AUTHOR_RADIUS * 2 + NODE_GAP;
        if (distance >= minimum) continue;
        const shift = ((minimum - distance) / distance) * 0.5;
        node.x += dx * shift;
        node.y += dy * shift;
      }
    }
  }

  // Each publication's own authors, on a ring that leaves its shared authors'
  // directions open.
  for (const hub of hubs) {
    const own = hub.authorKeys.filter((key) => !isShared(key));
    const blocked = hub.authorKeys
      .filter(isShared)
      .map((key) => authors.get(key))
      .filter((node) => node !== undefined)
      .map((node) => Math.atan2(node.y - hub.y, node.x - hub.x));
    const start = -Math.PI / 2 + hub.index * 0.9;
    ringAngles(own.length, blocked, start).forEach((angle, i) => {
      const key = own[i];
      if (!key) return;
      authors.set(key, {
        key,
        name: nameOf(key),
        x: hub.x + Math.cos(angle) * hub.ring,
        y: hub.y + Math.sin(angle) * hub.ring,
        hubs: [hub.index],
      });
    });
  }

  separateNodes(hubs, [...authors.values()]);

  for (const node of authors.values()) {
    node.x = round(node.x);
    node.y = round(node.y);
  }
  for (const hub of hubs) {
    hub.x = round(hub.x);
    hub.y = round(hub.y);
  }

  const overview = boxAround([
    ...hubs.map((hub) => ({ x: hub.x, y: hub.y, pad: hub.footprint + 12 })),
    ...[...authors.values()].map((node) => ({ x: node.x, y: node.y, pad: 12 })),
  ]);

  // The camera frame for each publication: its authors and their labels, and
  // every publication it shares an author with (those can be opened from the
  // network, so they must be in view).
  const focus = hubs.map((hub) => {
    const points: { x: number; y: number; pad: number }[] = [
      { x: hub.x, y: hub.y, pad: hub.footprint + 8 },
    ];
    for (const key of hub.authorKeys) {
      const author = authors.get(key);
      if (!author) continue;
      const reach = labelLength(author.name);
      const angle = labelAngle(hub, author);
      points.push(
        {
          x: author.x + Math.cos(angle) * reach,
          y: author.y + Math.sin(angle) * reach,
          pad: 6,
        },
        { x: author.x, y: author.y, pad: 8 },
      );
    }
    for (const partner of hub.partners) {
      const other = hubs[partner];
      if (other) points.push({ x: other.x, y: other.y, pad: other.radius + 8 });
    }
    return boxAround(points);
  });

  const extent = Math.max(...hubs.map((hub) => Math.hypot(hub.x, hub.y)));

  return { hubs, authors, bridges, overview, focus, extent };
}
