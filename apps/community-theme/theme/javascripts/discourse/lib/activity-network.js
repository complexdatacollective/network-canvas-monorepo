const TAU = Math.PI * 2;

// A person whose discussions average out to less than this, as unit vectors
// pointing at each discussion, took part all round the ring.
const HUB_THRESHOLD = 0.5;

// Distances in drawing units, from the sizes activity-network.gjs draws: the
// largest avatar with its ring is 41 across, a discussion dot 22, and 6 keeps
// two outlines from touching. Rounded up so rounding coordinates cannot close
// the gap.
const PERSON_SPACING = 50;
const PERSON_TO_TOPIC = 40;

// The angle between neighbours on the outer ring. At its tightest, the ends
// of the 400 by 300 drawing, this is just over PERSON_SPACING apart.
const RING_GAP = 0.42;

// The radius of a circle holding `count` people PERSON_SPACING apart.
function hubRadius(count) {
  return count === 1 ? 0 : PERSON_SPACING / (2 * Math.sin(Math.PI / count));
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function normalise(angle) {
  return ((angle % TAU) + TAU) % TAU;
}

// The non-decreasing sequence closest to `values` (least squares), by pooling
// adjacent values that are out of order.
function nonDecreasing(values) {
  const blocks = [];
  for (const value of values) {
    blocks.push({ sum: value, count: 1 });
    while (blocks.length > 1) {
      const last = blocks.at(-1);
      const before = blocks.at(-2);
      if (before.sum / before.count <= last.sum / last.count) {
        break;
      }
      blocks.pop();
      before.sum += last.sum;
      before.count += last.count;
    }
  }
  return blocks.flatMap((block) =>
    Array.from({ length: block.count }, () => block.sum / block.count),
  );
}

// Spaces angles, sorted round the circle, at least `gap` apart, keeping their
// order and moving them as little as possible. The circle is opened at the
// widest gap between neighbours; if what fits on that line will not close
// back round with `gap` to spare, the angles are spread evenly instead.
function spread(angles, gap) {
  const count = angles.length;
  if (count < 2) {
    return angles;
  }
  const minimum = Math.min(gap, TAU / count);
  let widest = 0;
  for (let i = 1; i < count; i++) {
    const width = normalise(angles[(i + 1) % count] - angles[i]);
    if (width > normalise(angles[(widest + 1) % count] - angles[widest])) {
      widest = i;
    }
  }
  const start = (widest + 1) % count;
  const line = angles.map((_, k) => {
    const index = (start + k) % count;
    return angles[index] + (start + k >= count ? TAU : 0);
  });
  let placed = nonDecreasing(line.map((angle, k) => angle - k * minimum)).map(
    (angle, k) => angle + k * minimum,
  );
  if (placed.at(-1) - placed[0] > TAU - minimum + 1e-9) {
    const step = TAU / count;
    const offset =
      line.reduce((sum, angle, k) => sum + angle - k * step, 0) / count;
    placed = line.map((_, k) => offset + k * step);
  }
  const result = [];
  for (const [k, angle] of placed.entries()) {
    result[(start + k) % count] = normalise(angle);
  }
  return result;
}

/**
 * Lays out recent discussions and the people who posted in them as a small
 * network: the discussions evenly round an inner ring, each person on an
 * outer ring beside the discussions they took part in, and anyone who took
 * part all round the ring (usually the team) in the middle. The middle and
 * the outer ring each hold as many people as fit without overlapping; anyone
 * beyond both, the least active, is left out.
 *
 * @param {{ id: number, posterIds: number[] }[]} topics newest first
 * @param {{ width?: number, height?: number, maxPeople?: number }} [options]
 * @returns {{
 *   topics: { id: number, x: number, y: number }[],
 *   people: { id: number, x: number, y: number, hub: boolean }[],
 *   links: { topicId: number, personId: number, x1: number, y1: number, x2: number, y2: number }[],
 * }}
 */
export function layoutActivityNetwork(
  topics,
  { width = 400, height = 300, maxPeople = 18 } = {},
) {
  const cx = width / 2;
  const cy = height / 2;
  const inner = { x: width * 0.24, y: height * 0.26 };
  const outer = { x: width * 0.44, y: height * 0.42 };

  const topicAngles = new Map(
    topics.map((topic, index) => [
      topic.id,
      -Math.PI / 2 + (TAU * index) / topics.length,
    ]),
  );
  const placedTopics = topics.map((topic) => {
    const angle = topicAngles.get(topic.id);
    return {
      id: topic.id,
      x: round(cx + inner.x * Math.cos(angle)),
      y: round(cy + inner.y * Math.sin(angle)),
    };
  });

  // Each person once, most active first, then in order of appearance.
  const participation = new Map();
  for (const topic of topics) {
    for (const personId of new Set(topic.posterIds)) {
      const topicIds = participation.get(personId) ?? [];
      topicIds.push(topic.id);
      participation.set(personId, topicIds);
    }
  }
  const ranked = [...participation.entries()]
    .map(([id, topicIds], order) => ({ id, topicIds, order }))
    .toSorted(
      (a, b) => b.topicIds.length - a.topicIds.length || a.order - b.order,
    );

  // As many people fit in the middle as a circle PERSON_SPACING apart holds
  // while staying clear of the discussions round it; one sits at the centre.
  const middle = Math.min(inner.x, inner.y) - PERSON_TO_TOPIC;
  let hubCapacity = 1;
  while (hubRadius(hubCapacity + 1) <= middle) {
    hubCapacity++;
  }
  const ringCapacity = Math.floor(TAU / RING_GAP);

  // Most active first: each person goes in the middle if they took part all
  // round and there is room, otherwise on the outer ring while it has room.
  const hubs = [];
  const ringed = [];
  for (const person of ranked) {
    if (hubs.length + ringed.length === maxPeople) {
      break;
    }
    let sumX = 0;
    let sumY = 0;
    for (const topicId of person.topicIds) {
      sumX += Math.cos(topicAngles.get(topicId));
      sumY += Math.sin(topicAngles.get(topicId));
    }
    const count = person.topicIds.length;
    const pull = Math.hypot(sumX, sumY) / count;
    if (count > 1 && pull < HUB_THRESHOLD && hubs.length < hubCapacity) {
      hubs.push(person);
    } else if (ringed.length < ringCapacity) {
      ringed.push({ ...person, angle: Math.atan2(sumY, sumX) });
    }
  }

  const byAngle = ringed.toSorted(
    (a, b) => normalise(a.angle) - normalise(b.angle),
  );
  const angles = spread(
    byAngle.map((person) => normalise(person.angle)),
    RING_GAP,
  );
  const people = [
    // Several people in the middle share a small circle, starting side by
    // side, where the drawing is widest.
    ...hubs.map((person, index) => {
      const radius = hubRadius(hubs.length);
      const angle = Math.PI + (TAU * index) / hubs.length;
      return {
        id: person.id,
        topicIds: person.topicIds,
        hub: true,
        x: round(cx + radius * Math.cos(angle)),
        y: round(cy + radius * Math.sin(angle)),
      };
    }),
    ...byAngle.map((person, index) => ({
      id: person.id,
      topicIds: person.topicIds,
      hub: false,
      x: round(cx + outer.x * Math.cos(angles[index])),
      y: round(cy + outer.y * Math.sin(angles[index])),
    })),
  ];

  const topicById = new Map(placedTopics.map((topic) => [topic.id, topic]));
  const links = people.flatMap((person) =>
    person.topicIds.map((topicId) => {
      const topic = topicById.get(topicId);
      return {
        topicId,
        personId: person.id,
        x1: person.x,
        y1: person.y,
        x2: topic.x,
        y2: topic.y,
      };
    }),
  );

  return {
    topics: placedTopics,
    people: people.map(({ id, hub, x, y }) => ({ id, hub, x, y })),
    links,
  };
}
