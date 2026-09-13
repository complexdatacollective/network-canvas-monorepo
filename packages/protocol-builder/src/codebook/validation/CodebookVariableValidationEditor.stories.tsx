import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import CodebookVariableValidationEditor, {
  DraftVariableValidationEditor,
} from './CodebookVariableValidationEditor.tsx';

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

/**
 * The same surface for an attribute that does not exist yet: a row is
 * inventing it, and the rules it is given here are written with the create.
 * Its save goes to the row rather than to a host, which is why there is no
 * proof host under it.
 */
function DraftSurfaceProof() {
  const [held, setHeld] = useState<Record<string, unknown>>({});

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <DraftVariableValidationEditor
        openId="nickname-draft-story"
        entity="node"
        variableName="nickname"
        variableType="text"
        allVariables={variablesFrom(initialDocument)}
        value={{}}
        onSave={setHeld}
      />
      <pre className="text-sm">{JSON.stringify(held, null, 2)}</pre>
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

export const ForAnAttributeBeingInvented: StoryObj<typeof DraftSurfaceProof> = {
  render: () => <DraftSurfaceProof />,
};
