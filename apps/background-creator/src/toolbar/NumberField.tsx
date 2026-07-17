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
  // A discrete change (one stepper click or a typed value); the caller records
  // one history step per call.
  onCommit: (value: number) => void;
};

function format(value: number): string {
  return String(value);
}

// A controlled numeric field backed by local text state. Editing the store value
// directly from a controlled number input fights the user mid-type (e.g. "0."
// collapses to "0"); keeping the typed text local until blur avoids that while
// still committing every parsed value so the stepper and preview stay live.
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

  // Adopt an external value change (undo, a different selection) only while the
  // field is not being edited, so typing is never interrupted.
  useEffect(() => {
    if (!focused.current) setText(format(value));
  }, [value]);

  const commit = (raw: string) => {
    if (raw.trim() === '') return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    onCommit(Math.min(Math.max(parsed, min), max));
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
        commit(raw);
      }}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        setText(format(value));
      }}
    />
  );
}
