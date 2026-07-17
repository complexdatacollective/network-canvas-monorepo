import { type ReactElement, useEffect, useRef, useState } from 'react';

import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

type NumberFieldProps = {
  label: string;
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
  // A discrete change (one stepper click or a committed typed value); the caller
  // records one history step per call.
  onCommit: (value: number) => void;
};

const EPSILON = 1e-9;

function format(value: number): string {
  return String(value);
}

// A controlled numeric field backed by local text state.
//
// Typing updates only the local text and commits nothing until blur or Enter,
// so a keystroke burst can't flood undo history with clamped intermediate
// values ("0." would otherwise collapse to "0" and record a step). Stepper
// interactions — the +/- buttons and ArrowUp/Down — commit immediately and
// discretely. The two are told apart by `nativeOnChange`, which InputField
// fires only for real input events (typing/paste) and not for its programmatic
// `stepUp`/`stepDown`: a change with no following nativeOnChange is a stepper.
export function NumberField({
  label,
  name,
  value,
  min,
  max,
  step,
  onCommit,
}: NumberFieldProps): ReactElement {
  const [text, setText] = useState(() => format(value));
  const focused = useRef(false);
  // Holds the value from the latest onChange until a microtask decides whether
  // it was a keystroke (nativeOnChange clears it → no commit) or a stepper.
  const pendingStep = useRef<string | null>(null);

  // Adopt an external value change (undo, a different selection, a committed
  // clamp) only while the field is not being edited, so typing is never
  // interrupted.
  useEffect(() => {
    if (!focused.current) setText(format(value));
  }, [value]);

  const commit = (raw: string) => {
    const parsed = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(parsed)) {
      setText(format(value));
      return;
    }
    const clamped = Math.min(Math.max(parsed, min), max);
    // Skip a commit that wouldn't change the stored value (no no-op history).
    if (Math.abs(clamped - value) > EPSILON) onCommit(clamped);
    setText(format(clamped));
  };

  return (
    <UnconnectedField
      label={label}
      name={name}
      inline
      component={InputField}
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      value={text}
      onChange={(next) => {
        const raw = next ?? '';
        setText(raw);
        pendingStep.current = raw;
        queueMicrotask(() => {
          const stepped = pendingStep.current;
          pendingStep.current = null;
          // Still set ⇒ no nativeOnChange followed ⇒ this was a stepper press.
          if (stepped !== null) commit(stepped);
        });
      }}
      nativeOnChange={() => {
        // A real keystroke: cancel the deferred commit; typing commits on blur.
        pendingStep.current = null;
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit(text);
        }
      }}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        commit(text);
      }}
    />
  );
}
