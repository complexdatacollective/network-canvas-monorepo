import { screen, waitFor } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { describe, expect, it } from 'vitest';

import InputField from '@codaco/fresco-ui/form/fields/InputField';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import BuilderSection from '../../sections/BuilderSection.tsx';
import { commandsFromDraftChange } from '../../session.ts';
import type { StageEditorProps } from '../../stage-editor-contract.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import ProtocolField from '../ProtocolField.tsx';
import {
  useStageEditorForm,
  type StageEditorFormContextValue,
} from '../stageEditorContext.ts';
import StageEditorShell from '../StageEditorShell.tsx';
import { useStageValue } from '../stageFormHooks.ts';

/**
 * The page every test here opens: a heading the researcher chooses, blocks
 * that only make sense under the heading they were written for, and a name
 * that has nothing to do with either.
 */
const PAGE: SectionDoc = {
  label: 'Information',
  title: 'Welcome',
  items: [
    { id: 'info-item-1', type: 'text', content: 'Welcome to this interview.' },
  ],
};

const HEADING_OPTIONS = [
  { value: 'Welcome', label: 'Welcome' },
  { value: 'Thank you', label: 'Thank you' },
];

/**
 * An editor that resets dependent content when the researcher makes a choice.
 *
 * The shape every editor with a dependency has, and the reason this matters:
 * the CHOICE is still only in the form — typing and picking never reach the
 * session — while the reset it triggers is written to the session immediately,
 * because a stale dependency must not survive a crash or a collaborator's
 * read. So the write and the value that caused it are in two different places,
 * and the shell has to know the write was this form's own. Told otherwise, it
 * re-seeds every control from the draft the write produced — which still holds
 * the heading the researcher has just moved away from.
 */
function ResetOnChoice({
  reset,
}: Readonly<{ reset: (applyOwnCommands: ApplyOwnCommands) => void }>) {
  const { applyOwnCommands } = useStageEditorForm();
  const heading = useStageValue('title');
  const seen = useRef(heading);

  useEffect(() => {
    if (seen.current === heading) return;
    seen.current = heading;
    reset(applyOwnCommands);
  }, [applyOwnCommands, heading, reset]);

  return null;
}

type ApplyOwnCommands = StageEditorFormContextValue['applyOwnCommands'];

function pageEditor(reset: (applyOwnCommands: ApplyOwnCommands) => void) {
  return function PageEditor({ controller }: StageEditorProps<'Information'>) {
    return (
      <StageEditorShell
        controller={controller}
        actions={({ formId }) => (
          <SubmitButton form={formId}>Save stage</SubmitButton>
        )}
      >
        <BuilderSection title="Page content">
          <ProtocolField<typeof InputField>
            name="label"
            label="Stage name"
            component={InputField}
          />
          <ProtocolField<typeof RadioGroupField>
            name="title"
            label="Page heading"
            component={RadioGroupField}
            options={HEADING_OPTIONS}
          />
          <ResetOnChoice reset={reset} />
        </BuilderSection>
      </StageEditorShell>
    );
  };
}

/** Drops the blocks a heading change invalidated, as a whole-draft change. */
const clearItemsByDraftChange = (applyOwnCommands: ApplyOwnCommands) => {
  const { draft: current } = applyOwnCommands([]);
  const { items: _items, ...rest } = current;
  applyOwnCommands(commandsFromDraftChange(current, rest));
};

/** The same reset, as the single field-level command it really is. */
const clearItemsByField = (applyOwnCommands: ApplyOwnCommands) => {
  applyOwnCommands([{ op: 'unset', key: 'items' }]);
};

async function chooseADifferentHeading(
  reset: (applyOwnCommands: ApplyOwnCommands) => void,
) {
  const harness = renderStageEditor({
    stage: { type: 'Information', fields: PAGE },
    editor: pageEditor(reset),
  });

  const name = await screen.findByRole('textbox', { name: 'Stage name' });
  await harness.user.clear(name);
  await harness.user.type(name, 'Half-written name');

  await harness.user.click(screen.getByRole('radio', { name: 'Thank you' }));

  // The reset itself landed, so nothing below can pass by the choice having
  // had no consequence at all.
  await waitFor(() =>
    expect(harness.session.getSnapshot().editedSection.fields.items).toBe(
      undefined,
    ),
  );

  return { harness, name };
}

describe('a write the form makes on its own behalf', () => {
  it('leaves the choice that caused it, and everything half-typed beside it', async () => {
    const { name } = await chooseADifferentHeading(clearItemsByDraftChange);

    // A re-seed would put both of these back to what the session holds: the
    // heading to the one the researcher moved away from, and the name to the
    // one they were half-way through replacing.
    expect(screen.getByRole('radio', { name: 'Thank you' })).toBeChecked();
    expect(name).toHaveValue('Half-written name');
  });

  it('does the same for a field-level write, which is the same write', async () => {
    const { name } = await chooseADifferentHeading(clearItemsByField);

    expect(screen.getByRole('radio', { name: 'Thank you' })).toBeChecked();
    expect(name).toHaveValue('Half-written name');
  });
});
