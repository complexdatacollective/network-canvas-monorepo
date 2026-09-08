import type { Meta, StoryObj } from '@storybook/react-vite';
import { useRef, useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import Button from '@codaco/fresco-ui/Button';
import type { VariableOption } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import type { ProtocolBuilderProtocolContext } from '../../protocol-context.ts';
import type { CompoundEditResult } from '../../session.ts';
import type { AuxiliaryCodebookSubmitResult } from '../editing.ts';
import VariableEditor from './VariableEditor.tsx';

const SUBJECT = { entity: 'node', type: 'person' } as const;
const CONTEXT: ProtocolBuilderProtocolContext = {
  codebook: { node: {}, edge: {} },
  assets: {},
  orderedStages: [],
  issues: [],
};
const LOCKED_OPTIONS: readonly VariableOption[] = [
  { label: 'Woman', value: 'woman' },
  { label: 'Man', value: 'man' },
  { label: 'Another identity', value: 'another_identity' },
];

/**
 * One attribute, in the state the editor opens on it.
 *
 * `committed` is what the codebook holds and `draft` is what the host opened
 * the editor with, which are not the same thing: a host opens this editor on
 * the control and the values the researcher has just chosen, and the two are
 * what decide whether the save button is live at all. Every case whose draft
 * differs from its committed variable can therefore be saved, which is what
 * puts each surface's own refusal on screen.
 */
type SurfaceCase = Readonly<{
  variableId: string;
  committed: SectionDoc;
  draft: SectionDoc;
  /**
   * A sentence the HOST refuses the save with, already written for a
   * researcher — see `AuxiliaryCodebookContradiction`. Absent, the save is
   * accepted.
   */
  contradiction?: string;
}>;

const CLOSENESS: SectionDoc = {
  name: 'closeness',
  type: 'ordinal',
  options: [
    { label: 'Not close', value: 1 },
    { label: 'Very close', value: 2 },
  ],
};

const SURFACES = {
  /** A choice list, which is what every earlier story here showed. */
  options: {
    variableId: 'closeness',
    committed: CLOSENESS,
    draft: CLOSENESS,
  },
  /**
   * The two answers a yes/no attribute puts in front of a participant, opened
   * with one of them cleared — the state the schema accepts and a participant
   * cannot answer.
   */
  booleanAnswers: {
    variableId: 'consent',
    committed: {
      name: 'consent',
      type: 'boolean',
      component: 'Boolean',
      options: [
        { label: 'I agree', value: true },
        { label: 'I do not agree', value: false, negative: true },
      ],
    },
    draft: {
      name: 'consent',
      type: 'boolean',
      component: 'Boolean',
      options: [
        { label: 'I agree', value: true },
        { label: '', value: false, negative: true },
      ],
    },
  },
  /** A date field's resolution and the two dates it is bounded by, reversed. */
  dateSettings: {
    variableId: 'met',
    committed: {
      name: 'met',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'full', min: '2020-01-01', max: '2024-12-31' },
    },
    draft: {
      name: 'met',
      type: 'datetime',
      component: 'DatePicker',
      parameters: { type: 'full', min: '2024-01-01', max: '2020-01-01' },
    },
  },
  /** The words at each end of a sliding scale, with the high end cleared. */
  scaleSettings: {
    variableId: 'rapport',
    committed: {
      name: 'rapport',
      type: 'scalar',
      component: 'VisualAnalogScale',
      parameters: { minLabel: 'Not at all close', maxLabel: 'Extremely close' },
    },
    draft: {
      name: 'rapport',
      type: 'scalar',
      component: 'VisualAnalogScale',
      parameters: { minLabel: 'Not at all close', maxLabel: '   ' },
    },
  },
  /**
   * A change the codebook schema and the host both accept and the protocol
   * still cannot hold: a rule requiring three answers, left two to choose
   * from. The sentence arrives already written for the researcher, so the
   * editor shows it as it was written rather than replacing it with its own.
   */
  contradiction: {
    variableId: 'preference',
    committed: {
      name: 'preference',
      type: 'categorical',
      options: [
        { label: 'Low', value: 'low' },
        { label: 'Middle', value: 'middle' },
        { label: 'High', value: 'high' },
      ],
      validation: { minSelected: 3 },
    },
    draft: {
      name: 'preference',
      type: 'categorical',
      options: [
        { label: 'Low', value: 'low' },
        { label: 'Middle', value: 'middle' },
      ],
      validation: { minSelected: 3 },
    },
    contradiction:
      '“Minimum selected” requires 3 answers, but this attribute has only 2 options to choose from.',
  },
} as const satisfies Record<string, SurfaceCase>;

type SurfaceName = keyof typeof SURFACES;

type DemoProps = Readonly<{
  mode: 'create' | 'update';
  surface: SurfaceName;
  locked: boolean;
  readOnly: boolean;
}>;

function VariableEditorDemo({ mode, surface, locked, readOnly }: DemoProps) {
  const [openId, setOpenId] = useState(1);
  const [completedId, setCompletedId] = useState<string | null>(null);
  const requestSequence = useRef(1);
  const held: SurfaceCase = SURFACES[surface];
  const authoritativeDocument: SectionDoc = {
    name: 'Person',
    color: 'node-color-seq-1',
    shape: { default: 'circle' },
    variables: mode === 'update' ? { [held.variableId]: held.committed } : {},
  };
  const appliedResult: CompoundEditResult = {
    status: 'applied',
    update: {
      protocolSections: {},
      manifestRevision: {
        sequence: BigInt(requestSequence.current),
        hash: `storybook-${requestSequence.current}`,
      },
    },
  };
  const answer = (): AuxiliaryCodebookSubmitResult =>
    held.contradiction === undefined
      ? appliedResult
      : { status: 'contradiction', message: held.contradiction };
  const common = {
    openId,
    subject: SUBJECT,
    authoritativeDocument,
    description:
      mode === 'create'
        ? 'Create Storybook attribute'
        : `Update ${held.variableId}`,
    createRequestId: () => `storybook-request-${requestSequence.current++}`,
    onSubmitRequest: answer,
    onComplete: setCompletedId,
    readOnly,
  } as const;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <p role="status" className="text-muted">
          {completedId === null
            ? 'No accepted edit yet.'
            : `Accepted attribute id: ${completedId}`}
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setCompletedId(null);
            setOpenId((current) => current + 1);
          }}
        >
          Start a fresh open
        </Button>
      </div>
      {mode === 'create' ? (
        <VariableEditor
          {...common}
          mode="create"
          variableId="new-attribute"
          initialDraft={{
            name: locked ? 'biologicalSex' : '',
            type: 'categorical',
            options: [],
          }}
          protocolContext={CONTEXT}
          lockedOptions={locked ? LOCKED_OPTIONS : null}
        />
      ) : (
        <VariableEditor
          {...common}
          mode="update"
          variableId={held.variableId}
          initialDraft={held.draft}
        />
      )}
    </main>
  );
}

const meta = {
  title: 'Protocol Builder/Codebook/Variable editor',
  component: VariableEditorDemo,
  parameters: {
    docs: {
      description: {
        component:
          'A host-neutral attribute editor backed by an isolated auxiliary draft session. Change "openId" for every opening so a rapid close and reopen always starts with fresh form state.',
      },
    },
  },
  tags: ['autodocs'],
  args: { mode: 'create', surface: 'options', locked: false, readOnly: false },
} satisfies Meta<typeof VariableEditorDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A story that presses save and reads what comes back is pinned to English.
 *
 * The toolbar's Language control is what a reviewer switches to see which
 * strings a surface still hard-codes, and it applies to every story in the
 * Storybook — so a play asserting on an English sentence would fail for
 * anyone who had left the control on Español. Pinning the story's own locale
 * leaves the control free to do its job everywhere else.
 */
const inEnglish = { globals: { appLocale: 'en' } };

export const NewCategoricalVariable: Story = {};

export const ExistingVariable: Story = {
  args: { mode: 'update' },
};

export const InterfaceOwnedOptions: Story = {
  args: { locked: true },
};

export const ReadOnly: Story = {
  args: { mode: 'update', readOnly: true },
};

/**
 * The words on the two answers a boolean choice offers, and what happens when
 * only one of them is written.
 */
export const BooleanAnswers: Story = {
  args: { mode: 'update', surface: 'booleanAnswers' },
  ...inEnglish,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('textbox', { name: 'Label for “true”' }),
    ).toHaveValue('I agree');

    await userEvent.click(
      canvas.getByRole('button', { name: 'Save attribute' }),
    );

    await expect(
      await canvas.findByText(
        'Write what this answer says, or clear both to offer Yes and No.',
      ),
    ).toBeVisible();
  },
};

/**
 * A date field's resolution and the two dates it is bounded by, opened on a
 * range that runs backwards.
 */
export const DateSettings: Story = {
  args: { mode: 'update', surface: 'dateSettings' },
  ...inEnglish,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('combobox', { name: 'Date resolution' }),
    ).toHaveValue('full');

    await userEvent.click(
      canvas.getByRole('button', { name: 'Save attribute' }),
    );

    await expect(
      await canvas.findByText(
        'The latest date cannot be earlier than the earliest date.',
      ),
    ).toBeVisible();
  },
};

/** The words a participant reads at each end of a sliding scale. */
export const ScaleSettings: Story = {
  args: { mode: 'update', surface: 'scaleSettings' },
  ...inEnglish,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('textbox', { name: 'Minimum label' }),
    ).toHaveValue('Not at all close');

    await userEvent.click(
      canvas.getByRole('button', { name: 'Save attribute' }),
    );

    await expect(
      await canvas.findByText('Write what the high end of the scale means.'),
    ).toBeVisible();
  },
};

/**
 * The one refusal shown in the words it arrived in, because they name the rule
 * and the values that cannot both hold.
 */
export const RefusedByContradiction: Story = {
  args: { mode: 'update', surface: 'contradiction' },
  ...inEnglish,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Save attribute' }),
    );

    const alert = await canvas.findByRole('alert');
    await expect(alert).toHaveTextContent(
      '“Minimum selected” requires 3 answers',
    );
    await expect(alert).not.toHaveTextContent('Wait a moment and try again');
  },
};
