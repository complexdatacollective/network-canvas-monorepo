import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import StageEditorShell from '../form/StageEditorShell.tsx';
import { interfaceDocumentationUrl } from '../interfaces/documentation.ts';
import { ResourceClientProvider } from '../resources/client.tsx';
import ContentBlockEditor from '../sections/content-blocks/ContentBlockEditor.tsx';
import ContentBlockPreview from '../sections/content-blocks/ContentBlockPreview.tsx';
import { contentBlockSlots } from '../sections/content-blocks/contentBlockTypes.ts';
import PageContentSection from '../sections/page-content/PageContentSection.tsx';
import StageHeadingSection from '../sections/stage-heading/StageHeadingSection.tsx';
import { StageEditSession } from '../stageEdit.tsx';
import StageEditor from '../StageEditor.tsx';
import { fixtureStageIds } from './protocolFixture.ts';
import { StageEditorStoryHost } from './StageEditorStoryHost.tsx';

const meta = {
  title: 'Protocol Builder/Stage editors/Story host',
  component: StageEditorStoryHost,
  args: {
    stageId: 'information-1',
    renderEditor: ({ target, formId, onSaved, actions }) => (
      <ResourceClientProvider>
        <StageEditSession target={target} formId={formId} onSaved={onSaved}>
          <StageEditorShell actions={actions}>
            <StageHeadingSection
              documentationUrl={interfaceDocumentationUrl('information')}
            />
            <PageContentSection
              ItemEditor={ContentBlockEditor}
              ItemPreview={ContentBlockPreview}
              slots={contentBlockSlots}
            />
          </StageEditorShell>
        </StageEditSession>
      </ResourceClientProvider>
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The host every stage editor’s stories run in. It serves one stage of the shared all-interfaces protocol over the package’s own host contract — the same host the package’s tests are written against — renders whatever editor the story names, and reports what a save committed. Shown here with shared sections rather than a named editor, because the families that own those editors are still landing.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The stage as the fixture protocol holds it. The play renames it and saves,
 * so the story settles on the document the host was asked to commit — which is
 * the whole reason this host exists rather than a bare session.
 */
export const Editing: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    // The heading states where the stage sits in the interview, read from the
    // protocol the host opened — so the line is derived from that same stage
    // order, and from the stage this story actually opened, rather than
    // written out here.
    //
    // Awaited: the stage order is another section, and the host answers for it
    // over a promise like any other. The editor draws itself from the stage it
    // holds and fills the position in when that answer lands.
    const order = fixtureStageIds();
    await expect(
      await canvas.findByText(
        `Stage ${order.indexOf(args.stageId) + 1} of ${order.length}`,
      ),
    ).toBeInTheDocument();

    const name = canvas.getByRole('textbox', { name: 'Stage name' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Welcome screen');
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await waitFor(async () => {
      await expect(
        canvas.getByRole('status', { name: 'Save status' }),
      ).toHaveTextContent('Saved “Welcome screen”.');
    });
    await expect(
      canvas.getByRole('region', { name: 'What the host was asked to commit' }),
    ).toHaveTextContent('"label": "Welcome screen"');
  },
};

/**
 * Someone else holds the stage: the holder is named, every control is inert,
 * and the host's own save control is DISABLED rather than gone.
 *
 * The last of those is the one worth a play. A control that disappears cannot
 * say why, and the researcher is left looking for the save button rather than
 * reading the line that explains there is nothing to save. So the assertion is
 * "present, and disabled", never "absent".
 */
export const Spectating: Story = {
  args: { readOnly: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    // Boot: the editor is on screen at all. Its own controls are read below,
    // and this is what waits for them to exist.
    const name = await canvas.findByRole('textbox', { name: 'Stage name' });

    // The holder by name, because "somebody" is what the shell falls back to
    // when the host does not say who, and this host does.
    await expect(
      await canvas.findByText(
        'Robin is editing this stage, so you can read it but not change it.',
      ),
    ).toBeInTheDocument();

    // Inert, and not merely styled that way: a disabled control is one the
    // keyboard cannot reach either.
    await expect(name).toBeDisabled();

    // Every one of them, not that one, and with no exceptions: the editor
    // renders nothing a spectator may operate. The shell disables its fields
    // through a React context rather than a `<fieldset disabled>`, so each
    // control has to read it — and one that forgets stays live beside a page
    // that says it cannot be changed. Read off the DOM rather than by role
    // because the question is which controls EXIST: a role query answers for
    // the roles it is asked about, which is the wrong shape for "and nothing
    // else".
    const controls = [
      ...canvasElement.querySelectorAll<HTMLElement>(
        'input, textarea, select, button',
      ),
    ];

    // A page that rendered no controls would satisfy the loop by vacuity.
    await expect(controls.length).toBeGreaterThan(1);
    for (const control of controls) {
      await expect(control).toBeDisabled();
    }

    const save = canvas.getByRole('button', { name: 'Save stage' });
    await expect(save).toBeInTheDocument();
    await expect(save).toBeDisabled();
  },
};

/**
 * A collaborator's revision arrives while the researcher is part-way through
 * an edit.
 *
 * Two things have to be true at once, and only one of them is obvious. The
 * editor has to SHOW the change — a form that goes on claiming to collect
 * "ego_name" after somebody renamed that attribute is describing a codebook
 * nobody has — and it must not take the researcher's draft away to do it. An
 * editor that reloaded the stage from the protocol on every revision would
 * pass the first half and silently discard an afternoon's work.
 *
 * The revision is a codebook one rather than a change to this stage, because a
 * collaborator cannot revise a stage this editor holds the lock on: that is
 * what the lock is. What they can do is change something the stage points at.
 */
export const ACollaboratorRevisesTheCodebook: Story = {
  args: {
    stageId: 'ego-form-1',
    // Through the package's own dispatcher, with no registry passed, so the
    // editor is the one a host would get for this interface.
    renderEditor: ({ actions, ...editor }) => (
      <StageEditor {...editor} actions={actions} />
    ),
    collaboratorRevision: {
      controlLabel: 'Rename the attribute as a collaborator',
      section: sectionId({ kind: 'codebookEgo' }),
      document: {
        variables: {
          ego_name: { name: 'given_name', type: 'text', component: 'Text' },
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    // Boot, then the codebook read, as two waits: the editor mounting and the
    // form field's summary resolving an attribute through the protocol cache
    // are different questions, and one budget covering both is a budget for
    // neither.
    const stageName = await canvas.findByRole('textbox', {
      name: 'Stage name',
    });
    await expect(
      await canvas.findByText('Collects "ego_name" as text.'),
    ).toBeInTheDocument();

    // The researcher's draft: typed, not saved. Nothing has been committed, so
    // the only place this value exists is the open edit.
    await userEvent.clear(stageName);
    await userEvent.type(stageName, 'About you');

    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Rename the attribute as a collaborator',
      }),
    );

    // Their change, on screen, without this editor having asked for it.
    await expect(
      await canvas.findByText('Collects "given_name" as text.'),
    ).toBeInTheDocument();

    // And the draft is still the researcher's. Read after the revision landed
    // rather than before, which is the whole point: a re-read of the stage
    // would have put "Ego Form" back here.
    await expect(stageName).toHaveValue('About you');
    await expect(
      canvas.getByRole('status', { name: 'Save status' }),
    ).toHaveTextContent('Nothing saved yet.');

    // And it saves as the researcher left it: their draft, and nothing of the
    // collaborator's rename written back as this edit.
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));
    await waitFor(async () => {
      await expect(
        canvas.getByRole('status', { name: 'Save status' }),
      ).toHaveTextContent('Saved “About you”.');
    });
  },
};
