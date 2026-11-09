import { KeyRound, Lock } from 'lucide-react';

import { backOut, segment } from '@codaco/art/illustration/motion';

import { Card, DataTable, Heading } from './InterpreterScenes';
import {
  Chip,
  Click,
  CONTENT,
  defineScene,
  lerp,
  PersonNode,
  pivot,
  pressAt,
  Prompt,
  row,
  smooth,
  STAGE,
  STAGE_CENTER_X,
  TextBar,
  TextBox,
  type Point,
} from './parts';

const TEXT = {
  heading: 'Protect your answers',
  passphrase: 'Passphrase',
  confirm: 'Confirm Passphrase',
  continue: 'Continue',
  accepted: ['Passphrase accepted!', 'Click "Next" to continue.'],
  tooShort: 'Enter at least 8 characters.',
  incorrect: [
    'This passphrase does not match the one used',
    'earlier in this interview. Check it and try again.',
  ],
  prompt: 'Who do you talk to about important matters?',
  interview: 'In the interview',
  saved: 'Saved',
  exported: 'Exported',
  ciphertext: '[183, 22, 9, 240, …]',
  notSaved: 'Passphrase: never saved',
  columns: ['name', 'age'],
  rows: [
    ['ENCRYPTED', '34'],
    ['ENCRYPTED', '29'],
  ],
  lost: 'Forgotten passphrase: no one can read it',
  alters: ['Sofia', 'Omar', 'Leila'],
  rain: ['Sofia', 'Omar', 'Leila', 'Klaus', 'Margot', 'Henrik', 'Fatima'],
} as const;

const DOT = '•';
const SCRAMBLE = '#%&@*?$0123456789';

/* ------------------------------------------------------------- pieces */

/** How much of `count` characters have been typed by `t`. */
const typed = (t: number, start: number, count: number, length = 0.8) =>
  DOT.repeat(Math.round(count * segment(t, start, length)));

/**
 * The names drifting down behind the stage. Below the threshold, as a share
 * of the height, they are scrambled, as the interview's background does once
 * the passphrase is accepted.
 */
function NameRain({ t, threshold }: { t: number; threshold: number }) {
  const height = CONTENT.bottom - CONTENT.y;
  return (
    <>
      {TEXT.rain.map((name, i) => {
        const x = STAGE.x + 30 + ((i * 97) % (STAGE.right - STAGE.x - 80));
        const share = (((i * 37 + t * (5 + (i % 3) * 2)) % 110) - 10) / 100;
        const scrambled = share > threshold;
        const text = scrambled
          ? Array.from(
              name,
              (_, j) =>
                SCRAMBLE[(i * 7 + j * 3 + Math.floor(t * 6)) % SCRAMBLE.length],
            ).join('')
          : name;
        return (
          <text
            key={name}
            x={x}
            y={CONTENT.y + share * height}
            fontSize={18}
            fontWeight={700}
            className={scrambled ? 'fill-sea-green/30' : 'fill-white/15'}
          >
            {text}
          </text>
        );
      })}
    </>
  );
}

/** A labeled passphrase field, with its error underneath when it has one. */
function PassphraseField({
  x,
  y,
  width,
  label,
  value,
  caret = false,
  error = [],
}: {
  x: number;
  y: number;
  width: number;
  label: string;
  value: string;
  caret?: boolean;
  error?: readonly string[];
}) {
  return (
    <>
      <text
        x={x}
        y={y - 8}
        fontSize={15}
        fontWeight={800}
        className="fill-white"
      >
        {label}
      </text>
      <TextBox
        x={x}
        y={y}
        width={width}
        text={value}
        caret={caret}
        invalid={error.length > 0}
      />
      {error.map((line, i) => (
        <text
          key={line}
          x={x}
          y={y + 60 + i * 18}
          fontSize={14}
          fontWeight={700}
          className="fill-destructive"
        >
          {line}
        </text>
      ))}
    </>
  );
}

function ContinueButton({
  x,
  y,
  press,
}: {
  x: number;
  y: number;
  press: number;
}) {
  const squash = 1 - Math.sin(Math.PI * press) * 0.12;
  return (
    <g transform={pivot(x, y, squash)}>
      <Chip
        x={x}
        y={y}
        text={TEXT.continue}
        size={17}
        width={140}
        fill="fill-sea-green"
        ink="fill-white"
      />
    </g>
  );
}

const SCREEN = {
  x: STAGE_CENTER_X - 210,
  width: 420,
  y: STAGE.y + 14,
  height: 318,
} as const;
const FIELD_X = SCREEN.x + 30;
const FIELD_WIDTH = SCREEN.width - 60;
const FIRST_FIELD_Y = SCREEN.y + 103;
const SECOND_FIELD_Y = SCREEN.y + 195;
const FIRST_FIELD: Point = [FIELD_X + 80, FIRST_FIELD_Y + 21];
const SECOND_FIELD: Point = [FIELD_X + 80, SECOND_FIELD_Y + 21];
const CONTINUE: Point = [SCREEN.x + SCREEN.width - 100, SCREEN.y + 285];

/** The stage's screen: the explanation, then the form or, once accepted, the success message. */
function PassphraseScreen({
  first,
  second,
  focus,
  press = 0,
  errors = {},
  accepted = 0,
}: {
  first: string;
  second: string;
  focus?: 'first' | 'second';
  press?: number;
  errors?: Readonly<{ first?: boolean; second?: boolean }>;
  /** 0 to 1, the form giving way to the success message. */
  accepted?: number;
}) {
  const form = 1 - smooth(accepted);
  const height = lerp(SCREEN.height, 190, smooth(accepted));
  const success = backOut(segment(accepted, 0.4, 0.6));
  return (
    <>
      <Card x={SCREEN.x} y={SCREEN.y} width={SCREEN.width} height={height} />
      <text
        x={SCREEN.x + 30}
        y={SCREEN.y + 42}
        fontSize={24}
        fontWeight={900}
        className="fill-white"
      >
        {TEXT.heading}
      </text>
      <TextBar x={SCREEN.x + 30} y={SCREEN.y + 66} width={330} />
      {form > 0 ? (
        <g opacity={form}>
          <PassphraseField
            x={FIELD_X}
            y={FIRST_FIELD_Y}
            width={FIELD_WIDTH}
            label={TEXT.passphrase}
            value={first}
            caret={focus === 'first'}
            error={errors.first === true ? [TEXT.tooShort] : []}
          />
          <PassphraseField
            x={FIELD_X}
            y={SECOND_FIELD_Y}
            width={FIELD_WIDTH}
            label={TEXT.confirm}
            value={second}
            caret={focus === 'second'}
            error={errors.second === true ? [TEXT.tooShort] : []}
          />
          <ContinueButton x={CONTINUE[0]} y={CONTINUE[1]} press={press} />
        </g>
      ) : null}
      {success > 0 ? (
        <g transform={pivot(STAGE_CENTER_X, SCREEN.y + 130, success)}>
          <rect
            x={FIELD_X}
            y={SCREEN.y + 96}
            width={FIELD_WIDTH}
            height={68}
            rx={12}
            className="fill-success"
          />
          {TEXT.accepted.map((line, i) => (
            <text
              key={line}
              x={FIELD_X + 20}
              y={SCREEN.y + 124 + i * 22}
              fontSize={16}
              fontWeight={i === 0 ? 900 : 700}
              className="fill-white"
            >
              {line}
            </text>
          ))}
        </g>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------- scenes */

/**
 * The participant types a passphrase, types it again to confirm it, and
 * presses Continue; once it is accepted, Next turns green.
 */
export const AnonymisationIntroScene = defineScene(6.2, ({ t }) => {
  const accepted = segment(t, 4.0, 0.7);
  const unlocked = t >= 4.0;
  return {
    rail: unlocked
      ? { progress: 0.15, pulse: true, pulseFrom: 4.4 }
      : { progress: 0.15 },
    body: (
      <>
        <NameRain t={t} threshold={unlocked ? 0.2 : 1.1} />
        <PassphraseScreen
          first={typed(t, 1.0, 12)}
          second={typed(t, 2.4, 12)}
          focus={t < 2.2 ? 'first' : t < 3.5 ? 'second' : undefined}
          press={pressAt(t, [3.6])}
          accepted={accepted}
        />
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: FIRST_FIELD, at: 0.8 },
          { to: SECOND_FIELD, at: 2.2 },
          { to: CONTINUE, at: 3.6 },
        ]}
        leave={4.0}
      />
    ),
  };
});

/**
 * A text answer is saved encrypted, the passphrase is never saved, and the
 * export carries ENCRYPTED in place of each encrypted answer.
 */
export const AnonymisationDataScene = defineScene(
  5.6,
  ({ t }) => {
    const top = CONTENT.y + 50;
    const middle = CONTENT.y + 160;
    const columns = { interview: 40, saved: 240, exported: 478 } as const;
    const arrow = (from: number, to: number, at: number) => {
      const k = smooth(segment(t, at, 0.4));
      return (
        <line
          x1={from}
          y1={middle}
          x2={lerp(from, to, k)}
          y2={middle}
          className="stroke-white/40"
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray="10 10"
          opacity={k > 0 ? 1 : 0}
        />
      );
    };
    return {
      body: (
        <>
          <Heading x={columns.interview} y={top} text={TEXT.interview} />
          <PersonNode
            x={columns.interview + 80}
            y={middle}
            label={TEXT.alters[0]}
            k={segment(t, 0.3, 0.5)}
            r={50}
          />
          {arrow(columns.interview + 140, columns.saved - 10, 1.0)}
          <Heading x={columns.saved} y={top} text={TEXT.saved} />
          <Chip
            x={columns.saved}
            y={middle}
            text={TEXT.ciphertext}
            size={16}
            align="start"
            fill="fill-cyber-grape"
            ink="fill-white"
            k={backOut(segment(t, 1.4, 0.4))}
          />
          <Chip
            x={columns.saved}
            y={middle + 62}
            text={TEXT.notSaved}
            size={13}
            align="start"
            fill="fill-white/20"
            ink="fill-white"
            k={backOut(segment(t, 2.0, 0.4))}
          />
          {arrow(columns.saved + 215, columns.exported - 10, 2.6)}
          <Heading x={columns.exported} y={top} text={TEXT.exported} />
          <DataTable
            x={columns.exported}
            y={middle - 60}
            columns={TEXT.columns}
            rows={TEXT.rows}
            reveal={(r, cell) =>
              smooth(segment(t, 3.0 + r * 0.4 + cell * 0.2, 0.4))
            }
            colWidth={105}
          />
          <Chip
            x={(CONTENT.x + CONTENT.right) / 2}
            y={CONTENT.bottom - 60}
            text={TEXT.lost}
            size={16}
            fill="fill-mustard"
            k={backOut(segment(t, 4.2, 0.4))}
          />
        </>
      ),
    };
  },
  { url: 'Exported data' },
);

/**
 * A passphrase shorter than the minimum is refused under both fields, and a
 * longer one is accepted.
 */
export const AnonymisationRulesScene = defineScene(7.4, ({ t }) => {
  const retyping = t >= 3.4;
  const errors = {
    first: t >= 2.6 && t < 4.2,
    second: t >= 2.6 && t < 5.0,
  };
  const accepted = segment(t, 5.6, 0.7);
  return {
    rail:
      t >= 5.6
        ? { progress: 0.15, pulse: true, pulseFrom: 6.0 }
        : { progress: 0.15 },
    body: (
      <>
        <NameRain t={t} threshold={t >= 5.6 ? 0.2 : 1.1} />
        <PassphraseScreen
          first={retyping ? typed(t, 3.6, 10, 0.6) : typed(t, 0.9, 5, 0.4)}
          second={retyping ? typed(t, 4.4, 10, 0.6) : typed(t, 1.6, 5, 0.4)}
          focus={
            t < 1.5
              ? 'first'
              : t < 2.4
                ? 'second'
                : t < 4.2 && retyping
                  ? 'first'
                  : t < 5.0 && retyping
                    ? 'second'
                    : undefined
          }
          press={pressAt(t, [2.5, 5.3])}
          errors={errors}
          accepted={accepted}
        />
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: FIRST_FIELD, at: 0.7 },
          { to: SECOND_FIELD, at: 1.5 },
          { to: CONTINUE, at: 2.5 },
          { to: FIRST_FIELD, at: 3.4 },
          { to: SECOND_FIELD, at: 4.2 },
          { to: CONTINUE, at: 5.3 },
        ]}
        leave={5.6}
      />
    ),
  };
});

const KEY_BUTTON: Point = [CONTENT.x + 33, CONTENT.y + 140];
const DIALOG = {
  width: 470,
  height: 280,
  x: (CONTENT.x + CONTENT.right) / 2 - 235,
  y: CONTENT.y + 32,
} as const;
const DIALOG_FIELD_Y = DIALOG.y + 140;
const DIALOG_FIELD: Point = [DIALOG.x + 110, DIALOG_FIELD_Y + 21];
const DIALOG_CONTINUE: Point = [
  DIALOG.x + DIALOG.width - 100,
  DIALOG.y + DIALOG.height - 34,
];

/**
 * The key button the navigation shows while encrypted answers are locked,
 * drawn over the top of the progress bar.
 */
function KeyButton({ k, press }: { k: number; press: number }) {
  if (k <= 0) return null;
  const squash = 1 - Math.sin(Math.PI * press) * 0.12;
  return (
    <>
      <rect
        x={CONTENT.x}
        y={KEY_BUTTON[1] - 30}
        width={66}
        height={60}
        className="fill-cyber-grape"
      />
      <g transform={pivot(KEY_BUTTON[0], KEY_BUTTON[1], k * squash)}>
        <circle
          cx={KEY_BUTTON[0]}
          cy={KEY_BUTTON[1]}
          r={22}
          className="fill-white"
        />
        <KeyRound
          x={KEY_BUTTON[0] - 12}
          y={KEY_BUTTON[1] - 12}
          width={24}
          height={24}
          strokeWidth={2.6}
          className="text-navy-taupe"
        />
      </g>
    </>
  );
}

/** The passphrase dialog the key button opens: one field, no confirmation. */
function PassphraseDialog({
  k,
  value,
  caret,
  error,
  press,
}: {
  k: number;
  value: string;
  caret: boolean;
  error: boolean;
  press: number;
}) {
  if (k <= 0) return null;
  return (
    <g opacity={Math.min(1, k)}>
      <rect
        x={CONTENT.x}
        y={CONTENT.y}
        width={CONTENT.right - CONTENT.x}
        height={CONTENT.bottom - CONTENT.y}
        className="fill-navy-taupe/60"
      />
      <g
        transform={pivot(
          DIALOG.x + DIALOG.width / 2,
          DIALOG.y + DIALOG.height / 2,
          k,
        )}
      >
        <rect
          x={DIALOG.x}
          y={DIALOG.y}
          width={DIALOG.width}
          height={DIALOG.height}
          rx={22}
          className="fill-cyber-grape stroke-white/30"
          strokeWidth={3}
        />
        <text
          x={DIALOG.x + 30}
          y={DIALOG.y + 44}
          fontSize={22}
          fontWeight={900}
          className="fill-white"
        >
          {TEXT.passphrase}
        </text>
        <TextBar
          x={DIALOG.x + 30}
          y={DIALOG.y + 76}
          width={380}
          className="stroke-white/25"
        />
        <TextBar
          x={DIALOG.x + 30}
          y={DIALOG.y + 98}
          width={300}
          className="stroke-white/25"
        />
        <PassphraseField
          x={DIALOG.x + 30}
          y={DIALOG_FIELD_Y}
          width={DIALOG.width - 60}
          label={TEXT.passphrase}
          value={value}
          caret={caret}
          error={error ? TEXT.incorrect : []}
        />
        <ContinueButton
          x={DIALOG_CONTINUE[0]}
          y={DIALOG_CONTINUE[1]}
          press={press}
        />
      </g>
    </g>
  );
}

/**
 * On a later stage, after the interview has been reopened, encrypted node
 * labels stay locked until the key button takes the passphrase again; a
 * wrong one is turned away.
 */
export const AnonymisationReturnScene = defineScene(7.6, ({ t }) => {
  const open =
    backOut(segment(t, 1.1, 0.4)) * (1 - smooth(segment(t, 5.3, 0.3)));
  const nodes = row(3, 170);
  const nodeY = STAGE.y + 200;
  const retyping = t >= 3.7;
  return {
    rail: { progress: 0.45 },
    body: (
      <>
        <Prompt text={TEXT.prompt} size={22} />
        {nodes.map((x, i) => {
          const name = TEXT.alters[i] ?? '';
          const reveal = smooth(segment(t, 5.6 + i * 0.15, 0.3));
          return (
            <g key={name}>
              <PersonNode
                x={x}
                y={nodeY}
                label={reveal >= 0.5 ? name : undefined}
                k={1}
                r={52}
              />
              {reveal < 0.5 ? (
                <Lock
                  x={x - 14}
                  y={nodeY - 14}
                  width={28}
                  height={28}
                  strokeWidth={2.6}
                  opacity={1 - reveal * 2}
                  className="text-white"
                />
              ) : null}
            </g>
          );
        })}
      </>
    ),
    modal: (
      <>
        <KeyButton
          k={1 - backOut(segment(t, 5.4, 0.4))}
          press={pressAt(t, [0.9])}
        />
        <PassphraseDialog
          k={open}
          value={retyping ? typed(t, 3.9, 12, 0.7) : typed(t, 1.6, 9, 0.6)}
          caret={t < 2.6 || (retyping && t < 4.8)}
          error={t >= 2.9 && t < 3.9}
          press={pressAt(t, [2.7, 5.0])}
        />
      </>
    ),
    overlay: (
      <Click
        t={t}
        stops={[
          { to: KEY_BUTTON, at: 0.9 },
          { to: DIALOG_CONTINUE, at: 2.7 },
          { to: DIALOG_FIELD, at: 3.7 },
          { to: DIALOG_CONTINUE, at: 5.0 },
        ]}
        leave={5.4}
      />
    ),
  };
});
