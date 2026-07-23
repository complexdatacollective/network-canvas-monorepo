import type { InterfaceMotif } from './summerUpdateContent';

const graphicProps = {
  'width': 76,
  'height': 56,
  'viewBox': '0 0 76 56',
  'aria-hidden': true,
  'focusable': false,
  'fill': 'none',
  'strokeWidth': 2,
  'strokeLinecap': 'round',
  'strokeLinejoin': 'round',
  'className': 'stroke-current',
} as const;

export function InterfaceGraphic({ motif }: { motif: InterfaceMotif }) {
  switch (motif) {
    case 'geospatial':
      return (
        <svg {...graphicProps}>
          <rect x="5" y="7" width="66" height="42" rx="9" strokeOpacity=".3" />
          <path
            d="M14 39c7-13 12-17 22-14 8 2 11-6 25-8"
            strokeOpacity=".45"
            strokeDasharray="4 4"
          />
          <path
            d="M10 31 23 13l17 6 11-7 14 8-5 22-23 3Z"
            className="fill-sea-serpent stroke-sea-serpent"
            fillOpacity=".12"
            strokeOpacity=".7"
          />
          <circle
            cx="25"
            cy="25"
            r="5.5"
            className="fill-neon-coral stroke-none"
          />
          <circle
            cx="48"
            cy="33"
            r="4.5"
            className="fill-mustard stroke-none"
          />
          <circle
            cx="58"
            cy="17"
            r="3.5"
            className="fill-sea-serpent stroke-none"
          />
        </svg>
      );
    case 'anonymisation':
      return (
        <svg {...graphicProps}>
          <circle
            cx="38"
            cy="28"
            r="23"
            strokeOpacity=".25"
            strokeDasharray="3 5"
          />
          <path d="M29 24v-4a9 9 0 0 1 18 0v4" strokeOpacity=".65" />
          <rect
            x="25"
            y="23"
            width="26"
            height="23"
            rx="6"
            className="fill-kiwi stroke-none"
          />
          <circle
            cx="38"
            cy="32"
            r="2.5"
            className="fill-slate-blue stroke-none"
          />
          <path d="M38 34.5v4" className="stroke-slate-blue" />
          <circle
            cx="12"
            cy="24"
            r="4"
            className="fill-neon-coral stroke-none"
            fillOpacity=".45"
          />
          <circle
            cx="64"
            cy="35"
            r="4"
            className="fill-sea-serpent stroke-none"
            fillOpacity=".45"
          />
        </svg>
      );
    case 'one-to-many':
      return (
        <svg {...graphicProps}>
          <g strokeOpacity=".5">
            <path d="M21 28 55 11" />
            <path d="M21 28h40" />
            <path d="m21 28 34 17" />
          </g>
          <circle
            cx="18"
            cy="28"
            r="8"
            className="fill-neon-coral stroke-none"
          />
          <circle
            cx="57"
            cy="10"
            r="5"
            className="fill-sea-serpent stroke-none"
          />
          <circle
            cx="62"
            cy="28"
            r="5"
            className="fill-paradise-pink stroke-none"
          />
          <circle
            cx="57"
            cy="46"
            r="5"
            className="fill-neon-carrot stroke-none"
          />
        </svg>
      );
    case 'family-pedigree':
      return (
        <svg {...graphicProps}>
          <g strokeOpacity=".5">
            <path d="M27 13h20M37 13v15M20 28h34M20 28v10M37 28v10M54 28v10" />
          </g>
          <rect
            x="19"
            y="7"
            width="12"
            height="12"
            className="fill-sea-serpent stroke-none"
          />
          <circle
            cx="51"
            cy="13"
            r="6"
            className="fill-paradise-pink stroke-none"
          />
          <circle cx="20" cy="44" r="6" className="fill-mustard stroke-none" />
          <rect
            x="31"
            y="38"
            width="12"
            height="12"
            className="fill-neon-coral stroke-none"
          />
          <circle cx="54" cy="44" r="6" className="fill-kiwi stroke-none" />
        </svg>
      );
    case 'narrative-pedigree':
      return (
        <svg {...graphicProps}>
          <g strokeOpacity=".3">
            <path d="M25 13h20M35 13v14M19 27h32M19 27v11M35 27v11M51 27v11" />
          </g>
          <path d="M25 13h10v14H19v11" className="stroke-neon-coral" />
          <rect
            x="17"
            y="7"
            width="12"
            height="12"
            className="fill-neon-coral stroke-none"
          />
          <circle cx="49" cy="13" r="6" strokeOpacity=".45" />
          <circle
            cx="19"
            cy="44"
            r="6"
            className="fill-neon-coral stroke-none"
          />
          <rect x="29" y="38" width="12" height="12" strokeOpacity=".45" />
          <circle cx="51" cy="44" r="6" strokeOpacity=".45" />
          <path
            d="m55 8 3 3 6-7"
            className="stroke-sea-green"
            strokeWidth="2.5"
          />
        </svg>
      );
    case 'network-composer':
      return (
        <svg {...graphicProps}>
          <g strokeOpacity=".45">
            <path d="m14 42 20-29 25 8-7 24-38-3Z" />
            <path d="m14 42 18-10 27-11M32 32l2-19M32 32l20 13" />
          </g>
          <circle
            cx="14"
            cy="42"
            r="6"
            className="fill-neon-coral stroke-none"
          />
          <circle
            cx="34"
            cy="13"
            r="5"
            className="fill-sea-serpent stroke-none"
          />
          <circle cx="59" cy="21" r="7" className="fill-mustard stroke-none" />
          <circle cx="52" cy="45" r="5" className="fill-kiwi stroke-none" />
          <circle
            cx="32"
            cy="32"
            r="4"
            className="fill-paradise-pink stroke-none"
          />
          <circle
            cx="65"
            cy="9"
            r="7"
            className="fill-slate-blue stroke-none"
          />
          <path d="M61.5 9h7M65 5.5v7" className="stroke-slate-blue" />
        </svg>
      );
    case 'validation':
      return (
        <svg {...graphicProps}>
          <rect x="7" y="8" width="40" height="40" rx="7" strokeOpacity=".35" />
          <path d="M16 19h20M16 28h13M16 37h17" strokeOpacity=".45" />
          <circle
            cx="57"
            cy="28"
            r="13"
            className="fill-sea-green stroke-none"
          />
          <path
            d="m50.5 28 4.5 4.5 9-10"
            className="stroke-slate-blue"
            strokeWidth="2.5"
          />
        </svg>
      );
    case 'enhanced-skip-logic':
      return (
        <svg {...graphicProps}>
          <path d="M12 37h15" strokeOpacity=".45" />
          <path d="M32 37h13" strokeOpacity=".25" strokeDasharray="3 4" />
          <path d="M50 37h14" strokeOpacity=".45" />
          <path d="M17 29c3-19 30-21 40-6" className="stroke-sea-serpent" />
          <path
            d="m52 20 6 3-4 6"
            className="stroke-sea-serpent"
            strokeWidth="2.5"
          />
          <circle
            cx="12"
            cy="37"
            r="5"
            className="fill-cerulean-blue stroke-none"
          />
          <circle cx="31" cy="37" r="5" strokeOpacity=".3" />
          <circle cx="49" cy="37" r="5" strokeOpacity=".3" />
          <circle cx="65" cy="37" r="6" className="fill-kiwi stroke-none" />
        </svg>
      );
    case 'node-shapes':
      return (
        <svg {...graphicProps}>
          <path d="M25 28h10M51 28h8" strokeOpacity=".35" />
          <circle
            cx="17"
            cy="28"
            r="9"
            className="fill-neon-coral stroke-none"
          />
          <rect
            x="35"
            y="20"
            width="16"
            height="16"
            rx="3"
            className="fill-sea-serpent stroke-none"
          />
          <path
            d="m65 18 10 10-10 10-10-10Z"
            className="fill-mustard stroke-none"
          />
        </svg>
      );
    case 'form-hints':
      return (
        <svg {...graphicProps}>
          <rect x="7" y="7" width="47" height="42" rx="7" strokeOpacity=".35" />
          <path d="M16 18h25M16 27h18M16 36h23" strokeOpacity=".45" />
          <circle cx="58" cy="18" r="11" className="fill-mustard stroke-none" />
          <path d="M58 17v7" className="stroke-slate-blue" />
          <circle
            cx="58"
            cy="13"
            r="1.4"
            className="fill-slate-blue stroke-none"
          />
          <path d="m54 27-5 6 9-4" className="fill-mustard stroke-none" />
        </svg>
      );
    case 'templates':
      return (
        <svg {...graphicProps}>
          <rect x="9" y="21" width="46" height="29" rx="6" strokeOpacity=".2" />
          <rect
            x="15"
            y="14"
            width="46"
            height="29"
            rx="6"
            strokeOpacity=".4"
          />
          <rect
            x="21"
            y="7"
            width="46"
            height="29"
            rx="6"
            className="fill-slate-blue stroke-slate-blue"
            fillOpacity=".16"
          />
          <circle
            cx="32"
            cy="20"
            r="3"
            className="fill-neon-coral stroke-none"
          />
          <circle
            cx="44"
            cy="20"
            r="3"
            className="fill-sea-serpent stroke-none"
          />
          <circle cx="56" cy="20" r="3" className="fill-mustard stroke-none" />
          <path d="M30 28h28" strokeOpacity=".35" />
        </svg>
      );
    case 'synthetic-data':
      return (
        <svg {...graphicProps}>
          <g strokeOpacity=".35" strokeDasharray="3 4">
            <path d="m19 18 19 10 19-15M38 28l23 14M38 28 20 44" />
            <circle cx="19" cy="18" r="5" />
            <circle cx="57" cy="13" r="4" />
            <circle cx="61" cy="42" r="5" />
            <circle cx="20" cy="44" r="4" />
          </g>
          <circle
            cx="38"
            cy="28"
            r="8"
            className="fill-paradise-pink stroke-none"
          />
          <path
            d="M38 13v5M38 38v5M23 28h5M48 28h5"
            className="stroke-paradise-pink"
          />
        </svg>
      );
    case 'multi-user':
      return (
        <svg {...graphicProps}>
          <g strokeOpacity=".35">
            <path d="m18 18 20 12 20-12M38 30v13" />
          </g>
          <rect
            x="29"
            y="23"
            width="18"
            height="15"
            rx="4"
            className="fill-slate-blue stroke-none"
          />
          <circle
            cx="18"
            cy="13"
            r="6"
            className="fill-neon-coral stroke-none"
          />
          <path d="M8 28c1-6 5-9 10-9s9 3 10 9" className="stroke-neon-coral" />
          <circle
            cx="58"
            cy="13"
            r="6"
            className="fill-sea-serpent stroke-none"
          />
          <path
            d="M48 28c1-6 5-9 10-9s9 3 10 9"
            className="stroke-sea-serpent"
          />
          <circle cx="38" cy="44" r="7" className="fill-mustard stroke-none" />
        </svg>
      );
    case 'advanced-export-filtering':
      return (
        <svg {...graphicProps}>
          <rect x="7" y="7" width="43" height="42" rx="6" strokeOpacity=".35" />
          <path d="M7 18h43M20 18v31M20 28h30M20 38h23" strokeOpacity=".35" />
          <path
            d="M44 12h26L60 24v10l-7 5V24Z"
            className="fill-sea-serpent stroke-sea-serpent"
            fillOpacity=".18"
          />
          <path
            d="m46 44 5 5 10-11"
            className="stroke-sea-green"
            strokeWidth="2.5"
          />
        </svg>
      );
    case 'secure-data-api':
      return (
        <svg {...graphicProps}>
          <path d="m19 17-9 11 9 11M57 17l9 11-9 11" strokeOpacity=".45" />
          <ellipse cx="38" cy="14" rx="13" ry="5" strokeOpacity=".4" />
          <path
            d="M25 14v24c0 3 6 5 13 5s13-2 13-5V14M25 26c0 3 6 5 13 5s13-2 13-5"
            strokeOpacity=".4"
          />
          <rect
            x="31"
            y="25"
            width="14"
            height="13"
            rx="3"
            className="fill-kiwi stroke-none"
          />
          <path d="M34 25v-3a4 4 0 0 1 8 0v3" className="stroke-kiwi" />
          <circle
            cx="38"
            cy="31"
            r="1.8"
            className="fill-slate-blue stroke-none"
          />
        </svg>
      );
    case 'encryption-at-rest':
      return (
        <svg {...graphicProps}>
          <ellipse
            cx="31"
            cy="13"
            rx="20"
            ry="7"
            className="fill-cerulean-blue stroke-cerulean-blue"
            fillOpacity=".14"
          />
          <path
            d="M11 13v27c0 4 9 7 20 7 6 0 11-1 15-3M11 26c0 4 9 7 20 7 5 0 10-1 14-3"
            strokeOpacity=".45"
          />
          <path d="M45 31v-5a7 7 0 0 1 14 0v5" strokeOpacity=".65" />
          <rect
            x="41"
            y="30"
            width="22"
            height="18"
            rx="5"
            className="fill-neon-coral stroke-none"
          />
          <circle
            cx="52"
            cy="38"
            r="2"
            className="fill-slate-blue stroke-none"
          />
          <path d="M52 40v3" className="stroke-slate-blue" />
        </svg>
      );
    case 'authorisation-checks':
      return (
        <svg {...graphicProps}>
          <rect x="7" y="9" width="39" height="38" rx="7" strokeOpacity=".35" />
          <circle
            cx="20"
            cy="22"
            r="6"
            className="fill-cerulean-blue stroke-none"
          />
          <path
            d="M13 37c1-6 4-9 7-9s6 3 7 9M32 19h8M32 26h8"
            strokeOpacity=".4"
          />
          <path d="M46 28h7" strokeOpacity=".3" strokeDasharray="3 4" />
          <circle
            cx="61"
            cy="28"
            r="11"
            className="fill-sea-green stroke-none"
          />
          <path
            d="m55 28 4 4 8-9"
            className="stroke-slate-blue"
            strokeWidth="2.5"
          />
        </svg>
      );
    case 'responsive-sociogram-backgrounds':
      return (
        <svg {...graphicProps}>
          <rect x="5" y="7" width="66" height="42" rx="8" strokeOpacity=".3" />
          <path
            d="M7 37 23 15l16 10 17-13 13 18"
            className="stroke-sea-serpent"
            strokeOpacity=".35"
          />
          <g strokeOpacity=".4">
            <path d="m17 36 19-17 22 19M17 36l20 6 21-4M36 19l1 23" />
          </g>
          <circle
            cx="17"
            cy="36"
            r="5"
            className="fill-neon-coral stroke-none"
          />
          <circle cx="36" cy="19" r="6" className="fill-mustard stroke-none" />
          <circle cx="37" cy="42" r="4" className="fill-kiwi stroke-none" />
          <circle
            cx="58"
            cy="38"
            r="5"
            className="fill-sea-serpent stroke-none"
          />
          <rect
            x="49"
            y="11"
            width="16"
            height="25"
            rx="4"
            className="stroke-slate-blue"
            strokeWidth="1.5"
          />
        </svg>
      );
  }

  const exhaustiveMotif: never = motif;
  return exhaustiveMotif;
}
