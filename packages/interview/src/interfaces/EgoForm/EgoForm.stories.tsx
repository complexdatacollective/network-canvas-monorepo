import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { SuperJSON } from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import {
  type ComponentType,
  deterministicProtocolObjectId,
  deterministicVariableId,
  dynamicValueNameFor,
  fieldBlockMarkdown,
  optionCaseKey,
} from '@codaco/protocol-validation';

import StoryInterviewShell from '../../storybook-support/StoryInterviewShell';

/** The namespace the ids of the logic story's protocol are made in. */
const STORY_IDS = '6b2d0c1e-2f4a-4e8b-9a77-3d5f1c0b9e21';

const FIELD_PRESETS: { component: ComponentType; prompt: string }[] = [
  { component: 'Text', prompt: 'What is your name?' },
  { component: 'Number', prompt: 'How old are you?' },
  { component: 'TextArea', prompt: 'Describe yourself briefly.' },
  { component: 'Toggle', prompt: 'Do you live alone?' },
  { component: 'Boolean', prompt: 'Are you currently employed?' },
  { component: 'RadioGroup', prompt: 'What is your highest education level?' },
  {
    component: 'CheckboxGroup',
    prompt: 'Which languages do you speak?',
  },
  {
    component: 'LikertScale',
    prompt: 'How would you rate your overall health?',
  },
  {
    component: 'VisualAnalogScale',
    prompt: 'How happy are you right now?',
  },
];

type StoryArgs = {
  fieldCount: number;
  introductionTitle: string;
};

function buildInterview(args: StoryArgs) {
  const interview = new SyntheticInterview();

  interview.addInformationStage({
    title: 'Welcome',
    text: 'Before the main stage.',
  });

  const stage = interview.addStage('EgoForm', {
    label: 'About You',
    form: {
      fields: [],
      content: ({ fields, heading }) =>
        [heading(args.introductionTitle), ...fields].join('\n\n'),
    },
  });

  const fieldCount = Math.min(args.fieldCount, FIELD_PRESETS.length);
  for (let i = 0; i < fieldCount; i++) {
    const preset = FIELD_PRESETS[i]!;
    stage.addFormField({
      component: preset.component,
      prompt: preset.prompt,
    });
  }

  interview.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });

  return interview;
}

const EgoFormStoryWrapper = (args: StoryArgs) => {
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
  title: 'Interfaces/EgoForm',
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    fieldCount: {
      control: { type: 'range', min: 1, max: FIELD_PRESETS.length },
      description: 'Number of form fields',
    },
    introductionTitle: {
      control: 'text',
      description: 'Heading shown above the questions',
    },
  },
  args: {
    fieldCount: 4,
    introductionTitle: 'About You',
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {
  render: (args) => <EgoFormStoryWrapper {...args} />,
};

function buildValidatedInterview() {
  const interview = new SyntheticInterview();

  interview.addInformationStage({
    title: 'Welcome',
    text: 'Before the main stage.',
  });

  const stage = interview.addStage('EgoForm', {
    label: 'About You (Validated)',
    form: {
      fields: [],
      content: ({ fields, heading }) =>
        [heading('About You'), ...fields].join('\n\n'),
    },
  });

  stage.addFormField({
    component: 'Text',
    prompt: 'What is your name? (required, 2–50 characters)',
    validation: { required: true, minLength: 2, maxLength: 50 },
  });
  stage.addFormField({
    component: 'Number',
    prompt: 'How old are you? (required, 0–120)',
    validation: { required: true, minValue: 0, maxValue: 120 },
  });
  stage.addFormField({
    component: 'TextArea',
    prompt: 'Describe yourself briefly. (required, 20–500 characters)',
    validation: { required: true, minLength: 20, maxLength: 500 },
  });
  stage.addFormField({
    component: 'Toggle',
    prompt: 'Do you live alone?',
  });
  stage.addFormField({
    component: 'Boolean',
    prompt: 'Are you currently employed? (required)',
    validation: { required: true },
  });
  stage.addFormField({
    component: 'RadioGroup',
    prompt: 'What is your highest education level? (required)',
    validation: { required: true },
  });
  stage.addFormField({
    component: 'CheckboxGroup',
    prompt: 'Which languages do you speak? (required, pick 1–3)',
    validation: { required: true, minSelected: 1, maxSelected: 3 },
  });
  stage.addFormField({
    component: 'LikertScale',
    prompt: 'How would you rate your overall health? (required)',
    validation: { required: true },
  });
  stage.addFormField({
    component: 'VisualAnalogScale',
    prompt: 'How happy are you right now? (required)',
    validation: { required: true },
  });

  interview.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });

  return interview;
}

const ValidatedEgoFormStoryWrapper = () => {
  const interview = useMemo(() => buildValidatedInterview(), []);
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

export const WithValidation: Story = {
  render: () => <ValidatedEgoFormStoryWrapper />,
  parameters: {
    docs: {
      description: {
        story:
          'Demonstrates every available EgoForm field component together with validation rules (required fields, min/max values, length constraints, and selection limits). The form overflows the viewport, so the scroll nudge appears after 15 seconds and hides once the bottom is reached. Try advancing without completing fields to see error messages and the scroll-to-first-error behavior.',
      },
    },
  },
};

const EMPLOYMENT = {
  name: deterministicVariableId(STORY_IDS)('first name'),
  status: deterministicVariableId(STORY_IDS)('employment status'),
  employer: deterministicVariableId(STORY_IDS)('employer'),
  employed: deterministicProtocolObjectId(STORY_IDS)('option employed'),
  fields: {
    name: deterministicProtocolObjectId(STORY_IDS)('field name'),
    status: deterministicProtocolObjectId(STORY_IDS)('field status'),
    employer: deterministicProtocolObjectId(STORY_IDS)('field employer'),
  },
};

const STATUS_OPTIONS = [
  ['option employed', 'employed', 'Employed'],
  ['option self-employed', 'self-employed', 'Self-employed'],
  ['option unemployed', 'unemployed', 'Unemployed'],
  ['option student', 'student', 'Student'],
  ['option retired', 'retired', 'Retired'],
] as const;

/**
 * The approved Ego Form: one text, with a heading, a paragraph showing
 * today's date, two questions, and a logic block that shows "Your work" and
 * the employer question only to someone who is employed.
 */
function buildLogicInterview() {
  const interview = new SyntheticInterview();
  interview.addStage('EgoForm', { label: 'About You' });
  const payload = interview.getInterviewPayload({ currentStep: 0 });
  const { protocol } = payload;
  // Every text in the protocol's own language.
  const locale = protocol.localization.defaultLocale;

  const statusName = dynamicValueNameFor({
    kind: 'attribute',
    role: 'ego',
    variableId: EMPLOYMENT.status,
  });
  const content = [
    '# About you',
    `Please answer the questions below about your situation on {${dynamicValueNameFor({ kind: 'intrinsic', name: 'now' })}}.`,
    fieldBlockMarkdown(EMPLOYMENT.fields.name),
    fieldBlockMarkdown(EMPLOYMENT.fields.status),
    `{${statusName}, select, missing {} ${optionCaseKey(EMPLOYMENT.employed)} {## Your work\n\n${fieldBlockMarkdown(EMPLOYMENT.fields.employer)}} other {}}`,
  ].join('\n\n');

  const [stage, ...rest] = protocol.stages;
  return {
    ...payload,
    protocol: {
      ...protocol,
      codebook: {
        ...protocol.codebook,
        ego: {
          ...protocol.codebook.ego,
          variables: {
            ...protocol.codebook.ego?.variables,
            [EMPLOYMENT.name]: {
              name: 'first_name',
              type: 'text',
              component: 'Text',
              validation: { required: true },
            },
            [EMPLOYMENT.status]: {
              name: 'employment_status',
              type: 'categorical',
              component: 'ToggleButtonGroup',
              options: STATUS_OPTIONS.map(([id, value, label]) => ({
                id: deterministicProtocolObjectId(STORY_IDS)(id),
                value,
                label: { [locale]: label },
              })),
              validation: { required: true, minSelected: 1 },
            },
            [EMPLOYMENT.employer]: {
              name: 'employer',
              type: 'text',
              component: 'Text',
              validation: { required: true },
            },
          },
        },
      },
      stages: [
        {
          ...stage,
          form: {
            content: { [locale]: content },
            fields: [
              {
                id: EMPLOYMENT.fields.name,
                variable: EMPLOYMENT.name,
                prompt: { [locale]: 'What is your first name?' },
                hint: {
                  [locale]:
                    'We use your first name only during this interview.',
                },
              },
              {
                id: EMPLOYMENT.fields.status,
                variable: EMPLOYMENT.status,
                prompt: { [locale]: 'What is your employment status?' },
                hint: { [locale]: 'Choose every option that applies to you.' },
                showValidationHints: true,
              },
              {
                id: EMPLOYMENT.fields.employer,
                variable: EMPLOYMENT.employer,
                prompt: { [locale]: 'Who is your employer?' },
                hint: {
                  [locale]:
                    'If you are self-employed, enter the name of your business.',
                },
              },
            ],
          },
        },
        ...rest,
      ],
    },
  };
}

const LogicEgoFormStoryWrapper = () => {
  const rawPayload = useMemo(
    () => SuperJSON.stringify(buildLogicInterview()),
    [],
  );
  return (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell rawPayload={rawPayload} />
    </div>
  );
};

export const LogicRevealsField: Story = {
  render: () => <LogicEgoFormStoryWrapper />,
  parameters: {
    docs: {
      description: {
        story:
          'A form is one text. Its logic block shows the "Your work" heading and the employer question only once the participant answers that they are employed, and screen readers hear that a new question is shown.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const employed = await canvas.findByRole('checkbox', { name: 'Employed' });
    await expect(
      canvas.getByRole('heading', { name: 'About you', level: 1 }),
    ).toBeVisible();
    expect(
      canvas.queryByRole('textbox', { name: /Who is your employer\?/ }),
    ).toBeNull();
    expect(canvas.queryByRole('heading', { name: 'Your work' })).toBeNull();

    await userEvent.click(employed);

    await expect(
      await canvas.findByRole('textbox', { name: /Who is your employer\?/ }),
    ).toBeVisible();
    await expect(
      canvas.getByRole('heading', { name: 'Your work', level: 2 }),
    ).toBeVisible();
    // Screen readers hear it from the form's own status message.
    await waitFor(() =>
      expect(
        canvas
          .getAllByRole('status')
          .some((region) =>
            region.textContent.includes('A new question is shown.'),
          ),
      ).toBe(true),
    );

    // Taking the answer back hides the question again.
    await userEvent.click(employed);
    await waitFor(() =>
      expect(
        canvas.queryByRole('textbox', { name: /Who is your employer\?/ }),
      ).toBeNull(),
    );
  },
};
