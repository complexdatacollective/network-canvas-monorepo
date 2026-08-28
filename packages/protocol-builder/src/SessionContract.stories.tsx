import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { useStageEditorController } from './controller.ts';
import { createStageIdentity, ProtocolBuilderSessionStore } from './session.ts';

function ReduxFreeSessionHost() {
  const [session] = useState(
    () =>
      new ProtocolBuilderSessionStore({
        identity: createStageIdentity('Information', () => 'welcome-screen'),
        fields: { label: 'Welcome', title: 'Welcome', items: [] },
        protocolSections: {},
        manifestRevision: { sequence: BigInt(0), hash: 'storybook' },
        access: {
          mode: 'editable',
          leaseOwner: 'storybook-host',
          leaseEpoch: BigInt(1),
        },
        buildCandidate: ({ stageDocument }) => ({
          name: 'Redux-free host proof',
          schemaVersion: 8,
          codebook: {},
          stages: [stageDocument],
        }),
      }),
  );
  const controller = useStageEditorController(session);
  const labelValue = controller.snapshot.editedSection.fields.label;
  const label = typeof labelValue === 'string' ? labelValue : '';

  return (
    <main className="mx-auto max-w-xl p-6">
      <Surface spacing="lg">
        <Heading level="h1">Session contract proof</Heading>
        <Paragraph>
          A Redux-free host is editing the stable screen{' '}
          <strong>{controller.snapshot.editedSection.identity.id}</strong>.
        </Paragraph>
        <Paragraph role="status">Current screen name: {label}</Paragraph>
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => controller.setField('label', 'Renamed screen')}
          >
            Rename screen
          </Button>
          <Button
            variant="outline"
            disabled={!controller.snapshot.history.canUndo}
            onClick={controller.undo}
          >
            Undo
          </Button>
        </div>
      </Surface>
    </main>
  );
}

const meta = {
  title: 'Protocol Builder/Session contract',
  component: ReduxFreeSessionHost,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ReduxFreeSessionHost>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReduxFreeHost: Story = {};
