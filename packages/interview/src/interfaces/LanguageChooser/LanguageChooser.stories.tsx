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
  'One language': { defaultLocale: 'en', locales: ['en'] },
  'Unspecified and French': { defaultLocale: 'und', locales: ['und', 'fr'] },
} as const;

type LanguageSet = keyof typeof LANGUAGE_SETS;

type StoryArgs = {
  languages: LanguageSet;
  showIntroduction: boolean;
};

const INTRODUCTION = {
  en: 'This study is available in more than one language. Choose the one you would like to use for the rest of the interview.',
  es: 'Este estudio está disponible en más de un idioma. Elige el que quieras usar durante el resto de la entrevista.',
  ar: 'هذه الدراسة متاحة بأكثر من لغة. اختر اللغة التي تفضّل استخدامها في بقية المقابلة.',
  fr: 'Cette étude est proposée dans plusieurs langues. Choisissez celle que vous souhaitez utiliser pour la suite de l’entretien.',
  und: 'This study is available in more than one language.',
};

const AFTER_TITLE = {
  en: 'Welcome',
  es: 'Bienvenida',
  ar: 'مرحباً',
  fr: 'Bienvenue',
  und: 'Welcome',
};

const AFTER_TEXT = {
  en: 'The rest of the interview is shown in the language you chose.',
  es: 'El resto de la entrevista se muestra en el idioma que elegiste.',
  ar: 'تُعرض بقية المقابلة باللغة التي اخترتها.',
  fr: 'La suite de l’entretien s’affiche dans la langue que vous avez choisie.',
  und: 'The rest of the interview is shown in the language you chose.',
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

function buildInterview({ languages, showIntroduction }: StoryArgs) {
  const localization = LANGUAGE_SETS[languages];
  const interview = new SyntheticInterview();
  interview.setLocalization(localization);

  interview.addInformationStage({
    title: 'Before',
    text: 'Padding stage before the language chooser.',
  });
  interview.addStage(
    'LanguageChooser',
    showIntroduction
      ? { introduction: declared(INTRODUCTION, localization.locales) }
      : {},
  );
  interview.addInformationStage({
    title: declared(AFTER_TITLE, localization.locales),
    text: declared(AFTER_TEXT, localization.locales),
  });

  return interview;
}

const LanguageChooserStoryWrapper = ({
  languages,
  showIntroduction,
}: StoryArgs) => {
  const rawPayload = useMemo(
    () =>
      SuperJSON.stringify(
        buildInterview({ languages, showIntroduction }).getInterviewPayload({
          currentStep: 1,
        }),
      ),
    [languages, showIntroduction],
  );

  // A different protocol needs a fresh interview rather than a re-render.
  return (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell
        key={`${languages}-${String(showIntroduction)}`}
        rawPayload={rawPayload}
      />
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
    showIntroduction: {
      control: 'boolean',
      description: 'Whether the researcher wrote an introduction',
    },
  },
  args: {
    languages: 'English, Spanish and Arabic',
    showIntroduction: true,
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {
  render: (args) => <LanguageChooserStoryWrapper {...args} />,
};

export const WithoutIntroduction: Story = {
  render: (args) => <LanguageChooserStoryWrapper {...args} />,
  args: { showIntroduction: false },
};

export const OneLanguage: Story = {
  render: (args) => <LanguageChooserStoryWrapper {...args} />,
  args: { languages: 'One language' },
};

export const UnspecifiedLanguage: Story = {
  render: (args) => <LanguageChooserStoryWrapper {...args} />,
  args: { languages: 'Unspecified and French' },
};
