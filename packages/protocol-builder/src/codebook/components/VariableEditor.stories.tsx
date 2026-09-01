import type { Meta, StoryObj } from '@storybook/react-vite';
import { useRef, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import type { VariableOption } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import type { ProtocolBuilderProtocolContext } from '../../protocol-context.ts';
import type { CompoundEditResult } from '../../session.ts';
import VariableEditor from './VariableEditor.tsx';

const SUBJECT = { entity: 'node', type: 'person' } as const;
const CONTEXT: ProtocolBuilderProtocolContext = {
  codebook: { node: {}, edge: {} },
  orderedStages: [],
  issues: [],
};
const LOCKED_OPTIONS: readonly VariableOption[] = [
  { label: 'Woman', value: 'woman' },
  { label: 'Man', value: 'man' },
  { label: 'Another identity', value: 'another_identity' },
];

type DemoProps = Readonly<{
  mode: 'create' | 'update';
  locked: boolean;
  readOnly: boolean;
}>;

function VariableEditorDemo({ mode, locked, readOnly }: DemoProps) {
  const [openId, setOpenId] = useState(1);
  const [completedId, setCompletedId] = useState<string | null>(null);
  const requestSequence = useRef(1);
  const existingVariable = {
    name: 'closeness',
    type: 'ordinal',
    options: [
      { label: 'Not close', value: 1 },
      { label: 'Very close', value: 2 },
    ],
  } as const;
  const authoritativeDocument: SectionDoc = {
    name: 'Person',
    color: 'node-color-seq-1',
    shape: { default: 'circle' },
    variables: mode === 'update' ? { closeness: existingVariable } : {},
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
  const common = {
    openId,
    subject: SUBJECT,
    authoritativeDocument,
    description:
      mode === 'create' ? 'Create Storybook attribute' : 'Update closeness',
    createRequestId: () => `storybook-request-${requestSequence.current++}`,
    onSubmitRequest: () => appliedResult,
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
          variableId="closeness"
          initialDraft={existingVariable}
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
  args: { mode: 'create', locked: false, readOnly: false },
} satisfies Meta<typeof VariableEditorDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

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
