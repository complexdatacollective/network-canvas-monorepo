type ProtocolMigrationIllustrationProps = {
  className?: string;
};

export function ProtocolMigrationIllustration({
  className,
}: ProtocolMigrationIllustrationProps) {
  return (
    <svg
      viewBox="0 0 560 360"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={['block h-auto w-full', className].filter(Boolean).join(' ')}
      xmlns="http://www.w3.org/2000/svg"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        d="M198 151h176"
        className="stroke-sea-serpent"
        strokeWidth="30"
        strokeOpacity=".12"
      />
      <path
        d="M438 255v18c0 25-20 44-45 44H237"
        className="stroke-neon-coral"
        strokeWidth="2.5"
        strokeOpacity=".65"
        strokeDasharray="7 9"
      />
      <path
        d="m249 307-12 10 12 10"
        className="stroke-neon-coral"
        strokeWidth="3"
        strokeOpacity=".75"
      />

      <g>
        <ellipse
          cx="282"
          cy="151"
          rx="42"
          ry="76"
          className="fill-sea-serpent stroke-sea-serpent"
          fillOpacity=".035"
          strokeOpacity=".14"
          strokeWidth="2"
        />
        <ellipse
          cx="282"
          cy="151"
          rx="29"
          ry="64"
          className="stroke-sea-serpent"
          strokeOpacity=".28"
          strokeWidth="2.5"
        />
        <ellipse
          cx="282"
          cy="151"
          rx="16"
          ry="51"
          className="stroke-sea-serpent"
          strokeOpacity=".5"
          strokeWidth="3"
        />
        <circle
          cx="265"
          cy="105"
          r="4"
          className="fill-mustard"
          fillOpacity=".8"
        />
        <circle
          cx="297"
          cy="194"
          r="5"
          className="fill-sea-green"
          fillOpacity=".75"
        />
      </g>

      <path d="M198 151h164" className="stroke-sea-serpent" strokeWidth="3.5" />
      <path
        d="m346 135 16 16-16 16"
        className="stroke-sea-serpent"
        strokeWidth="4"
      />
      <circle cx="232" cy="151" r="4" className="fill-sea-serpent" />
      <circle cx="259" cy="151" r="4" className="fill-sea-serpent" />
      <circle cx="305" cy="151" r="4" className="fill-sea-serpent" />
      <circle cx="332" cy="151" r="4" className="fill-sea-serpent" />

      <g opacity=".52">
        <path
          d="M48 82h94l34 34v164H48Z"
          className="fill-surface-2 stroke-text"
          fillOpacity=".8"
          strokeOpacity=".3"
          strokeWidth="2"
        />
        <path
          d="M142 82v34h34"
          className="stroke-text"
          strokeOpacity=".3"
          strokeWidth="2"
        />
        <path
          d="M72 158h77M72 177h56M72 196h68"
          className="stroke-text"
          strokeOpacity=".22"
          strokeWidth="2"
        />
      </g>
      <g>
        <path
          d="M79 48h94l34 34v177H79Z"
          className="fill-surface-1 stroke-text"
          strokeOpacity=".3"
          strokeWidth="2.5"
        />
        <path
          d="M173 48v34h34"
          className="stroke-text"
          strokeOpacity=".3"
          strokeWidth="2.5"
        />
        <text
          x="106"
          y="88"
          className="fill-text font-monospace font-semibold"
          fillOpacity=".52"
          fontSize="11"
          letterSpacing="2"
        >
          SCHEMA
        </text>
        <text
          x="105"
          y="135"
          className="fill-text font-monospace font-bold"
          fontSize="43"
        >
          7
        </text>

        <g className="stroke-text" strokeOpacity=".28" strokeWidth="2">
          <path d="m108 203 29-35 34 18-15 41-48-24Z" />
          <path d="m108 203 48 24M137 168l19 59M108 203l63-17" />
        </g>
        <circle
          cx="108"
          cy="203"
          r="8"
          className="fill-mustard stroke-surface-1"
          strokeWidth="3"
        />
        <circle
          cx="137"
          cy="168"
          r="6"
          className="fill-text stroke-surface-1"
          fillOpacity=".45"
          strokeWidth="3"
        />
        <circle
          cx="171"
          cy="186"
          r="7"
          className="fill-sea-serpent stroke-surface-1"
          strokeWidth="3"
        />
        <circle
          cx="156"
          cy="227"
          r="6"
          className="fill-text stroke-surface-1"
          fillOpacity=".3"
          strokeWidth="3"
        />
      </g>

      <g>
        <path
          d="M362 43h108l36 36v182H362Z"
          className="fill-surface-1 stroke-sea-green"
          strokeOpacity=".75"
          strokeWidth="2.5"
        />
        <path
          d="M362 43h108l36 36v182H362Z"
          className="fill-sea-green"
          fillOpacity=".065"
        />
        <path
          d="M470 43v36h36"
          className="stroke-sea-green"
          strokeOpacity=".75"
          strokeWidth="2.5"
        />
        <text
          x="392"
          y="87"
          className="fill-sea-green font-monospace font-semibold"
          fontSize="11"
          letterSpacing="2"
        >
          SCHEMA
        </text>
        <text
          x="390"
          y="134"
          className="fill-sea-green font-monospace font-bold"
          fontSize="43"
        >
          8
        </text>

        <g className="stroke-sea-green" strokeOpacity=".42" strokeWidth="2">
          <path d="m392 206 29-40 38 12 22 35-37 25-52-32Z" />
          <path d="m392 206 52 32M421 166l23 72M421 166l60 47M392 206l67-28M459 178l-15 60" />
        </g>
        <circle
          cx="392"
          cy="206"
          r="8"
          className="fill-mustard stroke-surface-1"
          strokeWidth="3"
        />
        <circle
          cx="421"
          cy="166"
          r="7"
          className="fill-sea-serpent stroke-surface-1"
          strokeWidth="3"
        />
        <circle
          cx="459"
          cy="178"
          r="8"
          className="fill-neon-coral stroke-surface-1"
          strokeWidth="3"
        />
        <circle
          cx="481"
          cy="213"
          r="6"
          className="fill-sea-green stroke-surface-1"
          strokeWidth="3"
        />
        <circle
          cx="444"
          cy="238"
          r="7"
          className="fill-paradise-pink stroke-surface-1"
          strokeWidth="3"
        />
      </g>

      <g>
        <rect
          x="52"
          y="261"
          width="100"
          height="25"
          rx="12.5"
          className="fill-mustard"
        />
        <circle cx="68" cy="273.5" r="3.5" className="fill-rich-black" />
        <path
          d="m66 273.5 1.5 1.5 3-3.5"
          className="stroke-mustard"
          strokeWidth="1.4"
        />
        <text
          x="110"
          y="277"
          textAnchor="middle"
          className="fill-rich-black font-monospace font-bold"
          fontSize="10"
          letterSpacing="1.3"
        >
          ORIGINAL
        </text>
      </g>

      <g>
        <circle
          cx="204"
          cy="317"
          r="17"
          className="fill-surface-1 stroke-neon-coral"
          strokeWidth="3"
        />
        <path
          d="m193 306 22 22"
          className="stroke-neon-coral"
          strokeWidth="4"
        />
      </g>
    </svg>
  );
}
