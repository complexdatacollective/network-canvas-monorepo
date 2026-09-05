import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { useStageEditorController } from '../../controller.ts';
import StageEditorShell from '../../form/StageEditorShell.tsx';
import {
  createStageIdentity,
  ProtocolBuilderSessionStore,
} from '../../session.ts';
import {
  emptyRuleValue,
  RULE_VALUE_FIELD,
  RuleOperandField,
} from '../RuleValueField.tsx';

/**
 * What a rule's operand is reset to when the choice above it changes.
 *
 * Asserted directly rather than through the editor because two of these
 * answers are indistinguishable on screen: a checkbox group renders `''` and
 * `[]` identically, and reports the same emptiness to `required`. What the
 * difference decides is the SHAPE of the value the form is holding in the
 * meantime — and the protocol schema, which reads a multi-select operand as a
 * list, is the reader that cannot tell them apart until it is too late.
 */
describe('emptyRuleValue', () => {
  it('empties a multi-select operand as a selection, not as text', () => {
    expect(emptyRuleValue('categorical')).toEqual([]);
  });

  it('leaves a yes/no operand with no answer at all', () => {
    // Never `false`: that is what a yes/no control commits for "No", so
    // emptying to it both answered the question on the researcher's behalf and
    // satisfied the `required` rule that exists to ask it.
    expect(emptyRuleValue('boolean')).toBeUndefined();
  });

  it('leaves a numeric operand with no value at all', () => {
    // Never `''`: an empty string is not a number, and parking one in a field
    // whose control is numeric would show the researcher text they cannot have
    // typed.
    expect(emptyRuleValue('number')).toBeUndefined();
    // A scalar is compared as a number too, and is entered with the same
    // control.
    expect(emptyRuleValue('scalar')).toBeUndefined();
  });

  it('empties every other operand as text', () => {
    expect(emptyRuleValue('text')).toBe('');
    expect(emptyRuleValue('ordinal')).toBe('');
    expect(emptyRuleValue(undefined)).toBe('');
  });
});

const settingsSection = sectionId({ kind: 'settings' });
const stageOrderSection = sectionId({ kind: 'stageOrder' });
const stageSection = sectionId({ kind: 'stage', stageId: 'stage-1' });

const baseSections: Record<string, SectionDoc> = {
  [settingsSection]: { name: 'Operand entry', schemaVersion: 8 },
  [stageOrderSection]: { stages: ['stage-1'] },
  [stageSection]: {
    id: 'stage-1',
    type: 'Information',
    label: 'Welcome',
    title: 'Welcome',
    items: [],
  },
};

const createSession = () =>
  new ProtocolBuilderSessionStore({
    identity: createStageIdentity('Information', () => 'stage-1'),
    fields: { label: 'Welcome', title: 'Welcome', items: [] },
    protocolSections: baseSections,
    manifestRevision: { sequence: 1n, hash: 'revision-1' },
    access: { mode: 'editable', leaseOwner: 'tab-1', leaseEpoch: 1n },
    buildCandidate: ({ stageDocument }) => ({
      name: 'Operand entry',
      schemaVersion: 8,
      codebook: {},
      stages: [stageDocument],
    }),
  });

/** Reports the operand the FORM holds, whatever the control is showing. */
function OperandProbe() {
  const value = useFormValue([RULE_VALUE_FIELD])[RULE_VALUE_FIELD];
  return <output data-testid="operand">{JSON.stringify(value ?? null)}</output>;
}

const probedOperand = (): unknown =>
  JSON.parse(screen.getByTestId('operand').textContent ?? 'null') as unknown;

function OperandEditor({ operator }: { operator: string }) {
  const [session] = useState(createSession);
  const controller = useStageEditorController(session, 'stage-form');

  return (
    <StageEditorShell controller={controller}>
      <RuleOperandField
        variableType="number"
        operator={operator}
        regExpHint="Enter a regular expression."
      />
      <OperandProbe />
    </StageEditorShell>
  );
}

const renderOperand = async (operator = 'GREATER_THAN') => {
  render(<OperandEditor operator={operator} />);
  // Awaited rather than read synchronously, so the editing session's own
  // first snapshot has landed before the control is driven.
  return await screen.findByRole('spinbutton', { name: /Attribute value/ });
};

/**
 * A number the researcher types a character at a time.
 *
 * Every keystroke is a change event carrying the whole text, and the text a
 * number is BUILT from is not the text the number reads back as: `1.0` is the
 * number 1, `-0` is the number 0. A control that re-renders from the parsed
 * number therefore rewrites the input under the researcher's cursor — the
 * minus sign disappears as soon as the first digit follows it, and `1.05`
 * becomes `15` because the decimal point is taken back out before the last
 * digit arrives.
 *
 * Driven with change events carrying the exact strings a real
 * `<input type="number">` reports, because that is the whole mechanism: the
 * element's own value-sanitization algorithm has already reduced text that is
 * not a number to `''`, so what reaches the control is only ever a number's
 * text — and it is that text the control must not paraphrase.
 */
describe('a numeric operand entered a character at a time', () => {
  const type = (input: HTMLElement, text: string) => {
    fireEvent.change(input, { target: { value: text } });
  };

  it('keeps the text the researcher is typing and stores the number it means', async () => {
    const input = await renderOperand();

    type(input, '1');
    expect(input).toHaveValue(1);

    // The keystroke that used to be taken back: `1.0` reads back as `1`, so
    // the control rewrote the field and the `5` that followed landed against
    // `1`, saving 15 for a researcher who typed 1.05.
    type(input, '1.0');
    expect(input).toHaveDisplayValue('1.0');
    expect(probedOperand()).toBe(1);

    type(input, '1.05');
    expect(input).toHaveDisplayValue('1.05');
    expect(probedOperand()).toBe(1.05);
  });

  it('keeps a minus sign that has no digits after it yet', async () => {
    const input = await renderOperand('LESS_THAN');

    // `-0` reads back as `0`, which is what wiped the sign a researcher had
    // just typed on their way to -0.5.
    type(input, '-0');
    expect(input).toHaveDisplayValue('-0');

    type(input, '-0.5');
    expect(input).toHaveDisplayValue('-0.5');
    expect(probedOperand()).toBe(-0.5);
  });

  it('settles on the number it stored once the field is left', async () => {
    const input = await renderOperand();

    type(input, '1.50');
    // Stated before the blur, so the assertion after it cannot pass by the
    // control having rewritten the text while the researcher was still in it.
    expect(input).toHaveDisplayValue('1.50');
    expect(probedOperand()).toBe(1.5);

    // Left alone, the field would go on showing text the form is not holding.
    fireEvent.blur(input);
    expect(input).toHaveDisplayValue('1.5');
  });

  it('shows a value the rest of the editor puts there rather than the draft', async () => {
    const input = await renderOperand();

    type(input, '1.0');
    expect(input).toHaveDisplayValue('1.0');

    // The cascade empties the operand when the choice above it changes, and a
    // draft that outlived that would show a number the rule no longer has.
    type(input, '');
    expect(input).toHaveDisplayValue('');
    expect(probedOperand()).toBeNull();
  });
});
