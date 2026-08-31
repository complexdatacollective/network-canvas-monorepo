import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { useStageEditorController } from '../controller.ts';
import { interfaceDocumentationUrl } from '../interfaces/documentation.ts';
import BuilderSection from '../sections/BuilderSection.tsx';
import InterviewerGuidanceSection from '../sections/InterviewerGuidanceSection.tsx';
import StageNameSection from '../sections/StageNameSection.tsx';
import {
  createStageIdentity,
  type ProtocolBuilderAccess,
  ProtocolBuilderSessionStore,
} from '../session.ts';
import ProtocolField from './ProtocolField.tsx';
import StageEditorShell from './StageEditorShell.tsx';

const EDITABLE: ProtocolBuilderAccess = {
  mode: 'editable',
  leaseOwner: 'storybook',
  leaseEpoch: 1n,
};

const SPECTATOR: ProtocolBuilderAccess = {
  mode: 'readOnly',
  reason: 'spectator',
};

const CONFIGURED: SectionDoc = {
  label: 'Welcome',
  title: 'Welcome to the study',
  items: [],
  interviewScript: 'Read the welcome text aloud before continuing.',
};

/**
 * A host with no Redux, no router and no store of its own: it opens a session,
 * renders the editor, and puts its own button in the action slot.
 */
function StageEditorHost({
  access,
  fields,
}: {
  access: ProtocolBuilderAccess;
  fields: SectionDoc;
}) {
  const [session] = useState(
    () =>
      new ProtocolBuilderSessionStore({
        identity: createStageIdentity('Information', () => 'welcome-screen'),
        fields,
        protocolSections: {},
        manifestRevision: { sequence: 0n, hash: 'storybook' },
        access,
        buildCandidate: ({ stageDocument }) => ({
          name: 'Protocol builder proof host',
          schemaVersion: 8,
          codebook: {},
          stages: [stageDocument],
        }),
      }),
  );
  const controller = useStageEditorController(session);

  return (
    <DialogProvider>
      <main className="mx-auto max-w-6xl p-6">
        <StageEditorShell
          controller={controller}
          actions={({ formId, readOnly }) => (
            <div className="flex justify-end">
              <SubmitButton form={formId} disabled={readOnly}>
                Finished editing
              </SubmitButton>
            </div>
          )}
        >
          <StageNameSection
            position={{ index: 1, total: 4 }}
            documentationUrl={interfaceDocumentationUrl('information')}
          />
          <BuilderSection
            title="Page content"
            description="What this screen shows the participant."
          >
            <ProtocolField
              name="title"
              label="Page heading"
              component={InputField}
              required
            />
          </BuilderSection>
          <InterviewerGuidanceSection />
        </StageEditorShell>
      </main>
    </DialogProvider>
  );
}

const meta = {
  title: 'Protocol Builder/Stage editor shell',
  component: StageEditorHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The one form every stage editor is built inside. It owns the form store, the section outline, and the submit that flushes the form into the session; the host supplies only the action chrome and reads the form id from the slot. The outline lists the sections actually mounted, states each one as finished, unfinished, having a problem or switched off, and moves focus to a section when it is chosen.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageEditorHost>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Editing: Story = {
  args: {
    access: EDITABLE,
    fields: { label: 'Welcome', title: '', items: [] },
  },
};

/** A stage that already has its optional interviewer guidance switched on. */
export const AlreadyConfigured: Story = {
  args: { access: EDITABLE, fields: CONFIGURED },
};

/** Someone else holds the lease: every control is inert and saving is refused. */
export const Spectating: Story = {
  args: { access: SPECTATOR, fields: CONFIGURED },
};
