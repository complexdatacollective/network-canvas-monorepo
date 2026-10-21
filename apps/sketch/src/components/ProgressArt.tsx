// The network diagram on the generating screen. Each finished step fills in
// more of it: people after reading, ties after the design, places after the
// wording, and a check mark once the protocol validates.

type Props = { doneCount: number };

const TIE = 'stroke-[oklch(0.92_0.02_281)] opacity-70';
const FADE =
  'transition-opacity duration-700 ease-out motion-reduce:transition-none';

const people = [
  [230, 140],
  [156, 204],
  [300, 222],
  [206, 286],
  [352, 104],
] as const;

const places = [
  [96, 118],
  [106, 316],
  [368, 310],
] as const;

export const ProgressArt = ({ doneCount }: Props) => {
  const show = {
    people: doneCount >= 1 ? 1 : 0.12,
    ties: doneCount >= 2 ? 1 : 0.08,
    places: doneCount >= 3 ? 1 : 0.08,
    check: doneCount >= 5 ? 1 : 0,
  };

  return (
    <div className="border-night-line bg-night-panel rounded-[28px] border p-5">
      <svg
        viewBox="0 0 460 400"
        role="img"
        aria-label="The network diagram fills in as each step finishes"
        className="block h-auto w-full"
      >
        <circle
          cx="230"
          cy="200"
          r="186"
          className="fill-night-ring stroke-[oklch(0.36_0.08_281)]"
          strokeWidth="1.5"
          strokeDasharray="4 8"
        />
        <circle
          cx="230"
          cy="200"
          r="120"
          className="fill-[oklch(0.285_0.085_281)] stroke-[oklch(0.38_0.08_281)]"
          strokeWidth="1.5"
          strokeDasharray="4 8"
        />
        <circle
          cx="230"
          cy="200"
          r="58"
          className="fill-night-tile stroke-[oklch(0.42_0.08_281)]"
          strokeWidth="1.5"
          strokeDasharray="4 8"
        />
        <g
          className={FADE}
          style={{ opacity: show.ties }}
          fill="none"
          strokeLinecap="round"
          strokeWidth="3.5"
        >
          <path d="M230 140 Q 186 160 156 204" className={TIE} />
          <path d="M230 140 Q 272 170 300 222" className={TIE} />
          <path d="M156 204 Q 172 262 206 286" className={TIE} />
          <path d="M300 222 Q 262 268 206 286" className={TIE} />
          <path d="M230 140 Q 300 108 352 104" className="stroke-cerulean" />
          <path d="M352 104 Q 344 168 300 222" className="stroke-cerulean" />
        </g>
        <g
          className={FADE}
          style={{ opacity: show.places }}
          fill="none"
          strokeLinecap="round"
          strokeWidth="3.5"
        >
          <path
            d="M156 204 Q 110 168 96 118"
            className="stroke-mustard motion-safe:animate-draw"
            strokeDasharray="2 10"
          />
          <path
            d="M206 286 Q 150 320 106 316"
            className="stroke-mustard motion-safe:animate-draw"
            strokeDasharray="2 10"
          />
          <path
            d="M300 222 Q 350 270 368 310"
            className="stroke-mustard motion-safe:animate-draw"
            strokeDasharray="2 10"
          />
        </g>
        <g className={FADE} style={{ opacity: show.people }}>
          {people.map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <circle cx={x} cy={y} r="27" className="fill-neon-coral-shade" />
              <circle cx={x} cy={y - 3} r="24" className="fill-neon-coral" />
            </g>
          ))}
        </g>
        <g className={FADE} style={{ opacity: show.places }}>
          {places.map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <circle cx={x} cy={y} r="23" className="fill-sea-green-shade" />
              <circle cx={x} cy={y - 3} r="20" className="fill-sea-green" />
            </g>
          ))}
        </g>
        <g className={FADE} style={{ opacity: show.check }}>
          <circle cx="404" cy="356" r="28" className="fill-mustard" />
          <path
            d="m392 356 8 8 15-16"
            fill="none"
            className="stroke-night"
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </svg>
      <ul className="text-night-text m-0 flex list-none flex-wrap gap-x-[18px] gap-y-2 px-1.5 pt-3 pb-1 text-sm">
        <li className="inline-flex items-center gap-2">
          <span className="bg-neon-coral size-3 rounded-full" />
          Person
        </li>
        <li className="inline-flex items-center gap-2">
          <span className="bg-sea-green size-3 rounded-full" />
          Place
        </li>
        <li className="inline-flex items-center gap-2">
          <span className="h-[3px] w-[18px] rounded-sm bg-[oklch(0.92_0.02_281)]" />
          A relationship
        </li>
        <li className="inline-flex items-center gap-2">
          <span className="bg-cerulean h-[3px] w-[18px] rounded-sm" />
          Another relationship
        </li>
      </ul>
    </div>
  );
};
