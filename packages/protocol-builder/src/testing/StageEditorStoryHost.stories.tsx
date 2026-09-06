import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import StageEditorShell from '../form/StageEditorShell.tsx';
import { interfaceDocumentationUrl } from '../interfaces/documentation.ts';
import ContentBlockEditor from '../sections/contentBlocks/ContentBlockEditor.tsx';
import ContentBlockPreview from '../sections/contentBlocks/ContentBlockPreview.tsx';
import {
  collapseContentBlock,
  expandContentBlock,
} from '../sections/contentBlocks/contentBlockTypes.ts';
import PageContentSection from '../sections/PageContentSection.tsx';
import StageHeading from '../sections/StageHeading.tsx';
import { fixtureStageIds } from './protocolFixture.ts';
import { StageEditorStoryHost } from './StageEditorStoryHost.tsx';

const meta = {
  title: 'Protocol Builder/Stage editors/Story host',
  component: StageEditorStoryHost,
  args: {
    stageId: 'information-1',
    renderEditor: ({ controller, actions }) => (
      <StageEditorShell controller={controller} actions={actions}>
        <StageHeading
          documentationUrl={interfaceDocumentationUrl('information')}
        />
        <PageContentSection
          ItemEditor={ContentBlockEditor}
          ItemPreview={ContentBlockPreview}
          itemSelector={expandContentBlock}
          normalizeItem={collapseContentBlock}
        />
      </StageEditorShell>
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The host every stage editor’s stories run in. It opens a real editing session over one stage of the shared all-interfaces protocol — the same session the package’s tests are written against — renders whatever editor the story names, and reports what a save committed. Shown here with shared sections rather than a named editor, because the families that own those editors are still landing.',
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
    const order = fixtureStageIds();
    await expect(
      canvas.getByText(
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
