import type { Meta, StoryObj } from '@storybook/react-vite';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import { codebookRefusalMessage } from '../compoundFailureCopy.ts';
import CodebookEntityEditor from './CodebookEntityEditor.tsx';

const PERSON: SectionDoc = {
  name: 'Person',
  color: 'node-color-seq-1',
  icon: 'add-a-person',
  shape: { default: 'circle' },
  variables: {
    name: { name: 'Name', type: 'text', component: 'Text' },
  },
};

function ExistingNodeEditor() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <CodebookEntityEditor
        mode="update"
        sessionKey="storybook-person-open-1"
        subject={{ entity: 'node', type: 'person' }}
        initialDraft={PERSON}
        authoritativeDocument={PERSON}
        existingEntityNames={['Place']}
        // Storybook has no host to save to, so every save is refused — which
        // is also what puts the refusal alert on screen to look at.
        onSubmit={() =>
          Promise.resolve({
            status: 'refused' as const,
            message: codebookRefusalMessage({ kind: 'unreachable' }),
            refusal: { kind: 'unreachable' } as const,
          })
        }
      />
    </main>
  );
}

const meta = {
  title: 'Protocol Builder/Codebook/Entity editor',
  component: ExistingNodeEditor,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta<typeof ExistingNodeEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ExistingNode: Story = {};
