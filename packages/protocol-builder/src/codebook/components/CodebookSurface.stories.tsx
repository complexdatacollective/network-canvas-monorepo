import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import type {
  CodebookSubject,
  ProtocolBuilderProtocolContext,
} from '../../protocol-context.ts';
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

export const Configured: Story = {};
