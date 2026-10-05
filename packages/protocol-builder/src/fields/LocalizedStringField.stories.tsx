import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { REQUIRED } from '../form/requiredField.ts';
import type { ProtocolLocalization } from '../localization/localizedText.ts';
import { chooseEditingLanguage } from '../testing/chooseEditingLanguage.ts';
import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import type { InMemoryHost } from '../testing/host/createInMemoryHost.ts';
import {
  LocalizedInputField,
  LocalizedRichTextField,
} from './LocalizedStringField.tsx';

/** The heading and the prose an anonymisation stage shows before asking for a passphrase. */
const TITLE_FIELD = 'explanationText.title';
const TITLE_LABEL = 'Title';
const BODY_FIELD = 'explanationText.body';
const BODY_LABEL = 'Explanation';

const SETTINGS = sectionId({ kind: 'settings' });

/** Declares the protocol's languages, leaving the fixture's English copy as it is. */
const writtenIn =
  (localization: ProtocolLocalization) => (host: InMemoryHost) => {
    host.store.applyAsCollaborator(SETTINGS, {
      ...host.store.read(SETTINGS).document,
      localization,
    });
  };

const explanation = (
  <>
    <Field<typeof LocalizedInputField>
      name={TITLE_FIELD}
      component={LocalizedInputField}
      label={TITLE_LABEL}
      required={REQUIRED}
    />
    <Field<typeof LocalizedRichTextField>
      name={BODY_FIELD}
      component={LocalizedRichTextField}
      label={BODY_LABEL}
      required={REQUIRED}
    />
  </>
);

const meta = {
  title: 'Protocol Builder/Fields/Text in several languages',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Every piece of text a participant reads is written in each of the protocol’s languages. A field shows one language at a time — the editing language, which every field on the page shares — and a menu beside it switches between them and marks the languages the text is still missing. A missing translation is never an error: participants using that language see the text in another one, and the note under the field says which. Each translation is typed in its own language and direction, and emptying one removes it.',
      },
    },
  },
  args: {
    stageId: 'anonymisation-1',
    sectionTitle: 'What the participant is told',
    children: explanation,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A protocol in one language has nothing to switch between, so no menu is drawn. */
export const OneLanguage: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await canvas.findByRole('textbox', { name: TITLE_LABEL });
    await expect(
      canvas.queryByRole('button', { name: /Editing language/ }),
    ).toBeNull();
  },
};

/**
 * Written in English, and declared in French too. Switching to French shows
 * what is still to translate, and a translation typed there is saved beside
 * the English rather than over it.
 */
export const SeveralLanguages: Story = {
  args: {
    seedEdit: writtenIn({ defaultLocale: 'en-US', locales: ['en-US', 'fr'] }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await canvas.findByRole('textbox', { name: TITLE_LABEL });
    await chooseEditingLanguage(canvasElement, /^français/);

    const title = await canvas.findByRole('textbox', { name: TITLE_LABEL });
    await expect(title).toHaveValue('');
    await expect(title.closest('[lang]')).toHaveAttribute('lang', 'fr');

    await userEvent.type(title, 'Votre vie privée est protégée');
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));
    await waitFor(async () => {
      await expect(
        canvas.getByRole('status', { name: 'Save status' }),
      ).toHaveTextContent(
        '"title":{"en-US":"This interview uses enhanced privacy protection","fr":"Votre vie privée est protégée"}',
      );
    });
  },
};

/**
 * A right-to-left language is edited right to left. Arabic is the default
 * language here and has no translation yet, so the note says participants
 * will see the English instead.
 */
export const RightToLeft: Story = {
  args: {
    seedEdit: writtenIn({ defaultLocale: 'ar', locales: ['ar', 'en-US'] }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const title = await canvas.findByRole('textbox', { name: TITLE_LABEL });
    await expect(title.closest('[dir]')).toHaveAttribute('dir', 'rtl');
    await expect(
      canvas.getAllByText(/Not translated into العربية yet/).length,
    ).toBeGreaterThan(0);
  },
};

/** Held elsewhere: every translation can be read and none rewritten. */
export const ASpectator: Story = {
  args: {
    readOnly: true,
    seedEdit: writtenIn({ defaultLocale: 'en-US', locales: ['en-US', 'fr'] }),
  },
};
