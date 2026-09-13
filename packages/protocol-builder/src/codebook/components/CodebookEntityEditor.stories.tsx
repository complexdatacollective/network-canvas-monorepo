import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import { buttonPaint, TRANSPARENT } from '../../testing/buttonPaint.ts';
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
        // Present so the pair of footer buttons is the pair a researcher meets.
        onCancel={() => undefined}
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

export const ExistingNode: Story = {
  /**
   * Architect's dialog footer is a filled `color="default"` cancel beside a
   * filled `color="primary"` submit (`DialogForm.tsx:166,173`). The package
   * drew cancel as a hollow outline button, which is a style Architect has
   * nowhere — so the two controls read as different kinds of thing.
   */
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const cancel = buttonPaint(canvas.getByRole('button', { name: 'Cancel' }));
    await expect(cancel.colour).toBe(cancel.token('neutral'));
    await expect(cancel.background).not.toBe(TRANSPARENT);
    await expect(cancel.borderWidth).toBe('0px');

    const submit = buttonPaint(
      canvas.getByRole('button', { name: 'Save entity' }),
    );
    await expect(submit.colour).toBe(submit.token('primary'));
    await expect(submit.background).not.toBe(TRANSPARENT);
    await expect(submit.borderWidth).toBe('0px');

    // The two are told apart by colour, which is the whole convention.
    await expect(cancel.background).not.toBe(submit.background);
  },
};
