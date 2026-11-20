import { useState } from 'react';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';

import StageEditorShell from '../form/StageEditorShell.tsx';
import { ProtocolBuilder } from '../ProtocolBuilder.tsx';
import { ResourceClientProvider } from '../resources/client.tsx';
import {
  createStoryHost,
  PROTOCOL_RESOURCES,
  type StoryResource,
} from '../resources/components/storyFixtures.ts';
import PageContentSection from '../sections/page-content/PageContentSection.tsx';
import { StageEditSession } from '../stageEdit.tsx';

/**
 * A page being written in a stage editor, its text `content`: the real
 * editor, over a host holding `resources` as real files, with the resource
 * browser the text's blocks open. For the stories of the blocks a page's
 * text holds.
 */
export function PageContentStoryHost({
  content,
  resources = PROTOCOL_RESOURCES,
}: Readonly<{ content: string; resources?: readonly StoryResource[] }>) {
  const [host] = useState(() =>
    createStoryHost({
      resources,
      stage: {
        stageId: 'welcome-screen',
        type: 'Information',
        fields: {
          label: { 'en-US': 'Welcome' },
          content: { 'en-US': content },
        },
      },
    }),
  );
  return (
    <DialogProvider>
      <ProtocolBuilder adapter={host.adapter} protocolId={host.protocolId}>
        <ResourceClientProvider>
          <StageEditSession target={{ sectionId: host.sectionId }}>
            <main className="mx-auto max-w-4xl p-6">
              <StageEditorShell>
                <PageContentSection />
              </StageEditorShell>
            </main>
          </StageEditSession>
        </ResourceClientProvider>
      </ProtocolBuilder>
    </DialogProvider>
  );
}
