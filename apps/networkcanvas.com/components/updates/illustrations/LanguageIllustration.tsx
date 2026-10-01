'use client';

import { useLocale, useTranslations } from 'next-intl';

import { cx } from '@codaco/fresco-ui/utils/cva';

import {
  Arm,
  blink,
  Hand,
  NetworkDecor,
  outline,
  RobotHead,
  TAU,
  useIllustrationClock,
} from './RobotParts';

const languages = [
  { locale: 'en-US', code: 'EN', name: 'English', dot: 'fill-cerulean-blue' },
  { locale: 'en-GB', code: 'GB', name: 'English (UK)', dot: 'fill-mustard' },
  { locale: 'es', code: 'ES', name: 'Español', dot: 'fill-neon-coral' },
] as const;

type OrbitItem = {
  code: string;
  name: string;
  dot: string;
  comingSoon?: boolean;
};

const nodes = [
  [90, 120, 14, 'fill-sea-green'],
  [210, 330, 10, 'fill-mustard'],
  [60, 400, 9, 'fill-neon-coral'],
  [1110, 110, 12, 'fill-cerulean-blue'],
  [1040, 380, 14, 'fill-sea-green'],
  [1150, 300, 9, 'fill-neon-coral'],
] as const;

const edges = [
  [0, 1],
  [1, 2],
  [3, 5],
  [5, 4],
] as const;

const LOOP = 8;

type Chip = OrbitItem & {
  width: number;
  depth: number;
  opacity: number;
  transform: string;
};

function LanguageChip({ chip }: { chip: Chip }) {
  return (
    <g transform={chip.transform} opacity={chip.opacity}>
      <rect
        width={chip.width}
        height={48}
        rx={24}
        className={cx('fill-white', outline)}
        strokeWidth={5}
        strokeDasharray={chip.comingSoon ? '10 8' : undefined}
      />
      {chip.comingSoon ? (
        <text
          x={26}
          y={33}
          textAnchor="middle"
          fontSize={28}
          fontWeight={900}
          className={chip.dot}
        >
          +
        </text>
      ) : (
        <circle cx={26} cy={24} r={8} className={chip.dot} />
      )}
      <text
        x={42}
        y={31}
        fontSize={21}
        fontWeight={900}
        className="fill-navy-taupe"
      >
        {chip.name}
      </text>
    </g>
  );
}

export function LanguageIllustration() {
  const locale = useLocale();
  const t = useTranslations('UpdatesPage');
  const orbitItems: OrbitItem[] = [
    ...languages,
    {
      code: '+',
      name: t('moreLanguagesSoon'),
      dot: 'fill-sea-green',
      comingSoon: true,
    },
  ];
  const spacing = TAU / orbitItems.length;
  const localeIndex = Math.max(
    0,
    languages.findIndex((language) => language.locale === locale),
  );
  const startTime =
    ((((0.25 - localeIndex / orbitItems.length) * LOOP) % LOOP) + LOOP) % LOOP;
  const { ref, time } = useIllustrationClock(startTime);
  const loopTime = time % LOOP;

  const bob = Math.sin((TAU * loopTime) / 3);
  const chips: Chip[] = orbitItems.map((language, index) => {
    const angle = (TAU * loopTime) / LOOP + index * spacing;
    const depth = Math.sin(angle);
    const width = language.name.length * 12 + 56;
    const scale = 0.82 + 0.09 * (depth + 1);
    return {
      ...language,
      width,
      depth,
      opacity: 0.55 + 0.225 * (depth + 1),
      transform: `translate(${720 + Math.cos(angle) * 200} ${
        112 + depth * 30
      }) scale(${scale}) translate(${-width / 2} -24)`,
    };
  });
  const front = chips.reduce<number>(
    (best, chip, index) =>
      chip.depth > 0 && (best < 0 || chip.depth > chips[best]!.depth)
        ? index
        : best,
    -1,
  );
  const spin = (TAU * loopTime) / 1.5;

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 460"
      className="font-heading block h-auto w-full overflow-visible"
      aria-hidden
    >
      <NetworkDecor nodes={nodes} edges={edges} time={time} period={3} />
      <ellipse
        cx={550}
        cy={440}
        rx={120 - bob * 7}
        ry={14}
        className="fill-navy-taupe/12"
      />
      {chips
        .filter((chip) => chip.depth <= 0)
        .map((chip) => (
          <LanguageChip key={chip.code} chip={chip} />
        ))}
      <g transform={`translate(420 ${110 + bob * 5})`}>
        <Arm d="M70 240 Q34 262 44 300" />
        <Hand x={44} y={306} />
        <Arm d="M192 238 Q262 214 286 118" />
        <rect
          x={60}
          y={206}
          width={140}
          height={124}
          rx={44}
          className={cx('fill-neon-coral', outline)}
          strokeWidth={6}
        />
        <rect
          x={94}
          y={240}
          width={72}
          height={48}
          rx={16}
          className="fill-navy-taupe"
        />
        <text
          x={130}
          y={272}
          textAnchor="middle"
          fontSize={24}
          fontWeight={900}
          className="fill-sea-green"
        >
          {front >= 0 ? orbitItems[front]!.code : 'EN'}
        </text>
        <RobotHead
          tilt={-4 + bob * 2}
          antennaClassName="fill-mustard"
          eyeHeight={17 * blink(loopTime, [2.2, 4.8])}
        />
        <g
          transform={`translate(300 18) rotate(${Math.sin(spin) * 4})`}
          strokeWidth={4}
          fill="none"
        >
          <circle
            r={78}
            className={cx('fill-cerulean-blue', outline)}
            strokeWidth={6}
          />
          {[0, 1, 2].map((meridian) => (
            <ellipse
              key={meridian}
              rx={Math.max(
                0.5,
                78 * Math.abs(Math.cos(spin + (meridian * Math.PI) / 3)),
              )}
              ry={78}
              className="stroke-white"
              opacity={0.75}
            />
          ))}
          <line
            x1={-78}
            x2={78}
            y1={0}
            y2={0}
            className="stroke-white"
            opacity={0.8}
          />
          <path
            d="M-66 -40 Q0 -28 66 -40"
            className="stroke-white"
            opacity={0.6}
          />
          <path
            d="M-66 40 Q0 28 66 40"
            className="stroke-white"
            opacity={0.6}
          />
          <circle r={78} className={outline} strokeWidth={6} />
        </g>
        <Hand x={287} y={112} />
      </g>
      {chips
        .filter((chip) => chip.depth > 0)
        .map((chip) => (
          <LanguageChip key={chip.code} chip={chip} />
        ))}
    </svg>
  );
}
