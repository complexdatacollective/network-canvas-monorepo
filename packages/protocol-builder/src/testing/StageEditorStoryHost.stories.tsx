import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import StageEditorShell from '../form/StageEditorShell.tsx';
import { interfaceDocumentationUrl } from '../interfaces/documentation.ts';
import { ResourceClientProvider } from '../resources/client.tsx';
import ContentBlockEditor from '../sections/content-blocks/ContentBlockEditor.tsx';
import ContentBlockPreview from '../sections/content-blocks/ContentBlockPreview.tsx';
import { contentBlockSlots } from '../sections/content-blocks/contentBlockTypes.ts';
import PageContentSection from '../sections/page-content/PageContentSection.tsx';
import StageHeadingSection from '../sections/stage-heading/StageHeadingSection.tsx';
import { StageEditSession } from '../stageEdit.tsx';
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

/** Someone else holds the lease: every control is inert and saving is refused. */
export const Spectating: Story = {
  args: { readOnly: true },
};
