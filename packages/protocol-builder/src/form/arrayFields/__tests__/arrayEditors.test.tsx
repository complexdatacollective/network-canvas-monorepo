import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMemo } from 'react';
import { describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import type { Command, SectionDoc } from '@codaco/studio-sync/apply';

import { useStageEditorController } from '../../../controller.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import {
  createStageIdentity,
  type FinishRequest,
  ProtocolBuilderSessionStore,
} from '../../../session.ts';
import ProtocolArrayField from '../../ProtocolArrayField.tsx';
import StageEditorShell from '../../StageEditorShell.tsx';
import MultiSelect, {
  makeMultiSelectValidation,
  type PropertyField,
} from '../MultiSelect.tsx';
import Options, { optionsValidation } from '../Options.tsx';

function createSession(
  fields: SectionDoc,
  onFinish?: (request: FinishRequest) => void,
) {
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
    ...(onFinish === undefined ? {} : { onFinish }),
  });
}

const OPTIONS_CAPABILITY = {
  fields: ['options'],
  confirmClear: {
    title: 'This will clear your answer options',
    description: 'The options you entered will be deleted.',
    confirmLabel: 'Clear options',
  },
};

/** The same list, behind a capability the researcher can switch off. */
function renderOptionalOptions(session: ProtocolBuilderSessionStore) {
  function Host() {
    const controller = useStageEditorController(session, 'stage-form');
    return (
      <StageEditorShell
        controller={controller}
        actions={({ formId }) => (
          <SubmitButton form={formId}>Finished editing</SubmitButton>
        )}
      >
        <BuilderSection title="Answer options" capability={OPTIONS_CAPABILITY}>
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

const commandsOf = (session: ProtocolBuilderSessionStore): Command[] =>
  session.getSnapshot().pendingCommands.flatMap((batch) => [...batch.commands]);

function renderOptions(session: ProtocolBuilderSessionStore) {
  function Host() {
    const controller = useStageEditorController(session, 'stage-form');
    return (
      <StageEditorShell
        controller={controller}
        actions={({ formId }) => (
          <SubmitButton form={formId}>Finished editing</SubmitButton>
        )}
      >
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

  it('refuses to finish the stage while a row it added is still blank', async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    const session = createSession(
      {
        // A stage the schema would otherwise accept, so a refusal here can
        // only be the one this test is about.
        label: 'Welcome',
        title: 'Welcome',
        items: [],
        options: [
          { label: 'Yes', value: 'yes' },
          { label: 'No', value: 'no' },
        ],
      },
      onFinish,
    );
    renderOptions(session);

    await user.click(
      await screen.findByRole('button', { name: 'Create new option' }),
    );
    // The blank row reaches the document the moment it is added, because a
    // list edit is committed as the operation it was. Nothing downstream will
    // catch it: an unknown key is not what makes a stage invalid, so this
    // field's own rule is the only thing standing between the researcher and a
    // protocol carrying an option with neither half.
    await waitFor(() =>
      expect(session.getSnapshot().editedSection.fields.options).toEqual([
        { label: 'Yes', value: 'yes' },
        { label: 'No', value: 'no' },
        {},
      ]),
    );

    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    const message = await screen.findByText(
      'Every option needs both a label and a value.',
    );
    // Attributed to the list that holds the row, so the outline and the
    // problem panel can say where to go — a refusal nobody can act on is not
    // much better than none.
    expect(message.closest('[data-field-name="options"]')).not.toBeNull();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('leaves no blank row behind when the capability that held it is switched off', async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    const session = createSession(
      {
        // A stage the schema would otherwise accept, so a refusal here can
        // only be the one this test is about.
        label: 'Welcome',
        title: 'Welcome',
        items: [],
        options: [
          { label: 'Yes', value: 'yes' },
          { label: 'No', value: 'no' },
        ],
      },
      onFinish,
    );
    renderOptionalOptions(session);

    await user.click(
      await screen.findByRole('button', { name: 'Create new option' }),
    );
    await waitFor(() =>
      expect(session.getSnapshot().editedSection.fields.options).toHaveLength(
        3,
      ),
    );

    await user.click(screen.getByRole('switch', { name: 'Answer options' }));
    await user.click(screen.getByRole('button', { name: 'Clear options' }));
    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    // The list is gone from the page, and with it the only rule that could
    // have refused the blank row. What has to be true is that there is no
    // blank row left to refuse: switching a capability off clears the paths it
    // owns, so the stage saves with no options at all rather than with the
    // half-finished one the researcher never got to see again.
    await waitFor(() => expect(onFinish).toHaveBeenCalled());
    const request = onFinish.mock.calls[0]?.[0] as FinishRequest;
    expect(Object.hasOwn(request.stageDocument, 'options')).toBe(false);
    expect(session.getSnapshot().editedSection.fields.options).toBeUndefined();
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
