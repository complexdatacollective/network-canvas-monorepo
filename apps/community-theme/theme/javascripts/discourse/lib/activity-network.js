const TAU = Math.PI * 2;

// A person whose discussions average out to less than this, as unit vectors
// pointing at each discussion, took part all round the ring.
const HUB_THRESHOLD = 0.5;

function round(value) {
  return Math.round(value * 10) / 10;
}

function normalise(angle) {
  return ((angle % TAU) + TAU) % TAU;
}

// Pushes neighbouring angles apart until each pair is at least `gap` apart,
// keeping their order round the circle.
function spread(angles, gap) {
  if (angles.length < 2) {
    return angles;
  }
  const spaced = angles.map(normalise).toSorted((a, b) => a - b);
  const minimum = Math.min(gap, TAU / spaced.length);
  for (let pass = 0; pass < 100; pass++) {
    let moved = false;
    for (let i = 0; i < spaced.length; i++) {
      const next = (i + 1) % spaced.length;
      const distance = normalise(spaced[next] - spaced[i]);
      if (distance < minimum - 1e-6) {
        const shift = (minimum - distance) / 2;
        spaced[i] -= shift;
        spaced[next] += shift;
        moved = true;
      }
    }
    if (!moved) {
      break;
    }
  }
  return spaced;
}

/**
 * Lays out recent discussions and the people who posted in them as a small
 * network: the discussions evenly round an inner ring, each person on an
 * outer ring beside the discussions they took part in, and anyone who took
 * part all round the ring (usually the team) in the middle.
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
  const kept = [...participation.entries()]
    .map(([id, topicIds], order) => ({ id, topicIds, order }))
    .toSorted(
      (a, b) => b.topicIds.length - a.topicIds.length || a.order - b.order,
    )
    .slice(0, maxPeople);

  const hubs = [];
  const ringed = [];
  for (const person of kept) {
    let sumX = 0;
    let sumY = 0;
    for (const topicId of person.topicIds) {
      sumX += Math.cos(topicAngles.get(topicId));
      sumY += Math.sin(topicAngles.get(topicId));
    }
    const count = person.topicIds.length;
    const pull = Math.hypot(sumX, sumY) / count;
    if (count > 1 && pull < HUB_THRESHOLD) {
      hubs.push(person);
    } else {
      ringed.push({ ...person, angle: Math.atan2(sumY, sumX) });
    }
  }

  const byAngle = ringed.toSorted(
    (a, b) => normalise(a.angle) - normalise(b.angle),
  );
  const angles = spread(
    byAngle.map((person) => person.angle),
    0.42,
  );
  const people = [
    // Several people in the middle share a small circle, starting side by
    // side, where the drawing is widest.
    ...hubs.map((person, index) => {
      const radius = hubs.length === 1 ? 0 : Math.min(width, height) * 0.12;
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
