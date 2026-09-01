import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { applyCommands, type SectionDoc } from '@codaco/studio-sync/apply';

import type { CompoundEditResult } from '../../session.ts';
import CodebookVariableValidationEditor from './CodebookVariableValidationEditor.tsx';

const initialDocument: SectionDoc = {
  name: 'Person',
  color: 'node-color-seq-1',
  shape: { default: 'circle' },
  variables: {
    age: {
      name: 'Age',
      type: 'number',
      component: 'Number',
      validation: { required: true, minValue: 0 },
    },
    height: {
      name: 'Height',
      type: 'number',
      component: 'Number',
    },
  },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const variablesFrom = (document: SectionDoc): Record<string, unknown> =>
  isRecord(document.variables) ? document.variables : {};

function ValidationSurfaceProof() {
  const [authoritative, setAuthoritative] =
    useState<SectionDoc>(initialDocument);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <CodebookVariableValidationEditor
        openId="age-validation-story"
        subject={{ entity: 'node', type: 'person' }}
        variableId="age"
        authoritativeEntityDocument={authoritative}
        allSubjectVariables={variablesFrom(authoritative)}
        requestMetadata={{
          createId: () => 'story-update-age-validation',
          description: 'Update Age validation',
        }}
        onSubmitRequest={(request) => {
          const edit = request.edits[0];
          if (edit?.kind === 'update') {
            globalThis.setTimeout(
              () =>
                setAuthoritative((current) =>
                  applyCommands(current, [...edit.commands]),
                ),
              0,
            );
          }
          return {
            status: 'applied',
            update: {
              protocolSections: {},
              manifestRevision: { sequence: 2n, hash: 'story-revision-2' },
            },
          } satisfies CompoundEditResult;
        }}
      />
    </main>
  );
}

const meta = {
  title: 'Protocol Builder/Codebook/Variable validation surface',
  component: ValidationSurfaceProof,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ValidationSurfaceProof>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
