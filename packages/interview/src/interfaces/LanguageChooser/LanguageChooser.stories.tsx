import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import SuperJSON from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import StoryInterviewShell from '../../storybook-support/StoryInterviewShell';

const LANGUAGE_SETS = {
  'English, Spanish and Arabic': {
    defaultLocale: 'en',
    locales: ['en', 'es', 'ar'],
  },
  'Arabic, English and Persian': {
    defaultLocale: 'ar',
    locales: ['ar', 'en', 'fa'],
  },
  'Many languages': {
    defaultLocale: 'en',
    locales: [
      'en',
      'es',
      'fr',
      'de',
      'pt-BR',
      'ru',
      'tr',
      'sw',
      'hi',
      'zh-Hans',
      'zh-Hant',
      'ja',
      'ko',
      'ar',
      'he',
      'fa',
    ],
  },
  'One language': { defaultLocale: 'en', locales: ['en'] },
} as const;

type LanguageSet = keyof typeof LANGUAGE_SETS;

type StoryArgs = {
  languages: LanguageSet;
};

const AFTER_TITLE = {
  en: 'Welcome',
  es: 'Bienvenida',
  ar: 'مرحباً',
  fa: 'خوش آمدید',
  fr: 'Bienvenue',
};

const AFTER_TEXT = {
  en: 'The rest of the interview is shown in the language you chose.',
  es: 'El resto de la entrevista se muestra en el idioma que elegiste.',
  ar: 'تُعرض بقية المقابلة باللغة التي اخترتها.',
  fa: 'بقیهٔ مصاحبه به زبانی که انتخاب کردید نمایش داده می‌شود.',
  fr: 'La suite de l’entretien s’affiche dans la langue que vous avez choisie.',
};

// Keeps only the translations the protocol declares, as an authored protocol
// would.
const declared = (
  text: Readonly<Record<string, string>>,
  locales: readonly string[],
) =>
  Object.fromEntries(
    Object.entries(text).filter(([locale]) => locales.includes(locale)),
  );

function buildInterview({ languages }: StoryArgs) {
  const localization = LANGUAGE_SETS[languages];
  const interview = new SyntheticInterview();
  interview.setLocalization(localization);

  interview.addInformationStage({
    title: 'Before',
    text: 'Padding stage before the language chooser.',
  });
  interview.addStage('LanguageChooser');
  interview.addInformationStage({
    title: declared(AFTER_TITLE, localization.locales),
    text: declared(AFTER_TEXT, localization.locales),
  });

  return interview;
}

const LanguageChooserStoryWrapper = ({ languages }: StoryArgs) => {
  const rawPayload = useMemo(
    () =>
      SuperJSON.stringify(
        buildInterview({ languages }).getInterviewPayload({
          currentStep: 1,
        }),
      ),
    [languages],
  );

  // A different protocol needs a fresh interview rather than a re-render.
  return (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell key={languages} rawPayload={rawPayload} />
    </div>
  );
};

const meta: Meta<StoryArgs> = {
  title: 'Interfaces/LanguageChooser',
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    languages: {
      control: 'select',
      options: Object.keys(LANGUAGE_SETS),
      description: 'The languages the protocol declares',
    },
  },
  args: {
    languages: 'English, Spanish and Arabic',
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {
  render: (args) => <LanguageChooserStoryWrapper {...args} />,
};

/** Opens in Arabic, so the stage is laid out right to left. */
export const RightToLeft: Story = {
  render: (args) => <LanguageChooserStoryWrapper {...args} />,
  args: { languages: 'Arabic, English and Persian' },
};

/** Sixteen languages in several scripts, more than fit on one screen. */
export const ManyLanguages: Story = {
  render: (args) => <LanguageChooserStoryWrapper {...args} />,
  args: { languages: 'Many languages' },
};

export const OneLanguage: Story = {
  render: (args) => <LanguageChooserStoryWrapper {...args} />,
  args: { languages: 'One language' },
};
