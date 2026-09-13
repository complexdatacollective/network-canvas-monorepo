import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

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
        onSubmitDocument={(document) => {
          // The proof host is this story's own state: a save writes the whole
          // section back, exactly as a host does.
          globalThis.setTimeout(() => setAuthoritative(document), 0);
          return Promise.resolve({
            status: 'applied' as const,
            sectionId: sectionId({ kind: 'codebookNode', typeId: 'person' }),
          });
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
