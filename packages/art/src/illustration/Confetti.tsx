import { segment, TAU } from './motion';

// Confetti: every piece is generated once from a seeded sequence (never
// Math.random, which would differ between server and client) and its position
// is a pure function of the time since the burst.
const CONFETTI_COUNT = 58;
const CONFETTI_DRAG = 2.4;
const CONFETTI_GRAVITY = 480;

const confettiColors = [
  { fill: 'fill-sea-green', stroke: 'stroke-sea-green' },
  { fill: 'fill-neon-coral', stroke: 'stroke-neon-coral' },
  { fill: 'fill-mustard', stroke: 'stroke-mustard' },
  { fill: 'fill-cerulean-blue', stroke: 'stroke-cerulean-blue' },
  { fill: 'fill-slate-blue', stroke: 'stroke-slate-blue' },
  { fill: 'fill-purple-pizazz', stroke: 'stroke-purple-pizazz' },
  { fill: 'fill-paradise-pink', stroke: 'stroke-paradise-pink' },
  { fill: 'fill-kiwi', stroke: 'stroke-kiwi' },
  { fill: 'fill-neon-carrot', stroke: 'stroke-neon-carrot' },
] as const;

const confettiShapes = ['rect', 'squiggle', 'dot', 'rect'] as const;

const seeded = (seed: number) => {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
};

const round = (value: number) => Math.round(value * 100) / 100;

const confetti = (() => {
  const random = seeded(2016);
  return Array.from({ length: CONFETTI_COUNT }, (_, index) => {
    const angle = ((index + random() * 0.8) / CONFETTI_COUNT) * TAU;
    const speed =
      (480 + random() * 680) * (1 - 0.3 * Math.max(0, -Math.sin(angle)));
    // Pieces thrown downward would leave the frame at once, so they are
    // thrown more gently.
    const downward = Math.sin(angle) > 0.25 ? 0.45 : 1;
    return {
      shape: confettiShapes[index % confettiShapes.length]!,
      color: confettiColors[(index * 5) % confettiColors.length]!,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed * downward - 120,
      delay: random() * 0.1,
      life: 2.3 + random() * 0.7,
      rotation: random() * 360,
      spin: (random() - 0.5) * 900,
      flip: 4 + random() * 7,
      flipPhase: random() * TAU,
      size: 1.1 + random() * 0.7,
      flutter: 10 + random() * 22,
      flutterRate: 3 + random() * 4,
      flutterPhase: random() * TAU,
    };
  });
})();

type Point = readonly [number, number];

// A burst thrown from `origin` `since` seconds ago, fading out as pieces fall
// past `floor`.
export function Confetti({
  since,
  origin,
  floor,
}: {
  since: number;
  origin: Point;
  floor: number;
}) {
  return (
    <g>
      {confetti.map((piece, index) => {
        const age = since - piece.delay;
        if (age <= 0 || age >= piece.life) return null;
        const glide = 1 - Math.exp(-CONFETTI_DRAG * age);
        const sway =
          Math.sin(piece.flutterRate * age + piece.flutterPhase) *
          piece.flutter *
          segment(age, 0.25, 0.6);
        const x = origin[0] + (piece.vx / CONFETTI_DRAG) * glide + sway;
        const y =
          origin[1] +
          (piece.vy / CONFETTI_DRAG) * glide +
          (CONFETTI_GRAVITY / CONFETTI_DRAG) * (age - glide / CONFETTI_DRAG);
        const tumble = Math.max(
          0.15,
          Math.abs(Math.cos(piece.flip * age + piece.flipPhase)),
        );
        const size = piece.size * Math.min(1, age / 0.1);
        const opacity =
          (1 - segment(age, piece.life - 0.7, 0.7)) *
          (1 - segment(y, floor, 40));
        return (
          <g
            key={index}
            transform={`translate(${round(x)} ${round(y)}) rotate(${round(
              piece.rotation + piece.spin * age,
            )}) scale(${round(size)} ${round(size * tumble)})`}
            opacity={round(opacity)}
          >
            {piece.shape === 'rect' ? (
              <rect
                x={-7}
                y={-4}
                width={14}
                height={8}
                rx={1.5}
                className={piece.color.fill}
              />
            ) : null}
            {piece.shape === 'squiggle' ? (
              <path
                d="M-10 0 Q-7 -7 -3.5 0 T3.5 0 T10 0"
                fill="none"
                className={piece.color.stroke}
                strokeWidth={3.5}
                strokeLinecap="round"
              />
            ) : null}
            {piece.shape === 'dot' ? (
              <circle r={4.5} className={piece.color.fill} />
            ) : null}
          </g>
        );
      })}
    </g>
  );
}
