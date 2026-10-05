import { act, waitFor, within } from '@testing-library/react';
import { useMemo, useState, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import Section from '@codaco/fresco-ui/Section';
import { parseSectionId } from '@codaco/studio-sync/taxonomy';

import VariablePickerField, {
  type CreateOptionOutcome,
} from '../../../fields/VariablePickerField.tsx';
import {
  StageEditorFormContext,
  useStageEditorForm,
} from '../../../form/stageEditorContext.ts';
import { useStageValue } from '../../../form/stageFormHooks.ts';
import {
  variablesForSubject,
  type CodebookSubject,
} from '../../../protocol-context.ts';
import { useProtocolContext } from '../../../state/protocolContext.ts';
import {
  attributeField,
  openAttributePicker,
} from '../../../testing/attributePicker.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { useCreateAttributeForSlot } from '../useCreateAttributeForSlot.ts';

const SUBJECT: CodebookSubject = { entity: 'node', type: 'person' };
const SLOT = 'highlight';
const LABEL = 'Attribute that marks a person';

/**
 * What the picker is holding, and what the slot was given, read from outside
 * the form.
 *
 * `onCreateOption` is the hook's whole contract with the picker — the window
 * calls it and acts on the answer — so a test about an answer that arrives
 * late reads it here rather than through a window that has moved on.
 */
type Capture = {
  createOption?: (variableName: string) => Promise<CreateOptionOutcome>;
  created: string[];
  stopWriting?: () => void;
};

/**
 * A slot whose attribute a name finishes.
 *
 * A yes-or-no attribute IS the attribute the moment it is named, so the
 * picker's create row writes it in one round trip and hands the id straight
 * back — no editor, and nothing on screen between the press and the answer.
 * That round trip is what these tests are about: what the slot may do with an
 * id that arrives after the form under it has moved.
 */
function BooleanSlot({ capture }: Readonly<{ capture?: Capture }>) {
  const held = useStageValue(SLOT);
  const { storeApi } = useStageEditorForm();
  const protocolContext = useProtocolContext();
  const options = Object.entries(
    variablesForSubject(protocolContext, SUBJECT),
  ).map(([value, variable]) => ({
    value,
    label: variable.name,
    type: variable.type,
  }));
  const { createProps, editor } = useCreateAttributeForSlot({
    subject: SUBJECT,
    variableType: 'boolean',
    title: 'Create a new yes-or-no attribute',
    onCreated: (variableId) => {
      capture?.created.push(variableId);
      storeApi.getState().setFieldValue(SLOT, variableId);
    },
  });
  if (capture !== undefined) capture.createOption = createProps.onCreateOption;

  return (
    <Section title="What marks a person">
      <Field<typeof VariablePickerField>
        name={SLOT}
        component={VariablePickerField}
        label={LABEL}
        options={options}
        emptyMessage="This type has no yes-or-no attribute yet."
        initialValue={typeof held === 'string' ? held : undefined}
        {...createProps}
      />
      {editor}
    </Section>
  );
}

/**
 * The slot, on a form the test can make read-only without taking it away.
 *
 * The shell's own transition cannot be driven here: a stage refused for its
 * lock discards the draft and remounts every section under it
 * (`StageEditorShell`'s `discarded` key), so a create started before it is a
 * closure from a subtree that no longer exists — its `onCreated` writes to an
 * abandoned form store and its answer reaches a picker that has gone. What the
 * hook has to get right is the question it asks when the answer lands, and the
 * context it reads that from is what moves here.
 */
function UntilTheFormIsReadOnly({
  capture,
  children,
}: Readonly<{ capture: Capture; children: ReactNode }>) {
  const context = useStageEditorForm();
  const [readOnly, setReadOnly] = useState(false);
  capture.stopWriting = () => setReadOnly(true);
  const value = useMemo(() => ({ ...context, readOnly }), [context, readOnly]);
  return (
    <StageEditorFormContext value={value}>{children}</StageEditorFormContext>
  );
}

/**
 * Holds every codebook write open at the host, and hands back the release.
 *
 * A codebook write takes the section's own lock before it writes anything, so
 * a lock the host has not answered yet holds the whole round trip — which is
 * the only way to put anything in the window between the press and the answer.
 * Only the codebook's own sections: the stage's acquire and its save run
 * through the same method, and holding those would leave no stage to act on.
 */
const holdCodebookWrites = (harness: ReturnType<typeof renderStageEditor>) => {
  const { store } = harness.host;
  const acquire = store.acquire.bind(store);
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const delayed = async (...args: Parameters<typeof acquire>) => {
    const [id] = args;
    if (!parseSectionId(id).kind.startsWith('codebook')) {
      return acquire(...args);
    }
    await held;
    return acquire(...args);
  };
  vi.spyOn(store, 'acquire').mockImplementation(
    delayed as unknown as typeof acquire,
  );
  return () => {
    release();
  };
};

const createdAttribute = (
  harness: ReturnType<typeof renderStageEditor>,
  name: string,
) =>
  Object.entries(harness.hostCodebook().node?.person?.variables ?? {}).find(
    ([, variable]) => variable.name === name,
  );

describe('a slot whose attribute a name finishes', () => {
  it('writes the attribute and takes it, without an editor', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: <BooleanSlot />,
    });
    await harness.opened();

    const dialog = await openAttributePicker(
      harness.user,
      attributeField(LABEL),
    );
    await harness.user.type(
      within(dialog).getByRole('searchbox', {
        name: 'Find or create an attribute',
      }),
      'is_participant',
    );
    await harness.user.click(
      within(dialog).getByRole('option', {
        name: 'Create new attribute called “is_participant”.',
      }),
    );

    await waitFor(() =>
      expect(createdAttribute(harness, 'is_participant')).toBeDefined(),
    );
    expect(
      within(attributeField(LABEL)).getByText('is_participant'),
    ).toBeInTheDocument();
  });

  /**
   * The write is one round trip, and the form the slot is on can stop being
   * this researcher's while it is in flight. The attribute itself stands — the
   * codebook holds it and the researcher asked for it — but `onCreated` writes
   * to that form programmatically, and a form refusing every edit the
   * researcher makes is not one an answer arriving late may edit for them. So
   * the create is answered with where the attribute went instead, which is
   * what the escalation path's own live `writable` check already answers
   * (`useCreateVariableEditor`).
   */
  it('does not fill the slot when the form stopped being writable mid-write', async () => {
    const capture: Capture = { created: [] };
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: (
        <UntilTheFormIsReadOnly capture={capture}>
          <BooleanSlot capture={capture} />
        </UntilTheFormIsReadOnly>
      ),
    });
    await harness.opened();
    const release = holdCodebookWrites(harness);

    const createOption = capture.createOption;
    expect(createOption).toBeDefined();
    const pending = createOption?.('is_participant');

    act(() => {
      capture.stopWriting?.();
    });

    release();
    let outcome: CreateOptionOutcome | undefined;
    await act(async () => {
      outcome = await pending;
    });

    // The codebook holds it: the write landed and nothing undoes it.
    await waitFor(() =>
      expect(createdAttribute(harness, 'is_participant')).toBeDefined(),
    );
    // And the picker is told that nothing here took it, rather than the slot
    // being written to behind a form that refuses every edit.
    expect(outcome).toEqual({ status: 'unassigned' });
    expect(capture.created).toEqual([]);
    expect(within(attributeField(LABEL)).queryByText('is_participant')).toBe(
      null,
    );
  });
});
