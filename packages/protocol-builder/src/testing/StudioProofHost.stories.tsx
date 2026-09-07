import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import StageEditor from '../StageEditor.tsx';
import { StageEditorStoryHost } from './StageEditorStoryHost.tsx';
import { COLLEAGUE, HOST_RESPONSIBILITIES } from './StudioHostSurface.tsx';

/**
 * The colleague, as presence: the host says who else is in the protocol, and
 * this is that message.
 */
const COLLEAGUE_PRESENCE = [COLLEAGUE] as const;

/** The node type both the codebook stories and the refused edit are about. */
const PERSON_SECTION = sectionId({ kind: 'codebookNode', typeId: 'person' });

/**
 * A second roster, carrying the same columns as the one the stage already
 * points at.
 *
 * The same columns on purpose: swapping a data file for one that does not have
 * them is a different story — the card, sort and search sections lose the
 * properties they were built on — and this one is about what a host does with
 * the bytes, not about what an editor does when they change shape.
 *
 * A fresh `File` per call, because a play may run more than once on one page.
 */
const secondRosterFile = (): File =>
  new File(
    [
      JSON.stringify({
        nodes: [
          { attributes: { name: 'Ada', age: 36 } },
          { attributes: { name: 'Grace', age: 41 } },
        ],
        edges: [],
      }),
    ],
    'second-roster.json',
    { type: 'application/json' },
  );

/** Reads one of the host's readouts by the name it is labelled with. */
const hostSays = (canvas: ReturnType<typeof within>, name: string) =>
  canvas.getByRole('status', { name });

const meta = {
  title: 'Protocol Builder/Studio host proof',
  component: StageEditorStoryHost,
  args: {
    collaborative: true,
    presence: COLLEAGUE_PRESENCE,
    stageId: 'alter-form-1',
    // Through the package's OWN registry, with no part named: a host reaches
    // an editor by handing the dispatcher a session, and never by knowing
    // which component edits which interface.
    renderEditor: ({ controller, actions }) => (
      <StageEditor controller={controller} actions={actions} />
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'What a host has to be for this package, proved by being one. There is no Redux store, no router, no Architect alias and no protocol document of its own anywhere in these stories: the host opens a session, commits the batches the editor makes, relays what changes elsewhere, owns the section lock, carries compound edits, and provides the resource gateway. Every contract it uses is one Studio already uses in `apps/studio/client/src/editor/useStudioStageSession.ts`. The panel above each editor shows only what the session told it, and the buttons beside those readouts are the rest of Studio: a colleague at work, a section lock changing hands, an editor closed without saving.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The host at rest, and then a save.
 *
 * Everything the panel shows is read from the session: who else is here, that
 * the lock is held here, that the protocol is valid, and that nothing has been
 * sent yet. The save goes out through the host's own action slot — the one
 * piece of chrome the package does not own — and comes back as a committed
 * stage document.
 */
export const Editing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(hostSays(canvas, 'Editing access')).toHaveTextContent(
      'You hold the section lock.',
    );
    await expect(
      within(canvas.getByRole('list', { name: 'Who else is here' })).getByText(
        'Priya Raman is editing part of this protocol.',
      ),
    ).toBeInTheDocument();
    await expect(
      hostSays(canvas, 'Changes sent to the host'),
    ).toHaveTextContent('0 changes sent to the host.');
    await waitFor(async () => {
      await expect(hostSays(canvas, 'Protocol validity')).toHaveTextContent(
        'The protocol is valid.',
      );
    });

    // The checklist a future Studio integration is being handed, in full: a
    // list that quietly rendered four of the six would be a shorter contract
    // than the one this host is proving.
    await expect(
      within(
        canvas.getByRole('list', { name: 'Host responsibilities' }),
      ).getAllByRole('listitem'),
    ).toHaveLength(HOST_RESPONSIBILITIES.length);

    const name = canvas.getByRole('textbox', { name: 'Stage name' });
    await userEvent.clear(name);
    await userEvent.type(name, 'About each person');
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await waitFor(async () => {
      await expect(
        canvas.getByRole('status', { name: 'Save status' }),
      ).toHaveTextContent('Saved “About each person”.');
    });
    await expect(
      canvas.getByRole('region', { name: 'What the host was asked to commit' }),
    ).toHaveTextContent('"label": "About each person"');
    // The rename reached the host as it was made, not only at the save.
    await expect(
      hostSays(canvas, 'Changes sent to the host'),
    ).toHaveTextContent(/[1-9]\d* changes? sent to the host\./);

    // Undo runs through the controller, and the form follows it: the session
    // owns the history, and the shell re-seeds its controls from whatever the
    // draft becomes.
    await userEvent.click(
      canvas.getByRole('button', { name: 'Undo the last change' }),
    );
    await waitFor(async () => {
      await expect(
        canvas.getByRole('textbox', { name: 'Stage name' }),
      ).toHaveValue('Alter Form');
    });
  },
};

/**
 * Somebody else holds the section lock.
 *
 * The stage is entirely readable and nothing about it can be changed. The
 * host's own save button is disabled rather than hidden, so a researcher who
 * came here to change something can see that the control exists and that it is
 * not theirs right now.
 */
export const Spectating: Story = {
  args: { readOnly: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(hostSays(canvas, 'Editing access')).toHaveTextContent(
      'Someone else holds the section lock, so this stage is open for reading.',
    );

    // Read from the element rather than asserted with `toBeDisabled`, which
    // reports a pass inside a play function on a button that is not disabled.
    const save = canvas.getByRole<HTMLButtonElement>('button', {
      name: 'Save stage',
    });
    await expect(
      save.disabled || save.getAttribute('aria-disabled') === 'true',
    ).toBe(true);

    // Every way into an edit is inert too, and still visible: a control that
    // vanished would leave a researcher looking for it.
    const addField = canvas.getByRole<HTMLButtonElement>('button', {
      name: 'Create new form field',
    });
    await expect(
      addField.disabled || addField.getAttribute('aria-disabled') === 'true',
    ).toBe(true);
    // Unavailable to change, not unavailable to read.
    await expect(
      canvas.getByText("What is this person's relationship to you?", {
        exact: false,
      }),
    ).toBeInTheDocument();
  },
};

/**
 * A colleague adds an attribute, and the editor takes it without saying
 * anything back.
 *
 * The whole of the no-echo rule. The change arrives as an authoritative
 * update, the editor offers the new attribute immediately, and the count of
 * batches the host has been handed does not move — because a collaborator's
 * change is not this session's edit, and an editor that wrote it back would
 * save their work as the researcher's.
 */
export const ACollaboratorAddsAnAttribute: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();
    await expect(
      hostSays(canvas, 'Changes sent to the host'),
    ).toHaveTextContent('0 changes sent to the host.');

    await userEvent.click(
      canvas.getByRole('button', { name: 'A colleague adds an attribute' }),
    );
    await waitFor(async () => {
      await expect(hostSays(canvas, 'Protocol validity')).toHaveTextContent(
        'The protocol is valid.',
      );
    });

    // Nothing went back for it. Asserted here, before any dialog is opened:
    // an open dialog puts the rest of the page behind `aria-hidden`, and the
    // readout would be unreachable rather than unchanged.
    await expect(
      hostSays(canvas, 'Changes sent to the host'),
    ).toHaveTextContent('0 changes sent to the host.');

    // The editor is offering the attribute the colleague declared, which it
    // can only have read from the arrival.
    await userEvent.click(
      canvas.getByRole('button', { name: 'Create new form field' }),
    );
    const dialog = within(await screen.findByRole('dialog'));
    await expect(
      within(dialog.getByRole('combobox', { name: 'Attribute' })).getByRole(
        'option',
        { name: 'nickname' },
      ),
    ).toBeInTheDocument();

    // Reading the codebook is not writing to it either.
    await userEvent.keyboard('{Escape}');
    await waitFor(async () => {
      await expect(
        hostSays(canvas, 'Changes sent to the host'),
      ).toHaveTextContent('0 changes sent to the host.');
    });
  },
};

/**
 * A colleague deletes the node type this stage collects into.
 *
 * The problem is real and the researcher did not cause it, so it is reported
 * with the name of the person whose change caused it. That attribution is
 * carried by the host: the update says which section moved, who moved it, and
 * under which revision, and the session matches the validation problem back to
 * it.
 */
export const ACollaboratorBreaksTheStage: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();
    await waitFor(async () => {
      await expect(hostSays(canvas, 'Protocol validity')).toHaveTextContent(
        'The protocol is valid.',
      );
    });

    await userEvent.click(
      canvas.getByRole('button', {
        name: 'A colleague deletes the person type',
      }),
    );

    const problems = await canvas.findByRole('list', {
      name: 'Problems in this protocol',
    });
    await waitFor(async () => {
      await expect(problems).toHaveTextContent('Changed by Priya Raman.');
    });
  },
};

/**
 * The section lock is lost mid-edit.
 *
 * Editing stops, the save goes with it, and the undo history is cut: every
 * entry in it is a draft this session may no longer write, and offering to
 * restore one would offer to write it. The host says where the cut happened,
 * so a researcher is told rather than left wondering why undo went quiet.
 */
export const TheSectionLockIsLost: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    // Saved work, because that is what an undo history is made of: this form
    // writes to the session when it is submitted, not on every keystroke.
    const name = canvas.getByRole('textbox', { name: 'Stage name' });
    await userEvent.clear(name);
    await userEvent.type(name, 'About each person');
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));
    await waitFor(async () => {
      await expect(
        canvas.getByRole('status', { name: 'Save status' }),
      ).toHaveTextContent('Saved “About each person”.');
    });

    const undo = () =>
      canvas.getByRole<HTMLButtonElement>('button', {
        name: 'Undo the last change',
      });
    await waitFor(async () => {
      await expect(undo().disabled).toBe(false);
    });

    await userEvent.click(
      canvas.getByRole('button', { name: 'Lose the section lock' }),
    );

    await expect(hostSays(canvas, 'Editing access')).toHaveTextContent(
      'The section lock was lost to Priya Raman, so editing has stopped.',
    );
    await expect(hostSays(canvas, 'Unsaved work')).toHaveTextContent(
      'History was cut at revision',
    );
    await expect(undo().disabled).toBe(true);
    const save = canvas.getByRole<HTMLButtonElement>('button', {
      name: 'Save stage',
    });
    await expect(
      save.disabled || save.getAttribute('aria-disabled') === 'true',
    ).toBe(true);
  },
};

/**
 * A codebook write the stage needs, carried as one atomic change.
 *
 * The researcher needs a node type that does not exist, and they noticed
 * because of the half-finished stage in front of them. The type is created
 * through the host as a compound edit that says nothing about the stage — so
 * the unsaved work stays unsaved and stays theirs — and the stage then points
 * at the type that now exists.
 */
export const CreatingATypeTheStageNeeds: Story = {
  args: { stageId: 'name-generator-1' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(
      canvas.getByRole('button', { name: 'Create a new node type' }),
    );
    const dialog = within(await screen.findByRole('dialog'));
    await userEvent.type(
      await dialog.findByRole('textbox', { name: 'Node type name' }),
      'Place',
    );
    await userEvent.click(dialog.getByRole('button', { name: 'Save entity' }));

    // The dialog closes only when the host applied the whole edit, and the
    // stage is then pointed at what it created.
    await expect(
      await canvas.findByRole('radio', { name: 'Place' }),
    ).toBeChecked();
  },
};

/**
 * The same codebook write, refused because a colleague is holding the section
 * it needs.
 *
 * Nothing is written, and the refusal names the person who can unblock it —
 * which is the only thing a researcher can act on. The host's own words for
 * the refusal never reach the screen: they are written for whoever reads a
 * log, and they are about a section id rather than about a colleague.
 */
export const ACodebookWriteIsRefused: Story = {
  args: {
    heldSections: [{ sectionId: PERSON_SECTION, displayName: 'Priya Raman' }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(
      canvas.getByRole('button', { name: 'Create new form field' }),
    );
    const dialog = within(await screen.findByRole('dialog'));
    await userEvent.selectOptions(
      dialog.getByRole('combobox', { name: 'Attribute' }),
      '__create_new_attribute__',
    );
    await userEvent.type(
      await dialog.findByRole('textbox', { name: 'Attribute name' }),
      'nickname',
    );
    await userEvent.selectOptions(
      dialog.getByRole('combobox', { name: 'Kind of answer' }),
      'text',
    );
    await userEvent.type(
      dialog.getByRole('textbox', { name: 'Question text' }),
      'What do people call them?',
    );
    await userEvent.click(dialog.getByRole('button', { name: 'Add' }));

    await expect(
      await dialog.findByText(
        'Priya Raman is currently editing a section needed for this change.',
      ),
    ).toBeInTheDocument();
  },
};

/**
 * A file imported into the edit, and saved with the stage.
 *
 * The batch that points the field at the imported file never reaches the host:
 * its bytes are not in the protocol yet, and a host given that batch would be
 * holding a reference to a resource it does not have. It waits, visibly, until
 * the save carries the stage and the manifest entry together — one revision,
 * both halves.
 */
export const AnImportedFileIsSavedWithTheStage: Story = {
  args: {
    stageId: 'name-generator-roster-1',
    createResourceId: () => 'imported-roster',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();
    await expect(hostSays(canvas, 'Files in the protocol')).toHaveTextContent(
      'The protocol holds 3 files.',
    );

    await userEvent.click(
      canvas.getByRole('button', { name: 'Change the data file' }),
    );
    await userEvent.upload(
      await screen.findByLabelText('Choose a file from your computer'),
      secondRosterFile(),
    );

    await waitFor(async () => {
      await expect(hostSays(canvas, 'Imported files')).toHaveTextContent(
        'Imported but not saved: second-roster.json.',
      );
    });
    // Held back on purpose: the reference cannot go to the host before the
    // bytes do.
    await expect(hostSays(canvas, 'Unsaved work')).toHaveTextContent(
      'waiting to be saved with the stage',
    );

    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await waitFor(async () => {
      await expect(hostSays(canvas, 'Files in the protocol')).toHaveTextContent(
        'The protocol holds 4 files.',
      );
    });
    await expect(hostSays(canvas, 'Imported files')).toHaveTextContent(
      'Nothing has been imported into this edit.',
    );
  },
};

/**
 * The same import, and then the editor is closed without saving.
 *
 * Everything staged in the session is discarded, and the batches that were
 * held back go with it. The protocol holds exactly what it held before, which
 * is the point: an edit that was abandoned leaves nothing behind for somebody
 * to find later and wonder about.
 */
export const LeavingWithoutSaving: Story = {
  args: {
    stageId: 'name-generator-roster-1',
    createResourceId: () => 'imported-roster',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(
      canvas.getByRole('button', { name: 'Change the data file' }),
    );
    await userEvent.upload(
      await screen.findByLabelText('Choose a file from your computer'),
      secondRosterFile(),
    );
    await waitFor(async () => {
      await expect(hostSays(canvas, 'Imported files')).toHaveTextContent(
        'Imported but not saved: second-roster.json.',
      );
    });

    await userEvent.click(
      canvas.getByRole('button', { name: 'Close without saving' }),
    );

    await waitFor(async () => {
      await expect(hostSays(canvas, 'Imported files')).toHaveTextContent(
        'Nothing has been imported into this edit.',
      );
    });
    await expect(hostSays(canvas, 'Files in the protocol')).toHaveTextContent(
      'The protocol holds 3 files.',
    );
    await expect(
      canvas.getByRole('status', { name: 'Save status' }),
    ).toHaveTextContent('Nothing saved yet.');
  },
};

/**
 * A bin interface in the same host, reached through the same dispatcher.
 *
 * One of five stories, one per editor family, that exist to say the host is
 * not built around any of them: it is handed a session, and the interface the
 * session is editing decides everything else.
 */
export const ACensusAndBinEditor: Story = {
  args: { stageId: 'ordinal-bin-1' },
};

/** A network interface, in the same host. */
export const ANetworkEditor: Story = {
  args: { stageId: 'sociogram-1' },
};

/** A pedigree interface, in the same host. */
export const APedigreeEditor: Story = {
  args: { stageId: 'anonymisation-1' },
};
