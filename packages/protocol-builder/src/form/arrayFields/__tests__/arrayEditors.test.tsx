import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
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
  type ProtocolBuilderSession,
  ProtocolBuilderSessionStore,
  SessionReadOnlyError,
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

/**
 * A session whose next write is refused, while the snapshot still says the
 * stage is editable — the lease taken back between the render a handler was
 * built in and the click that dispatches.
 *
 * `setAccess` cannot stand in for it: it re-renders, and `ArrayField` withdraws
 * every control of a read-only list, so there is nothing left to click. This is
 * the only arrangement in which the refusal happens inside the list's own
 * commit.
 */
function withRevocableDispatch(
  store: ProtocolBuilderSessionStore,
): ProtocolBuilderSession {
  return {
    subscribe: (listener) => store.subscribe(listener),
    getSnapshot: () => store.getSnapshot(),
    getServerSnapshot: () => store.getServerSnapshot(),
    dispatch: () => {
      throw new SessionReadOnlyError();
    },
    undo: () => store.undo(),
    redo: () => store.redo(),
    validate: () => store.validate(),
    requestCompoundEdit: (request) => store.requestCompoundEdit(request),
    finish: () => store.finish(),
    cancel: () => store.cancel(),
    getResourceGateway: () => store.getResourceGateway(),
  };
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

function renderOptions(session: ProtocolBuilderSession) {
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

function renderSortRules(session: ProtocolBuilderSession) {
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

  /**
   * Options carry no id of their own, so `ArrayField` gives each row an
   * internal id and REUSES those ids by position whenever the value is
   * replaced. A confirm dialog is a window in which the list can be replaced —
   * and when it is, the delete handler this row was rendered with names
   * whichever option has taken its place.
   */
  it('removes nothing when the option it confirmed was replaced beneath it', async () => {
    const user = userEvent.setup();
    const session = createSession({
      title: 'Welcome',
      options: [
        { label: 'Alpha', value: 'alpha' },
        { label: 'Bravo', value: 'bravo' },
      ],
    });
    renderOptions(session);

    await user.click(
      await screen.findByRole('button', { name: 'Remove option 2' }),
    );
    await screen.findByRole('button', { name: 'Remove option' });

    // A row arrives at the TOP of the list while the confirm sits open, which
    // hands this control the internal id of the row above it.
    act(() => {
      session.replaceAuthoritativeStage({
        fields: {
          title: 'Welcome',
          options: [
            { label: 'Zulu', value: 'zulu' },
            { label: 'Alpha', value: 'alpha' },
            { label: 'Bravo', value: 'bravo' },
          ],
        },
        manifestRevision: { sequence: 2n, hash: 'revision-2' },
      });
    });
    await waitFor(() =>
      expect(
        document.querySelectorAll('[aria-label^="Remove option "]'),
      ).toHaveLength(3),
    );

    await user.click(screen.getByRole('button', { name: 'Remove option' }));

    // Nothing is removed, and the dialog says why rather than closing over a
    // deletion that landed on an option the researcher never looked at.
    expect(
      await screen.findByText(
        'This option was replaced while you were confirming, so nothing was removed. Check the list and remove it again if you still want to.',
      ),
    ).toBeInTheDocument();
    expect(session.getSnapshot().editedSection.fields.options).toEqual([
      { label: 'Zulu', value: 'zulu' },
      { label: 'Alpha', value: 'alpha' },
      { label: 'Bravo', value: 'bravo' },
    ]);
  });

  it('removes the option it confirmed when the list has not moved', async () => {
    const user = userEvent.setup();
    const session = createSession({
      title: 'Welcome',
      options: [
        { label: 'Alpha', value: 'alpha' },
        { label: 'Bravo', value: 'bravo' },
      ],
    });
    renderOptions(session);

    await user.click(
      await screen.findByRole('button', { name: 'Remove option 2' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Remove option' }),
    );

    await waitFor(() =>
      expect(session.getSnapshot().editedSection.fields.options).toEqual([
        { label: 'Alpha', value: 'alpha' },
      ]),
    );
  });

  /**
   * The other thing a confirm's window can outlive: not the row, but what the
   * list will accept.
   *
   * `ArrayField` withdraws a row's delete handler the moment its list becomes
   * read-only or disabled, and says nothing else about it. A confirm answered
   * after that calls a handler that is no longer there, removes nothing, and
   * closes as though the option had gone.
   */
  it('removes nothing when the list stops accepting changes mid-confirm', async () => {
    const user = userEvent.setup();
    const session = createSession({
      title: 'Welcome',
      options: [
        { label: 'Alpha', value: 'alpha' },
        { label: 'Bravo', value: 'bravo' },
      ],
    });
    renderOptions(session);

    await user.click(
      await screen.findByRole('button', { name: 'Remove option 2' }),
    );
    await screen.findByRole('button', { name: 'Remove option' });

    // The lease goes while the confirm sits open. The option is untouched —
    // only what may be done to it has changed.
    act(() => {
      session.setAccess({ mode: 'readOnly', reason: 'lease-lost' });
    });

    await user.click(screen.getByRole('button', { name: 'Remove option' }));

    expect(
      await screen.findByText(
        'This list stopped accepting changes while you were confirming, so this option was not removed. Remove it again once the list can be edited.',
      ),
    ).toBeInTheDocument();
    expect(session.getSnapshot().editedSection.fields.options).toEqual([
      { label: 'Alpha', value: 'alpha' },
      { label: 'Bravo', value: 'bravo' },
    ]);
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

/**
 * The same window, in the second of the three lists that share the confirm.
 * A sort rule names its Remove control identically in every row, and the
 * confirm's own control is named the same again, so the confirm is asked
 * inside its own dialog rather than by name alone.
 */
describe('a row removal confirm the list stops accepting', () => {
  it('removes no sort rule and says why', async () => {
    const user = userEvent.setup();
    const session = createSession({
      title: 'Welcome',
      sortOrder: [
        { property: 'name', direction: 'asc' },
        { property: 'age', direction: 'desc' },
      ],
    });
    renderSortRules(session);

    const [firstRemove] = await screen.findAllByRole('button', {
      name: 'Remove item',
    });
    await user.click(firstRemove!);
    const dialog = await screen.findByRole('dialog');

    act(() => {
      session.setAccess({ mode: 'readOnly', reason: 'lease-lost' });
    });

    await user.click(
      within(dialog).getByRole('button', { name: 'Remove item' }),
    );

    expect(
      await screen.findByText(
        'This list stopped accepting changes while you were confirming, so this item was not removed. Remove it again once the list can be edited.',
      ),
    ).toBeInTheDocument();
    expect(session.getSnapshot().editedSection.fields.sortOrder).toEqual([
      { property: 'name', direction: 'asc' },
      { property: 'age', direction: 'desc' },
    ]);
  });
});

/**
 * The lists that have no dialog over them, and therefore nobody to hand a
 * refusal to.
 *
 * `ArrayField` draws every mutation out of its own state before anything is
 * written, and re-reads the value only when the value CHANGES — so a write the
 * document does not take leaves the edit on screen looking exactly like one
 * that landed. What has to be true of both lists below is that the researcher
 * is told, and that the rows go back to being the document's.
 */
describe('an inline list whose write the document does not take', () => {
  it('says so and takes the added option back off screen when the stage refuses it', async () => {
    const user = userEvent.setup();
    const store = createSession({
      title: 'Welcome',
      options: [{ label: 'Yes', value: 'yes' }],
    });
    renderOptions(withRevocableDispatch(store));

    await user.click(
      await screen.findByRole('button', { name: 'Create new option' }),
    );

    expect(
      await screen.findByText(
        'This stage is read-only, so this item was not saved. Take over editing and try again.',
      ),
    ).toBeInTheDocument();
    expect(store.getSnapshot().editedSection.fields.options).toEqual([
      { label: 'Yes', value: 'yes' },
    ]);
    // A blank option opens straight into its inline editor, so the cells of a
    // row that was never written are the thing on screen that says it was.
    expect(
      screen.queryByRole('textbox', { name: 'Value' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /^Edit option/ }),
    ).toHaveLength(1);
  });

  it('keeps the row open while it puts back a keystroke the document did not take', async () => {
    const user = userEvent.setup();
    const twin = () => ({ label: 'A', value: 'a' });
    const session = createSession({
      title: 'Welcome',
      // A hole, and two options the researcher cannot tell apart. Adding an
      // option appends past the hole and hands the control the rows without
      // it, after which an edit to either twin resolves to no row: content is
      // all a row without an id has, and both have the same content.
      options: [null, twin(), twin()],
    });
    renderOptions(session);

    await user.click(
      await screen.findByRole('button', { name: 'Create new option' }),
    );
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: /^Remove option/ }),
      ).toHaveLength(3),
    );

    await user.click(screen.getByRole('button', { name: 'Edit option 1' }));
    const valueCell = await screen.findByRole('textbox', { name: 'Value' });
    await user.type(valueCell, 'x');

    expect(
      await screen.findByText(
        'This list changed while you were editing, so this item could not be matched to a row in it and nothing was saved. Copy anything you want to keep, then check the list and make the change again.',
      ),
    ).toBeInTheDocument();
    // Putting the rows back is what takes a refused edit off the screen, and it
    // must not take the researcher out of the row they are in with it: they are
    // being asked to look at the list and try again, not to find their way back
    // to a row that closed itself.
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Value' })).toHaveValue('a'),
    );
    expect(session.getSnapshot().editedSection.fields.options).toEqual([
      null,
      twin(),
      twin(),
      {},
    ]);
  });

  it('says so and puts the sort rule back when the move names no row', async () => {
    const user = userEvent.setup();
    const session = createSession({
      title: 'Welcome',
      // A list an import left a hole in, holding two rows the researcher
      // cannot tell apart. `ArrayField` draws no rows for a list with a hole
      // in it, so the add below appends past the hole and hands the control
      // the rows WITHOUT it — which is what leaves the control and the
      // document numbered differently for everything after.
      sortOrder: [
        null,
        { property: 'name', direction: 'asc' },
        { property: 'name', direction: 'asc' },
      ],
    });
    renderSortRules(session);

    await user.click(
      await screen.findByRole('button', { name: 'Add new sort rule' }),
    );
    await waitFor(() =>
      expect(screen.getAllByRole('textbox', { name: 'Property' })).toHaveLength(
        3,
      ),
    );

    // The blank row moves up one. Its own place in the document can be found,
    // but the row it would have to sit beside cannot be told from its twin, so
    // the move resolves to no row rather than to a guess.
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Reorder item 3 of 3' }),
      { key: 'ArrowUp' },
    );

    expect(
      await screen.findByText(
        'This list changed while you were editing, so this item could not be matched to a row in it and nothing was saved. Copy anything you want to keep, then check the list and make the change again.',
      ),
    ).toBeInTheDocument();
    expect(session.getSnapshot().editedSection.fields.sortOrder).toEqual([
      null,
      { property: 'name', direction: 'asc' },
      { property: 'name', direction: 'asc' },
      {},
    ]);
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('textbox', { name: 'Property' })
          .map((cell) => (cell as HTMLInputElement).value),
      ).toEqual(['name', 'name', '']),
    );
  });
});
