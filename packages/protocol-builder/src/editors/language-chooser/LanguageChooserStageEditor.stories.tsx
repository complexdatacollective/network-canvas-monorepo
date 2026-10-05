import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import StageEditor from '../../StageEditor.tsx';
import { StageEditorStoryHost } from '../../testing/StageEditorStoryHost.tsx';
import { languageChooserStageEditor } from './LanguageChooserStageEditor.ts';

const meta = {
  title: 'Protocol Builder/Stage editors/Language Chooser',
  component: StageEditorStoryHost,
  args: {
    stageId: 'language-chooser-1',
    stage: {
      type: 'LanguageChooser',
      fields: {
        label: { 'en-US': 'Choose a language' },
      },
    },
    localization: {
      defaultLocale: 'en-US',
      locales: ['en-US', 'fr', 'ar'],
    },
    // Through the dispatcher rather than by naming the component, so the story
    // also shows that this editor claims the interface its stage is of.
    renderEditor: ({ actions, ...editor }) => (
      <StageEditor
        {...editor}
        registry={languageChooserStageEditor}
        actions={actions}
      />
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The editor for the stage where a participant chooses which of the protocol languages the rest of their interview is shown in. The languages are the protocol’s own and are listed rather than edited. It is opened here over a real editing session holding the shared all-interfaces protocol, declaring three languages.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The editor as the researcher meets it, in a protocol written in three languages. */
export const Editing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const languages = canvas.getByRole('list', {
      name: 'Languages participants can choose',
    });
    await expect(within(languages).getAllByRole('listitem')).toHaveLength(3);

    const name = await canvas.findByRole('textbox', { name: 'Stage name' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Language');
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await waitFor(async () => {
      await expect(
        canvas.getByRole('status', { name: 'Save status' }),
      ).toHaveTextContent('Saved “Language”.');
    });
    await expect(
      canvas.getByRole('region', { name: 'What the host was asked to commit' }),
    ).toHaveTextContent('"en-US": "Language"');
  },
};

/** A protocol in one language offers participants that one language. */
export const OneLanguage: Story = {
  args: {
    stage: {
      type: 'LanguageChooser',
      fields: { label: { 'en-US': 'Choose a language' } },
    },
    localization: { defaultLocale: 'en-US', locales: ['en-US'] },
  },
};

/** Someone else holds the lease: every control is inert and saving is refused. */
export const Spectating: Story = {
  args: { readOnly: true },
};
