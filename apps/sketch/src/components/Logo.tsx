import { useId } from 'react';

// The Sketch mark: the Interviewer network with a pencil still drawing its
// last person in. Drawn like the other Network Canvas app icons, in one colour
// on a light tile. public/favicon.svg is a simplified cut of it for 16px.
export const LogoMark = ({ size = 44 }: { size?: number }) => {
  const id = useId();
  const tile = `${id}-tile`;
  const glow = `${id}-glow`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      aria-hidden="true"
      focusable="false"
      className="flex-none"
    >
      <defs>
        <linearGradient id={tile} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fbfbfa" />
          <stop offset="1" stopColor="#e9e8e4" />
        </linearGradient>
        <filter id={glow} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow
            dx="0"
            dy="10"
            stdDeviation="16"
            floodColor="#d99a00"
            floodOpacity="0.32"
          />
        </filter>
      </defs>
      <rect width="1024" height="1024" rx="232" fill={`url(#${tile})`} />
      <g filter={`url(#${glow})`}>
        <g stroke="#f2b500" strokeWidth="40" strokeLinecap="round">
          <line x1="280" y1="400" x2="610" y2="300" />
          <line x1="280" y1="400" x2="560" y2="740" />
        </g>
        <circle cx="280" cy="400" r="100" fill="#f2b500" />
        <circle cx="247" cy="367" r="29" fill="#fbe1a0" />
        <circle cx="610" cy="300" r="76" fill="#f2b500" />
        <circle cx="585" cy="275" r="22" fill="#fbe1a0" />
        <circle cx="560" cy="740" r="104" fill="#fbe1a0" />
        <path
          d="M667.4 678 A124 124 0 0 1 452.6 802"
          fill="none"
          stroke="#f2b500"
          strokeWidth="22"
          strokeDasharray="0.1 44"
          strokeLinecap="round"
        />
        <path
          d="M452.6 802 A124 124 0 0 1 667.4 678"
          fill="none"
          stroke="#f2b500"
          strokeWidth="40"
          strokeLinecap="round"
        />
        <g transform="translate(667.4 678) rotate(-55) scale(0.72)">
          <path
            d="M0 0 L150 -60 Q160 -40 150 -20 Q160 0 150 20 Q160 40 150 60 Z"
            fill="#fbe1a0"
          />
          <path d="M0 0 L50 -20 L50 20 Z" fill="#7a5200" />
          <rect x="150" y="-60" width="320" height="120" fill="#f2b500" />
          <rect
            x="150"
            y="-60"
            width="320"
            height="40"
            fill="#ffffff"
            opacity="0.28"
          />
          <rect
            x="150"
            y="20"
            width="320"
            height="40"
            fill="#d99a00"
            opacity="0.35"
          />
          <rect x="470" y="-60" width="56" height="120" fill="#d99a00" />
          <g fill="#f2b500" opacity="0.6">
            <rect x="484" y="-60" width="10" height="120" />
            <rect x="504" y="-60" width="10" height="120" />
          </g>
          <path
            d="M526 -60 H560 a30 30 0 0 1 30 30 V30 a30 30 0 0 1 -30 30 H526 Z"
            fill="#fbe1a0"
          />
        </g>
      </g>
    </svg>
  );
};
