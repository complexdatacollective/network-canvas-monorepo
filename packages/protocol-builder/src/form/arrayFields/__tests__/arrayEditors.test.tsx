import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMemo } from 'react';
import { describe, expect, it } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import type { Command, SectionDoc } from '@codaco/studio-sync/apply';

import { useStageEditorController } from '../../../controller.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import {
  createStageIdentity,
  ProtocolBuilderSessionStore,
} from '../../../session.ts';
import ProtocolArrayField from '../../ProtocolArrayField.tsx';
import StageEditorShell from '../../StageEditorShell.tsx';
import MultiSelect, {
  makeMultiSelectValidation,
  type PropertyField,
} from '../MultiSelect.tsx';
import Options, { optionsValidation } from '../Options.tsx';

function createSession(fields: SectionDoc) {
  return new ProtocolBuilderSessionStore({
    identity: createStageIdentity('Information', () => 'stage-1'),
    fields,
    protocolSections: {},
    manifestRevision: { sequence: 1n, hash: 'revision-1' },
    access: { mode: 'editable', leaseOwner: 'tab-1', leaseEpoch: 1n },
    buildCandidate: ({ stageDocument }) => ({
      name: 'Array editors test',
      schemaVersion: 8,
      codebook: {},
      stages: [stageDocument],
    }),
  });
}

const commandsOf = (session: ProtocolBuilderSessionStore): Command[] =>
  session.getSnapshot().pendingCommands.flatMap((batch) => [...batch.commands]);

function renderOptions(session: ProtocolBuilderSessionStore) {
  function Host() {
    const controller = useStageEditorController(session, 'stage-form');
    return (
      <StageEditorShell controller={controller}>
        <BuilderSection title="Answer options">
          <ProtocolArrayField
            name="options"
            label="Answer options"
            component={Options}
            addButtonLabel="Create new option"
            {...optionsValidation}
          />
        </BuilderSection>
      </StageEditorShell>
    );
  }

  return render(
    <DialogProvider>
      <Host />
    </DialogProvider>,
  );
}

const SORT_PROPERTIES: PropertyField[] = [
  { fieldName: 'property', control: 'input' },
  { fieldName: 'direction', control: 'input' },
];

function renderSortRules(session: ProtocolBuilderSessionStore) {
  function Host() {
    const controller = useStageEditorController(session, 'stage-form');
    const validation = useMemo(
      () => makeMultiSelectValidation(SORT_PROPERTIES),
      [],
    );
    return (
      <StageEditorShell
        controller={controller}
        actions={({ formId }) => (
          <SubmitButton form={formId}>Finished editing</SubmitButton>
        )}
      >
        <BuilderSection title="Sort order">
          <ProtocolArrayField
            name="sortOrder"
            label="Sort order"
            component={MultiSelect}
            addButtonLabel="Add new sort rule"
            properties={SORT_PROPERTIES}
            options={() => []}
            {...validation}
          />
        </BuilderSection>
      </StageEditorShell>
    );
  }

  return render(
    <DialogProvider>
      <Host />
    </DialogProvider>,
  );
}

describe('Options', () => {
  it('adds a row as an insert and edits it as a replacement of that row', async () => {
    const user = userEvent.setup();
    const session = createSession({
      title: 'Welcome',
      options: [{ label: 'Yes', value: 'yes' }],
    });
    renderOptions(session);

    await user.click(
      await screen.findByRole('button', { name: 'Create new option' }),
    );

    // A blank option opens straight into its editor, so the value cell is
    // reachable without a further click.
    const valueCell = await screen.findByRole('textbox', { name: 'Value' });
    await user.type(valueCell, 'no');

    await waitFor(() =>
      expect(session.getSnapshot().editedSection.fields.options).toEqual([
        { label: 'Yes', value: 'yes' },
        { value: 'no' },
      ]),
    );
    // Options carry no id, so the row is followed by position while the list
    // is unchanged — but the ADD is still an insert, and every keystroke after
    // it lands on that row and no other. The first option is untouched
    // throughout, which a whole-array rewrite could not promise.
    const commands = commandsOf(session);
    expect(commands[0]).toEqual({
      op: 'insertItem',
      key: 'options',
      index: 1,
      item: {},
    });
    expect(commands.slice(1).every(({ op }) => op === 'set')).toBe(true);
  });
});

describe('MultiSelect', () => {
  it('refuses a save while a row is missing a column', async () => {
    const user = userEvent.setup();
    const session = createSession({
      title: 'Welcome',
      sortOrder: [{ property: 'name' }],
    });
    renderSortRules(session);

    await user.click(
      await screen.findByRole('button', { name: 'Finished editing' }),
    );

    await screen.findByText('Every row needs a value in each column.');
    expect(session.getSnapshot().pendingCommands).toEqual([]);
  });
});
