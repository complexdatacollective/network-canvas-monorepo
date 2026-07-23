'use client';

import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useTransform,
} from 'motion/react';
import { useTranslations } from 'next-intl';
import { useRef, useSyncExternalStore } from 'react';

const subscribeToHydration = () => () => undefined;
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

type ProtocolMigrationIllustrationProps = {
  className?: string;
};

export function ProtocolMigrationIllustration({
  className,
}: ProtocolMigrationIllustrationProps) {
  const t = useTranslations('SummerUpdate.compatibility.illustration');
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const hasHydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );
  const motionEnabled = hasHydrated && shouldReduceMotion === false;
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start 92%', 'end -8%'],
  });
  const completedProgress = useMotionValue(1);
  const scrollLinkedProgress = useTransform(
    scrollYProgress,
    [0.04, 0.48],
    [0, 1],
  );
  const progress = motionEnabled ? scrollLinkedProgress : completedProgress;
  const illustrationOpacity = useTransform(
    scrollYProgress,
    [0, 0.12, 0.82, 1],
    [0.35, 1, 1, 0],
  );
  const illustrationY = useTransform(
    scrollYProgress,
    [0, 0.18, 0.82, 1],
    [18, 0, 0, -14],
  );
  const sourceOpacity = useTransform(progress, [0, 0.18], [0.3, 1]);
  const sourceGhostOpacity = useTransform(progress, [0, 0.18], [0.12, 0.52]);
  const sourceScale = useTransform(progress, [0, 0.2], [0.88, 1]);
  const sourceY = useTransform(progress, [0, 0.2], [20, 0]);
  const gateOpacity = useTransform(progress, [0.18, 0.42], [0, 1]);
  const forwardPathLength = useTransform(progress, [0.2, 0.58], [0, 1]);
  const targetOpacity = useTransform(progress, [0.42, 0.7], [0, 1]);
  const targetScale = useTransform(progress, [0.4, 0.72], [0.84, 1]);
  const targetY = useTransform(progress, [0.4, 0.72], [18, 0]);
  const returnPathLength = useTransform(progress, [0.7, 0.93], [0, 1]);
  const stopOpacity = useTransform(progress, [0.86, 0.98], [0, 1]);
  const stopScale = useTransform(progress, [0.86, 1], [0.65, 1]);

  return (
    <div
      ref={containerRef}
      className={['w-full', className].filter(Boolean).join(' ')}
    >
      <motion.svg
        viewBox="0 0 560 360"
        fill="none"
        aria-hidden="true"
        focusable="false"
        className="block h-auto w-full"
        xmlns="http://www.w3.org/2000/svg"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={
          motionEnabled
            ? {
                opacity: illustrationOpacity,
                y: illustrationY,
              }
            : undefined
        }
      >
        <motion.path
          d="M198 151h176"
          className="stroke-sea-serpent"
          strokeWidth="30"
          strokeOpacity=".12"
          style={{ pathLength: forwardPathLength }}
        />
        <motion.path
          d="M438 255v18c0 25-20 44-45 44H237"
          className="stroke-neon-coral"
          strokeWidth="2.5"
          strokeOpacity=".65"
          strokeDasharray="7 9"
          style={{ pathLength: returnPathLength }}
        />
        <motion.path
          d="m249 307-12 10 12 10"
          className="stroke-neon-coral"
          strokeWidth="3"
          strokeOpacity=".75"
          style={{ pathLength: returnPathLength }}
        />

        <motion.g style={{ opacity: gateOpacity }}>
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
        </motion.g>

        <motion.path
          d="M198 151h164"
          className="stroke-sea-serpent"
          strokeWidth="3.5"
          style={{ pathLength: forwardPathLength }}
        />
        <motion.path
          d="m346 135 16 16-16 16"
          className="stroke-sea-serpent"
          strokeWidth="4"
          style={{ pathLength: forwardPathLength }}
        />
        <motion.g style={{ opacity: gateOpacity }}>
          <circle cx="232" cy="151" r="4" className="fill-sea-serpent" />
          <circle cx="259" cy="151" r="4" className="fill-sea-serpent" />
          <circle cx="305" cy="151" r="4" className="fill-sea-serpent" />
          <circle cx="332" cy="151" r="4" className="fill-sea-serpent" />
        </motion.g>

        <motion.g
          opacity=".52"
          style={{
            opacity: sourceGhostOpacity,
            scale: sourceScale,
            y: sourceY,
          }}
        >
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
        </motion.g>
        <motion.g
          style={{ opacity: sourceOpacity, scale: sourceScale, y: sourceY }}
        >
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
            {t('schema')}
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
        </motion.g>

        <motion.g
          style={{ opacity: targetOpacity, scale: targetScale, y: targetY }}
        >
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
            {t('schema')}
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
        </motion.g>

        <motion.g style={{ opacity: sourceOpacity }}>
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
            {t('original')}
          </text>
        </motion.g>

        <motion.g
          style={{
            opacity: stopOpacity,
            scale: stopScale,
            transformOrigin: '204px 317px',
          }}
        >
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
        </motion.g>
      </motion.svg>
    </div>
  );
}
