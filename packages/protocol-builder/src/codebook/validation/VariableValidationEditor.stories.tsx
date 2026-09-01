import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import type { ValidationMap } from '../variableValidation.ts';
import VariableValidationEditor from './VariableValidationEditor.tsx';

const variables = {
  age: { name: 'Age', type: 'number', component: 'Number' },
  height: { name: 'Height', type: 'number', component: 'Number' },
  nickname: { name: 'Nickname', type: 'text', component: 'Text' },
};

function ValidationEditorProof() {
  const [validation, setValidation] = useState<ValidationMap>({
    required: true,
    minValue: 0,
  });

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-2xl font-bold text-current">Age validation</h1>
      <VariableValidationEditor
        entity="node"
        variableType="number"
        currentVariableId="age"
        allVariables={variables}
        value={validation}
        onChange={setValidation}
      />
    </main>
  );
}

const meta = {
  title: 'Protocol Builder/Codebook/Variable validation editor',
  component: ValidationEditorProof,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ValidationEditorProof>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
