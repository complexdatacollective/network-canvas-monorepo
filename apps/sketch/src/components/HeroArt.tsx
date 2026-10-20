// Hand-drawn sociogram art from the mockup. Animations only run when the
// viewer has not asked for reduced motion (motion-safe:).

const TIE = 'stroke-[oklch(0.92_0.02_281)] opacity-70';

const people = [
  { name: 'Maya', x: 262, y: 196, delay: '-0.3s' },
  { name: 'Sam', x: 176, y: 262, delay: '-1.4s' },
  { name: 'Jordan', x: 338, y: 290, delay: '-2.2s' },
  { name: 'Ade', x: 232, y: 360, delay: '-0.9s' },
  { name: 'Lee', x: 398, y: 150, delay: '-3.1s' },
];

const places = [
  { name: 'Dorm', x: 112, y: 160, delay: '-1.9s' },
  { name: 'Bar', x: 118, y: 388, delay: '-2.7s' },
];

const chips = [
  { label: 'Name generator', x: 330, y: 40, w: 170, dot: 'fill-slate-blue' },
  { label: 'Sociogram', x: 14, y: 456, w: 128, dot: 'fill-neon-coral' },
  { label: 'Codebook', x: 20, y: 30, w: 118, dot: 'fill-sea-green' },
];

export const HeroArt = () => (
  <svg
    viewBox="0 0 520 500"
    role="img"
    aria-label="A hand-drawn network of friends on a sociogram, with a pencil sketching a new tie"
    className="block h-auto w-full"
  >
    <circle
      cx="260"
      cy="260"
      r="232"
      className="fill-night-ring stroke-[oklch(0.36_0.08_281)]"
      strokeWidth="1.5"
    />
    <circle
      cx="260"
      cy="260"
      r="160"
      className="fill-[oklch(0.285_0.085_281)] stroke-[oklch(0.38_0.08_281)]"
      strokeWidth="1.5"
    />
    <circle
      cx="260"
      cy="260"
      r="88"
      className="fill-night-tile stroke-[oklch(0.42_0.08_281)]"
      strokeWidth="1.5"
    />
    <g fill="none" strokeLinecap="round" strokeWidth="3.5">
      <path d="M262 196 Q 214 222 176 262" className={TIE} />
      <path d="M262 196 Q 306 236 338 290" className={TIE} />
      <path d="M176 262 Q 194 330 232 360" className={TIE} />
      <path d="M338 290 Q 290 340 232 360" className={TIE} />
      <path d="M262 196 Q 330 160 398 150" className={TIE} />
      <path d="M176 262 Q 130 216 112 160" className="stroke-cerulean" />
      <path d="M398 150 Q 384 222 338 290" className="stroke-cerulean" />
      <path
        d="M176 262 Q 128 320 118 388"
        className="stroke-mustard"
        strokeDasharray="2 10"
      />
      <path
        d="M338 290 Q 382 330 400 380"
        className="stroke-mustard motion-safe:animate-draw"
        strokeWidth="4"
        strokeDasharray="2 10"
      />
    </g>
    {people.map((p) => (
      <g
        key={p.name}
        className="motion-safe:animate-bob transform-fill"
        style={{ animationDelay: p.delay }}
      >
        <circle cx={p.x} cy={p.y} r="32" className="fill-neon-coral-shade" />
        <circle cx={p.x} cy={p.y - 4} r="29" className="fill-neon-coral" />
        <text
          x={p.x}
          y={p.y + 1}
          textAnchor="middle"
          className="font-display fill-white text-[14px] font-extrabold"
        >
          {p.name}
        </text>
      </g>
    ))}
    {places.map((p) => (
      <g
        key={p.name}
        className="motion-safe:animate-bob transform-fill"
        style={{ animationDelay: p.delay }}
      >
        <circle cx={p.x} cy={p.y} r="28" className="fill-sea-green-shade" />
        <circle cx={p.x} cy={p.y - 4} r="25" className="fill-sea-green" />
        <text
          x={p.x}
          y={p.y + 1}
          textAnchor="middle"
          className="fill-on-light font-display text-[12px] font-extrabold"
        >
          {p.name}
        </text>
      </g>
    ))}
    <g opacity="0.95">
      <circle
        cx="400"
        cy="380"
        r="30"
        fill="none"
        className="stroke-mustard"
        strokeWidth="3"
        strokeDasharray="4 7"
      />
      <text
        x="400"
        y="385"
        textAnchor="middle"
        className="fill-mustard font-display text-[20px] font-extrabold"
      >
        ?
      </text>
    </g>
    <g className="motion-safe:animate-pencil">
      <g transform="translate(424 404) rotate(-138)">
        <rect
          x="0"
          y="-8"
          width="78"
          height="16"
          rx="2"
          className="fill-mustard"
        />
        <rect
          x="0"
          y="-8"
          width="78"
          height="5"
          className="fill-[oklch(0.88_0.13_86.39)]"
        />
        <polygon
          points="0,-8 -20,0 0,8"
          className="fill-[oklch(0.9_0.05_70)]"
        />
        <polygon
          points="-12,-3.2 -20,0 -12,3.2"
          className="fill-night-raised"
        />
        <rect
          x="78"
          y="-8"
          width="10"
          height="16"
          className="fill-[oklch(0.78_0.02_281)]"
        />
        <rect
          x="88"
          y="-8"
          width="12"
          height="16"
          rx="4"
          className="fill-barbie-pink"
        />
      </g>
    </g>
    <g className="font-body text-[13px] font-bold">
      {chips.map((chip) => (
        <g key={chip.label} transform={`translate(${chip.x} ${chip.y})`}>
          <rect width={chip.w} height="36" rx="18" className="fill-paper" />
          <circle cx="20" cy="18" r="6" className={chip.dot} />
          <text x="34" y="23" className="fill-ink">
            {chip.label}
          </text>
        </g>
      ))}
    </g>
  </svg>
);

// The narrow strip that replaces the hero art on phones.
export const PhoneArt = () => (
  <svg
    viewBox="0 0 390 150"
    aria-hidden="true"
    focusable="false"
    className="block h-auto w-full"
  >
    <g fill="none" strokeLinecap="round" strokeWidth="3">
      <path d="M70 80 Q 120 40 180 58" className={TIE} />
      <path d="M180 58 Q 230 96 280 74" className={TIE} />
      <path d="M180 58 Q 186 104 150 122" className="stroke-cerulean" />
      <path
        d="M280 74 Q 318 104 336 120"
        className="stroke-mustard motion-safe:animate-draw"
        strokeDasharray="2 9"
      />
    </g>
    <circle cx="70" cy="82" r="20" className="fill-sea-green-shade" />
    <circle cx="70" cy="79" r="17" className="fill-sea-green" />
    <circle cx="180" cy="60" r="22" className="fill-neon-coral-shade" />
    <circle cx="180" cy="57" r="19" className="fill-neon-coral" />
    <circle cx="280" cy="76" r="22" className="fill-neon-coral-shade" />
    <circle cx="280" cy="73" r="19" className="fill-neon-coral" />
    <circle cx="150" cy="124" r="18" className="fill-neon-coral-shade" />
    <circle cx="150" cy="121" r="15" className="fill-neon-coral" />
    <circle
      cx="340"
      cy="122"
      r="18"
      fill="none"
      className="stroke-mustard"
      strokeWidth="2.5"
      strokeDasharray="3 6"
    />
  </svg>
);
