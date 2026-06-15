// Playful illustrative glyph: a chunky key tilted upward with sparkles,
// matching SecureDataGlyph's visual language (soft fill, round strokes).
// Monochrome via currentColor so it inherits the container tint.
export default function AuthorisationGlyph() {
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
      <g transform="rotate(-28 12 12)">
        <circle
          cx={6.2}
          cy={12}
          r={3.5}
          fill="currentColor"
          fillOpacity={0.15}
        />
        <circle cx={6.2} cy={12} r={1.1} strokeWidth={1.4} />
        <path d="M9.7 12 H20.3" />
        <path d="M17.1 12 v2.4" />
        <path d="M20.3 12 v3.1" />
      </g>
      <path
        d="M5.2 2.4 C5.4 3.9 5.7 4.2 7.2 4.4 C5.7 4.6 5.4 4.9 5.2 6.4 C5 4.9 4.7 4.6 3.2 4.4 C4.7 4.2 5 3.9 5.2 2.4 Z"
        fill="currentColor"
        stroke="none"
      />
      <circle cx={20} cy={18} r={0.8} fill="currentColor" stroke="none" />
    </svg>
  );
}
