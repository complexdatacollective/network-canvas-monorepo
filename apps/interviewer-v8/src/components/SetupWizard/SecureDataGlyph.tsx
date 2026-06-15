// Playful illustrative glyph: a tilted database cylinder with a padlock
// hugging its corner, plus a sparkle. Monochrome via currentColor so it
// inherits the tint of its container (e.g. text-primary).
export default function SecureDataGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-6"
    >
      <g transform="rotate(-5 10 11)">
        <ellipse
          cx={10}
          cy={6.6}
          rx={6}
          ry={2.3}
          fill="currentColor"
          fillOpacity={0.15}
        />
        <path d="M4 6.6 V14.4 c0 1.2 2.1 2.2 5 2.3" />
        <path d="M16 6.6 V10.4" />
        <path d="M4 10.5 c0 1.27 2.69 2.3 6 2.3 c1.05 0 2.04-.1 2.9-.29" />
      </g>
      <g transform="rotate(7 16.5 16)">
        <path d="M14.6 13.2 v-1.5 a1.9 1.9 0 0 1 3.8 0 v1.5" />
        <rect
          x={12.8}
          y={13.2}
          width={7.4}
          height={6.2}
          rx={1.7}
          fill="currentColor"
          fillOpacity={0.15}
        />
        <circle cx={16.5} cy={15.9} r={1} fill="currentColor" stroke="none" />
        <path d="M16.5 16.8 v0.9" strokeWidth={1.4} />
      </g>
      <path
        d="M19.5 2.5 C19.7 4.1 20 4.4 21.6 4.6 C20 4.8 19.7 5.1 19.5 6.7 C19.3 5.1 19 4.8 17.4 4.6 C19 4.4 19.3 4.1 19.5 2.5 Z"
        fill="currentColor"
        stroke="none"
      />
      <circle cx={16.6} cy={3.1} r={0.8} fill="currentColor" stroke="none" />
    </svg>
  );
}
