import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, within } from 'storybook/test';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import type {
  CodebookSubject,
  ProtocolBuilderProtocolContext,
} from '../../protocol-context.ts';
import { buttonPaint, TRANSPARENT } from '../../testing/buttonPaint.ts';
import CodebookSurface from './CodebookSurface.tsx';

const CONTEXT: ProtocolBuilderProtocolContext = {
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        icon: 'add-a-person',
        shape: { default: 'circle' },
        variables: {
          name: { name: 'Name', type: 'text', component: 'Text' },
          age: { name: 'Age', type: 'number', component: 'Number' },
        },
      },
      place: {
        name: 'Place',
        color: 'node-color-seq-2',
        icon: 'add-a-place',
        shape: { default: 'square' },
      },
    },
    edge: {
      knows: {
        name: 'Knows',
        color: 'edge-color-seq-1',
        variables: {
          closeness: { name: 'Closeness', type: 'number' },
        },
      },
    },
    ego: {
      variables: {
        consent: { name: 'Consent', type: 'boolean' },
      },
    },
  },
  assets: {},
  orderedStages: [],
  issues: [
    {
      sectionId: 'codebook:node:removed-remotely',
      path: [],
      message: 'This entity section is no longer available.',
    },
  ],
};

const subjectName = (subject: CodebookSubject): string =>
  subject.entity === 'ego' ? 'ego' : `${subject.entity} type ${subject.type}`;

function InteractiveCodebookSurface() {
  const [lastAction, setLastAction] = useState('No action selected.');
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <Paragraph intent="smallText" emphasis="muted" aria-live="polite">
        {lastAction}
      </Paragraph>
      <CodebookSurface
        context={CONTEXT}
        onCreateEntity={(entity) => setLastAction(`Create ${entity} entity.`)}
        onEditEntity={(subject) =>
          setLastAction(`Edit ${subjectName(subject)}.`)
        }
        onCreateVariable={(subject) =>
          setLastAction(`Create an attribute for ${subjectName(subject)}.`)
        }
        onEditVariable={(subject, variableId) =>
          setLastAction(
            `Edit attribute ${variableId} for ${subjectName(subject)}.`,
          )
        }
      />
    </main>
  );
}

const meta = {
  title: 'Protocol Builder/Codebook/Codebook surface',
  component: InteractiveCodebookSurface,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta<typeof InteractiveCodebookSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Configured: Story = {
  /**
   * Architect creates with a filled `color="primary"` button carrying a plus,
   * in the codebook at `size="sm"`, and has no hollow or dashed button
   * anywhere. The package reached for `outline` on the edge and ego triggers
   * and `dashed` on the add-attribute trigger, so one codebook card offered
   * three different-looking ways to create something.
   */
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const triggers = [
      canvas.getByRole('button', { name: 'Create node type' }),
      canvas.getByRole('button', { name: 'Create edge type' }),
      canvas.getByRole('button', {
        name: 'Create attribute for Node type: Person',
      }),
    ];

    for (const trigger of triggers) {
      const paint = buttonPaint(trigger);
      const named =
        trigger.getAttribute('aria-label') ?? trigger.textContent ?? '';

      // The primary token, resolved — not the word "primary" in a class.
      await expect(paint.token('primary'), named).not.toBe('');
      await expect(paint.colour, named).toBe(paint.token('primary'));
      // Filled: the ground is painted, and there is no border to be hollow or
      // dashed with.
      await expect(paint.background, named).not.toBe(TRANSPARENT);
      await expect(paint.borderStyle, named).not.toBe('dashed');
      await expect(paint.borderWidth, named).toBe('0px');
      // Architect names the act with a plus on every one of them.
      await expect(trigger.querySelector('svg'), named).not.toBeNull();
    }
  },
};
