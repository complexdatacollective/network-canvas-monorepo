// The Sketch mark: three nodes, two drawn ties and one pencilled in.
export const LogoMark = ({ size = 44 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 44 44"
    aria-hidden="true"
    focusable="false"
    className="flex-none"
  >
    <rect
      x="1"
      y="1"
      width="42"
      height="42"
      rx="13"
      className="fill-night-raised stroke-night-border"
      strokeWidth="1.5"
    />
    <path
      d="M13 29 L22 13 L31 28"
      fill="none"
      className="stroke-white"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M14 30 Q22 34.5 30.5 29"
      fill="none"
      className="stroke-mustard"
      strokeWidth="2.5"
      strokeDasharray="0.5 4.5"
      strokeLinecap="round"
    />
    <circle cx="22" cy="13" r="5.5" className="fill-neon-coral" />
    <circle cx="13" cy="29" r="5.5" className="fill-sea-green" />
    <circle cx="31" cy="28" r="5.5" className="fill-cerulean" />
  </svg>
);
