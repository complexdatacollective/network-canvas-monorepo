import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, waitFor, within } from 'storybook/test';
import { SuperJSON } from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import StoryInterviewShell from '../../storybook-support/StoryInterviewShell';

type StoryArgs = {
  title: string;
  content: string;
};

function buildInterview(args: StoryArgs) {
  const interview = new SyntheticInterview();

  interview.addInformationStage({
    title: 'Before',
    text: 'Padding stage before the main information stage.',
  });

  interview.addInformationStage({
    title: args.title,
    text: args.content,
  });

  interview.addInformationStage({
    title: 'After',
    text: 'Padding stage after the main information stage.',
  });

  return interview;
}

const InformationStoryWrapper = (args: StoryArgs) => {
  const configKey = JSON.stringify(args);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const interview = useMemo(() => buildInterview(args), [configKey]);
  const rawPayload = useMemo(
    () =>
      SuperJSON.stringify(interview.getInterviewPayload({ currentStep: 1 })),
    [interview],
  );

  return (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell rawPayload={rawPayload} />
    </div>
  );
};

const meta: Meta<StoryArgs> = {
  title: 'Interfaces/Information',
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    title: {
      control: 'text',
      description: 'Stage title displayed as a heading',
    },
    content: {
      control: { type: 'text' },
      description: 'Markdown content displayed in the stage body',
    },
  },
  args: {
    title: 'Welcome',
    content:
      'Thank you for participating in this study. Please read each screen carefully and follow the instructions provided.',
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {
  render: (args) => <InformationStoryWrapper {...args} />,
};

export const LongContent: Story = {
  render: (args) => <InformationStoryWrapper {...args} />,
  args: {
    title: 'Study Instructions',
    content: [
      '## Overview',
      '',
      'This study explores how people maintain social connections in an',
      'increasingly connected world. You will be asked a series of questions',
      'about the people in your life and how they relate to one another.',
      'The information you provide will help researchers understand the',
      'structure of personal networks and how they change over time.',
      '',
      'Before we begin, please take a moment to read through this guide',
      'carefully. It explains what to expect, how your data will be handled,',
      'and what you can do if you have questions or concerns at any point',
      'during the interview.',
      '',
      '## What to Expect',
      '',
      'The interview is divided into several sections, each designed to',
      'capture a different aspect of your personal network. You will be',
      'guided through each section in turn, and you can take breaks as',
      'needed. The following activities make up the core of the interview:',
      '',
      '- **Name Generator**: List people you interact with regularly, using',
      '  a variety of prompts to help you think of different parts of your',
      '  life — family, friends, colleagues, neighbours, and acquaintances.',
      '- **Categorisation**: Group those people by relationship type, by',
      '  how often you see them, and by how close you feel to them.',
      '- **Dyad Census**: Indicate which of your contacts know each other,',
      '  which helps us understand the broader structure of your network.',
      '- **Attribute Questions**: Answer a series of short questions about',
      '  each person you have listed, such as how you met them and how',
      '  long you have known them.',
      '',
      '## Privacy and Confidentiality',
      '',
      'We take the privacy of your responses very seriously. All data is',
      'stored securely, and any information that could identify you or the',
      'people you mention will be removed before the data is analysed or',
      'shared. Only the research team will have access to the raw data,',
      'and it will be retained only for as long as necessary to complete',
      'the research.',
      '',
      'You may withdraw from the study at any time without giving a reason,',
      'and you can request that your data be deleted up until the point of',
      'publication. If you have any concerns about how your data is being',
      'used, please contact the research team using the details provided',
      'in your information sheet.',
      '',
      '## Important Notes',
      '',
      '1. There are no right or wrong answers — we are interested in your',
      '   honest perspective, whatever that may be.',
      '2. All responses are **confidential** and will be anonymised before',
      '   being used in any reports or publications.',
      '3. You may skip any question you are uncomfortable answering, and',
      '   you may end the interview at any time.',
      '4. The session typically takes 30-45 minutes to complete, depending',
      '   on the size of your personal network.',
      '5. If you need to pause, you can close the browser and return later',
      '   — your progress will be saved automatically.',
      '',
      '## Tips for a Good Interview',
      '',
      'To get the most out of this interview, try to find a quiet place',
      'where you can concentrate without interruption. Have a think about',
      'the different people in your life before you start, as this will',
      'make the name generation activities easier. Do not worry about',
      'remembering every single person — focus on those who are most',
      'relevant to the prompts as they appear.',
      '',
      'If you are unsure about how to answer a question, go with your',
      'first instinct. The interview is designed to capture your subjective',
      'experience of your network, so there is no need to overthink your',
      'responses.',
      '',
      '## Getting Help',
      '',
      'If you have questions at any point, please ask the interviewer for',
      'clarification. You can also refer back to this introduction at any',
      'time by using the navigation controls at the bottom of the screen.',
      'Thank you once again for taking part — your contribution is greatly',
      'appreciated.',
    ].join('\n'),
  },
};

export const MarkdownFormatting: Story = {
  render: (args) => <InformationStoryWrapper {...args} />,
  args: {
    title: 'Formatting Demo',
    content: [
      '# Heading 1',
      '',
      '## Heading 2',
      '',
      '### Heading 3',
      '',
      'Regular paragraph with **bold text** and *italic text*.',
      '',
      '---',
      '',
      '### Unordered List',
      '',
      '- First item',
      '- Second item',
      '  - Nested item',
      '- Third item',
      '',
      '### Ordered List',
      '',
      '1. Step one',
      '2. Step two',
      '3. Step three',
      '',
      '### Hyperlinks',
      '',
      'Visit the [Network Canvas documentation](https://documentation.networkcanvas.com/en/fresco)',
      'for more information about Fresco.',
      '',
      '### Emoji',
      '',
      'Emoji are written as the characters themselves:',
      '👋 Hello and welcome! 🎉',
      '',
      '- ❤️ Thanks for taking part',
      '- 📝 Take your time answering',
      '- 🚀 Let us get started',
    ].join('\n'),
  },
};

// Assets are served from addresses the story gives, so these are made in
// place: a picture in four quadrants, and half a second of silence.
const PICTURE_URL = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="200" height="150" fill="#e63946"/><rect x="200" width="200" height="150" fill="#457b9d"/><rect y="150" width="200" height="150" fill="#f4a261"/><rect x="200" y="150" width="200" height="150" fill="#2a9d8f"/></svg>',
)}`;

const SILENCE_URL = (() => {
  const samples = 4000;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      bytes[offset + i] = value.charCodeAt(i);
    }
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, 'data');
  view.setUint32(40, samples, true);
  bytes.fill(128, 44);
  return `data:audio/wav;base64,${btoa(String.fromCharCode(...bytes))}`;
})();

function buildBlockSettingsInterview() {
  const interview = new SyntheticInterview();
  interview.addAsset({
    assetId: 'picture',
    name: 'picture',
    type: 'image',
    url: PICTURE_URL,
  });
  interview.addAsset({
    assetId: 'silence',
    name: 'silence',
    type: 'audio',
    url: SILENCE_URL,
  });

  interview.addInformationStage({
    title: 'Before',
    text: 'Padding stage before the main information stage.',
  });
  interview.addInformationStage({
    title: 'Block settings',
    text: 'Each picture is held to a size and is centred on the page. The recordings do not start by themselves and do not repeat.',
    blocks: [
      {
        assetId: 'picture',
        size: 'small',
        description: 'A small picture',
      },
      {
        assetId: 'picture',
        size: 'medium',
        description: 'A medium picture',
      },
      {
        assetId: 'picture',
        size: 'large',
        description: 'A large picture',
      },
      {
        assetId: 'silence',
        autoplay: false,
        loop: false,
        description: 'A recording that does not start or repeat',
      },
    ],
  });
  interview.addInformationStage({
    title: 'After',
    text: 'Padding stage after the main information stage.',
  });
  return interview;
}

const BlockSettingsWrapper = () => {
  const rawPayload = useMemo(
    () =>
      SuperJSON.stringify(
        buildBlockSettingsInterview().getInterviewPayload({ currentStep: 1 }),
      ),
    [],
  );
  return (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell rawPayload={rawPayload} />
    </div>
  );
};

/**
 * An image's size, and an audio recording's autoplay and loop settings, as a
 * researcher writes them in the page's text. Every block is centred.
 */
export const BlockSettings: Story = {
  render: () => <BlockSettingsWrapper />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const small = await canvas.findByRole('img', { name: 'A small picture' });
    const large = await canvas.findByRole('img', { name: 'A large picture' });
    await expect(small).toHaveClass('max-h-48', 'object-contain');
    await expect(large).toHaveClass('max-h-[60vh]', 'object-contain');
    await expect(
      canvas.getByRole('img', { name: 'A medium picture' }),
    ).toHaveClass('max-h-96');

    const recording = await canvas.findByLabelText(
      'A recording that does not start or repeat',
    );
    // Centred on its line, as every block is.
    await expect(recording.parentElement).toHaveClass('justify-center');
    await waitFor(() => expect(recording).toBeInstanceOf(HTMLAudioElement));
    if (!(recording instanceof HTMLAudioElement)) return;
    await expect(recording.autoplay).toBe(false);
    await expect(recording.loop).toBe(false);
  },
};
