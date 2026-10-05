import { useState, type ReactNode } from 'react';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import StageEditorShell, {
  type StageEditorActions,
} from '../../form/StageEditorShell.tsx';
import { ProtocolBuilder } from '../../ProtocolBuilder.tsx';
import { ResourceClientProvider } from '../../resources/client.tsx';
import { StageEditSession } from '../../stageEdit.tsx';
import { createInMemoryHost } from '../../testing/host/createInMemoryHost.ts';
import type { InMemoryProtocolStore } from '../../testing/host/protocolStore.ts';
import {
  HARNESS_PRINCIPAL,
  SeedProtocolCache,
} from '../../testing/seedProtocolCache.tsx';

/** The stage every rule test edits. */
export const STAGE_SECTION = sectionId({ kind: 'stage', stageId: 'stage-1' });

/** The other tab, so a stage can be opened with somebody else holding it. */
const COLLABORATOR = {
  sessionId: 'collaborator-tab',
  userId: 'collaborator',
  displayName: 'Robin',
};

export type RuleEditorHostProps = Readonly<{
  /** The protocol this editor is opened over, served from memory. */
  sections: Readonly<Record<string, SectionDoc>>;
  /** Open the stage as a spectator, with the lock already held elsewhere. */
  readOnly?: boolean;
  actions?: StageEditorActions;
  /** Receives the protocol store, so a test can write as a collaborator. */
  onStore?: (store: InMemoryProtocolStore) => void;
  children: ReactNode;
}>;

/**
 * A rule control inside a real stage editor, over the package's own host
 * contract served from memory.
 *
 * The protocol is seeded into the cache before the children render, so the
 * whole surface is on screen synchronously and an assertion is about the
 * control rather than about waiting for a host to answer.
 */
export function RuleEditorHost({
  sections,
  readOnly = false,
  actions,
  onStore,
  children,
}: RuleEditorHostProps) {
  const [host] = useState(() => {
    const built = createInMemoryHost({
      sections,
      principal: HARNESS_PRINCIPAL,
    });
    if (readOnly) built.store.acquire(STAGE_SECTION, COLLABORATOR);
    onStore?.(built.store);
    return built;
  });

  return (
    <DialogProvider>
      <ProtocolBuilder client={host.client} protocolId={host.protocolId}>
        <SeedProtocolCache store={host.store}>
          <ResourceClientProvider>
            <StageEditSession
              target={{ sectionId: STAGE_SECTION }}
              formId="stage-form"
            >
              <StageEditorShell {...(actions === undefined ? {} : { actions })}>
                {children}
              </StageEditorShell>
            </StageEditSession>
          </ResourceClientProvider>
        </SeedProtocolCache>
      </ProtocolBuilder>
    </DialogProvider>
  );
}
