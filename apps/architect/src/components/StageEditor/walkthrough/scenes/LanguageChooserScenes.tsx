import { X } from 'lucide-react';

import { backOut, segment } from '@codaco/art/illustration/motion';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { Card, Heading } from './InterpreterScenes';
import {
  Chip,
  Click,
  CONTENT,
  defineScene,
  lerp,
  NEXT_BUTTON,
  pivot,
  pressAt,
  smooth,
  STAGE,
  STAGE_CENTER_X,
  TextBar,
  type Point,
} from './parts';

const TEXT = {
  heading: 'Choose a language',
  autonyms: ['Deutsch', 'English', 'español', 'français'],
  nowIn: 'Now shown in español',
  later: 'Every later screen in español',
  tab: 'This browser tab',
  kept: 'Kept when the page reloads',
  gone: 'Gone once the tab closes',
  exported: 'Exported data',
  notRecorded: 'No language recorded',
  notSaved: 'Not saved with the interview',
  noEntities: 'No nodes or edges',
  protocol: 'Protocol',
  stages: ['Language', 'Welcome', 'About you', 'Contacts'],
  chosenFirst: 'Chosen on the first screen',
  chosen: 'español',
  languages: 'Languages',
  chooser: 'Language Chooser',
  names: ['English', 'French', 'German', 'Spanish'],
  defaultBadge: 'Default',
  add: 'Add languages',
} as const;

/* ------------------------------------------------------------- pieces */

/** The chooser's raised surface, centered beside the rail. */
const SURFACE = {
  x: STAGE_CENTER_X - 190,
  y: STAGE.y + 18,
  width: 380,
  height: 292,
} as const;
const OPTION = {
  x: SURFACE.x + 30,
  y: SURFACE.y + 80,
  width: 320,
  height: 40,
  step: 50,
} as const;
const optionCenter = (i: number): Point => [
  OPTION.x + OPTION.width / 2,
  OPTION.y + i * OPTION.step + OPTION.height / 2,
];

/**
 * One language as the interview's option cards draw it: a bordered card with
 * a radio dot before the language's own name. The chosen card's border and
 * dot take the primary color.
 */
function LanguageOption({
  x,
  y,
  width,
  height,
  text,
  picked,
  size = 17,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  picked: boolean;
  size?: number;
}) {
  const dot: Point = [x + 24, y + height / 2];
  return (
    <>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={8}
        className={cx(
          'fill-navy-taupe',
          picked ? 'stroke-sea-green' : 'stroke-white/20',
        )}
        strokeWidth={3}
      />
      <circle
        cx={dot[0]}
        cy={dot[1]}
        r={9}
        className="fill-none stroke-white/40"
        strokeWidth={2}
      />
      {picked ? (
        <circle cx={dot[0]} cy={dot[1]} r={6} className="fill-sea-green" />
      ) : null}
      <text
        x={x + 44}
        y={y + height / 2 + size * 0.36}
        fontSize={size}
        fontWeight={700}
        className="fill-white"
      >
        {text}
      </text>
    </>
  );
}

/**
 * A heading that, as `k` runs from 0 to 1, gives way to a bar standing for
 * the same heading in the language just chosen.
 */
function SwitchingHeading({ y, k }: { y: number; k: number }) {
  return (
    <>
      <text
        x={STAGE_CENTER_X}
        y={y}
        textAnchor="middle"
        fontSize={26}
        fontWeight={900}
        opacity={1 - k}
        className="fill-white"
      >
        {TEXT.heading}
      </text>
      <g opacity={k}>
        <TextBar
          x={STAGE_CENTER_X - 110}
          y={y - 9}
          width={220}
          className="stroke-white/80"
        />
      </g>
    </>
  );
}

/** The Language Chooser screen: its heading above the protocol's languages. */
function Chooser({ picked, switched }: { picked: number; switched: number }) {
  return (
    <>
      <Card
        x={SURFACE.x}
        y={SURFACE.y}
        width={SURFACE.width}
        height={SURFACE.height}
      />
      <SwitchingHeading y={SURFACE.y + 52} k={switched} />
      {TEXT.autonyms.map((name, i) => (
        <LanguageOption
          key={name}
          x={OPTION.x}
          y={OPTION.y + i * OPTION.step}
          width={OPTION.width}
          height={OPTION.height}
          text={name}
          picked={picked === i}
        />
      ))}
    </>
  );
}

/* ------------------------------------------------------------- scenes */

/**
 * Shows a language chooser where the participant chooses español, the screen
 * switches to Spanish at once, and after the participant clicks Next the
 * following screen is in Spanish too.
 */
export const LanguageChooserIntroScene = defineScene(6.2, ({ t }) => {
  const chosen = t >= 1.4;
  const switched = smooth(segment(t, 1.5, 0.4));
  const leave = smooth(segment(t, 3.4, 0.5));
  const next = backOut(segment(t, 3.9, 0.5));
  const nextHeight = 200;
  return {
    rail: { progress: t < 3.4 ? 0.05 : 0.12, press: pressAt(t, [3.2]) },
    body: (
      <>
        <g transform={`translate(0 ${-leave * 60})`} opacity={1 - leave}>
          <Chooser picked={chosen ? 2 : 1} switched={switched} />
          <Chip
            x={STAGE_CENTER_X}
            y={SURFACE.y}
            text={TEXT.nowIn}
            size={14}
            k={backOut(segment(t, 1.8, 0.4))}
          />
        </g>
        {next > 0 ? (
          <g
            transform={pivot(STAGE_CENTER_X, SURFACE.y + nextHeight / 2, next)}
          >
            <Card
              x={SURFACE.x}
              y={SURFACE.y}
              width={SURFACE.width}
              height={nextHeight}
            />
            <TextBar
              x={STAGE_CENTER_X - 110}
              y={SURFACE.y + 43}
              width={220}
              className="stroke-white/80"
            />
            <TextBar x={SURFACE.x + 40} y={SURFACE.y + 96} width={300} />
            <TextBar x={SURFACE.x + 40} y={SURFACE.y + 120} width={240} />
            <TextBar x={SURFACE.x + 40} y={SURFACE.y + 144} width={270} />
          </g>
        ) : null}
        <Chip
          x={STAGE_CENTER_X}
          y={SURFACE.y + nextHeight + 44}
          text={TEXT.later}
          size={15}
          fill="fill-sea-green"
          ink="fill-white"
          k={backOut(segment(t, 4.4, 0.4))}
        />
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: optionCenter(2), at: 1.4 },
          { to: NEXT_BUTTON, at: 3.2 },
        ]}
        leave={3.5}
      />
    ),
  };
});

/**
 * Shows how a language chooser's data is exported: the chosen language is kept
 * in the browser tab through a reload and is gone once the tab closes, and no
 * language is recorded in the exported data.
 */
export const LanguageChooserDataScene = defineScene(
  4.6,
  ({ t }) => {
    const box = { y: CONTENT.y + 50, width: 280, height: 220 };
    const left = CONTENT.x + 47;
    const right = CONTENT.right - 47 - box.width;
    const gapCenter: Point = [
      (left + box.width + right) / 2,
      box.y + box.height / 2,
    ];
    const line = (x: number, y: number, text: string, at: number) => (
      <text
        x={x}
        y={y}
        fontSize={15}
        fontWeight={700}
        opacity={smooth(segment(t, at, 0.4))}
        className="fill-white/70"
      >
        {text}
      </text>
    );
    const cross = backOut(segment(t, 2.4, 0.4));
    return {
      body: (
        <>
          <Card x={left} y={box.y} width={box.width} height={box.height} />
          <Heading x={left + 24} y={box.y + 36} text={TEXT.tab} />
          <Chip
            x={left + box.width / 2}
            y={box.y + 90}
            text={TEXT.chosen}
            size={20}
            k={backOut(segment(t, 0.4, 0.4))}
          />
          {line(left + 24, box.y + 150, TEXT.kept, 1.0)}
          {line(left + 24, box.y + 180, TEXT.gone, 1.5)}

          <line
            x1={left + box.width + 8}
            y1={gapCenter[1]}
            x2={right - 8}
            y2={gapCenter[1]}
            className="stroke-white/30"
            strokeWidth={4}
            strokeDasharray="8 8"
            opacity={smooth(segment(t, 2.1, 0.3))}
          />
          {cross > 0 ? (
            <g transform={pivot(gapCenter[0], gapCenter[1], cross)}>
              <circle
                cx={gapCenter[0]}
                cy={gapCenter[1]}
                r={18}
                className="fill-destructive"
              />
              <X
                x={gapCenter[0] - 11}
                y={gapCenter[1] - 11}
                width={22}
                height={22}
                strokeWidth={3}
                className="text-white"
              />
            </g>
          ) : null}

          <Card x={right} y={box.y} width={box.width} height={box.height} />
          <Heading x={right + 24} y={box.y + 36} text={TEXT.exported} />
          <Chip
            x={right + box.width / 2}
            y={box.y + 90}
            text={TEXT.notRecorded}
            size={15}
            fill="fill-white/20"
            ink="fill-white"
            k={backOut(segment(t, 2.8, 0.4))}
          />
          {line(right + 24, box.y + 150, TEXT.notSaved, 3.3)}
          {line(right + 24, box.y + 180, TEXT.noEntities, 3.7)}
        </>
      ),
    };
  },
  { url: TEXT.exported },
);

/**
 * Shows a protocol that starts with a language chooser, where the participant
 * chooses español on the first screen and every later screen is then shown in
 * español.
 */
export const LanguageChooserOrderScene = defineScene(
  5.6,
  ({ t }) => {
    const CARD = { width: 130, height: 140, gap: 30 };
    const count = TEXT.stages.length;
    const startX =
      CONTENT.x +
      (CONTENT.right -
        CONTENT.x -
        (CARD.width * count + CARD.gap * (count - 1))) /
        2;
    const cardX = (i: number) => startX + i * (CARD.width + CARD.gap);
    const cardY = CONTENT.y + 96;
    const center = (i: number) => cardX(i) + CARD.width / 2;
    const lineY = cardY + CARD.height + 44;
    const firstMove = 1.8;
    const step = 0.8;
    const index = Math.max(0, Math.min(count - 1, (t - firstMove) / step));
    const from = Math.floor(index);
    const to = Math.min(from + 1, count - 1);
    const dotX = lerp(center(from), center(to), smooth(index - from));
    const here = Math.round(index);
    const reached = (i: number) =>
      backOut(segment(t, firstMove + (i - 1) * step + step * 0.6, 0.4));
    const picked = t >= 1.0;
    return {
      body: (
        <>
          <Chip
            x={(CONTENT.x + CONTENT.right) / 2}
            y={CONTENT.y + 34}
            text={TEXT.chosenFirst}
            size={17}
            fill="fill-sea-green"
            ink="fill-white"
            k={backOut(segment(t, 1.0, 0.4))}
          />
          <line
            x1={center(0)}
            y1={lineY}
            x2={center(count - 1)}
            y2={lineY}
            className="stroke-white/20"
            strokeWidth={6}
            strokeLinecap="round"
          />
          {TEXT.stages.map((stage, i) => {
            const isChooser = i === 0;
            const pop = backOut(segment(t, 0.1 + i * 0.08, 0.4));
            return (
              <g
                key={stage}
                transform={pivot(center(i), cardY + CARD.height / 2, pop)}
              >
                <rect
                  x={cardX(i)}
                  y={cardY}
                  width={CARD.width}
                  height={CARD.height}
                  rx={16}
                  className={cx(
                    'fill-cyber-grape',
                    here === i
                      ? 'stroke-sea-green'
                      : isChooser
                        ? 'stroke-mustard'
                        : 'stroke-white/20',
                  )}
                  strokeWidth={here === i ? 6 : 4}
                />
                {isChooser ? (
                  [0, 1, 2].map((row) => {
                    const y = cardY + 30 + row * 26;
                    const on = picked ? row === 1 : row === 0;
                    return (
                      <g key={row}>
                        <circle
                          cx={cardX(i) + 26}
                          cy={y}
                          r={7}
                          className={cx(
                            on ? 'fill-sea-green' : 'fill-none',
                            'stroke-white/40',
                          )}
                          strokeWidth={2}
                        />
                        <TextBar
                          x={cardX(i) + 44}
                          y={y}
                          width={CARD.width - 70}
                          className="stroke-white/25"
                        />
                      </g>
                    );
                  })
                ) : (
                  <>
                    <TextBar
                      x={cardX(i) + 24}
                      y={cardY + 40}
                      width={CARD.width - 48}
                      className="stroke-white/25"
                    />
                    <TextBar
                      x={cardX(i) + 24}
                      y={cardY + 64}
                      width={CARD.width - 80}
                      className="stroke-white/15"
                    />
                  </>
                )}
                <text
                  x={center(i)}
                  y={cardY + CARD.height - 22}
                  textAnchor="middle"
                  fontSize={15}
                  fontWeight={800}
                  className="fill-white"
                >
                  {stage}
                </text>
                <circle
                  cx={center(i)}
                  cy={lineY}
                  r={9}
                  className="fill-white/40"
                />
              </g>
            );
          })}
          {TEXT.stages.slice(1).map((stage, i) => (
            <Chip
              key={stage}
              x={center(i + 1)}
              y={cardY - 22}
              text={TEXT.chosen}
              size={13}
              k={reached(i + 1)}
            />
          ))}
          {t >= 0.4 ? (
            <circle
              cx={dotX}
              cy={lineY}
              r={14}
              className="fill-neon-coral stroke-white"
              strokeWidth={4}
            />
          ) : null}
        </>
      ),
    };
  },
  { url: TEXT.protocol },
);

/**
 * Shows how a new language reaches the language chooser: clicking Add languages
 * adds French to the protocol's Languages list, and français joins the
 * chooser's list, which is sorted by each language's own name.
 */
export const LanguageChooserLanguagesScene = defineScene(
  5.0,
  ({ t }) => {
    const panel = { y: CONTENT.y + 24, width: 300, height: 296 };
    const left = CONTENT.x + 37;
    const right = CONTENT.right - 37 - panel.width;
    const rowTop = panel.y + 64;
    const rowGap = 46;
    const added = smooth(segment(t, 1.4, 0.5));
    const offered = smooth(segment(t, 2.2, 0.5));
    // Architect sorts by the names it shows, so French joins second.
    const before = [0, -1, 1, 2];
    const after = [0, 1, 2, 3];
    const addButton: Point = [left + 24 + 78, panel.y + panel.height - 36];
    return {
      body: (
        <>
          <Card
            x={left}
            y={panel.y}
            width={panel.width}
            height={panel.height}
          />
          <Heading x={left + 24} y={panel.y + 36} text={TEXT.languages} />
          {TEXT.names.map((name, i) => {
            const isNew = (before[i] ?? -1) < 0;
            const slot = isNew
              ? (after[i] ?? i)
              : lerp(before[i] ?? i, after[i] ?? i, added);
            const y = rowTop + slot * rowGap;
            return (
              <g key={name} opacity={isNew ? added : 1}>
                <text
                  x={left + 24}
                  y={y + 6}
                  fontSize={18}
                  fontWeight={800}
                  className="fill-white"
                >
                  {name}
                </text>
                {i === 0 ? (
                  <Chip
                    x={left + 120}
                    y={y}
                    text={TEXT.defaultBadge}
                    size={12}
                    align="start"
                    fill="fill-sea-green"
                    ink="fill-white"
                  />
                ) : null}
              </g>
            );
          })}
          <g
            transform={pivot(
              addButton[0],
              addButton[1],
              1 - Math.sin(Math.PI * pressAt(t, [1.0])) * 0.12,
            )}
          >
            <Chip
              x={addButton[0]}
              y={addButton[1]}
              text={TEXT.add}
              size={15}
              width={156}
              fill="fill-white/15"
              ink="fill-white"
            />
          </g>

          <Card
            x={right}
            y={panel.y}
            width={panel.width}
            height={panel.height}
          />
          <Heading x={right + 24} y={panel.y + 36} text={TEXT.chooser} />
          {TEXT.autonyms.map((name, i) => {
            const isNew = i === TEXT.autonyms.length - 1;
            const k = isNew ? offered : 1;
            if (k <= 0) return null;
            const y = rowTop - 18 + i * rowGap;
            return (
              <g
                key={name}
                opacity={k}
                transform={`translate(0 ${(1 - k) * 12})`}
              >
                <LanguageOption
                  x={right + 24}
                  y={y}
                  width={panel.width - 48}
                  height={36}
                  text={name}
                  picked={i === 1}
                  size={16}
                />
              </g>
            );
          })}
        </>
      ),
      overlay: <Click t={t} stops={[{ to: addButton, at: 1.0 }]} leave={1.4} />,
    };
  },
  { url: TEXT.protocol },
);
