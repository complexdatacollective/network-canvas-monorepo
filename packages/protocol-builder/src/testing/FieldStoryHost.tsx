import { type ReactNode, useState } from 'react';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import StageEditorShell from '../form/StageEditorShell.tsx';
import { ProtocolBuilder } from '../ProtocolBuilder.tsx';
import { ResourceClientProvider } from '../resources/client.tsx';
import BuilderSection from '../sections/BuilderSection.tsx';
import type { StageEditorActions } from '../stage-editor-contract.ts';
import { isStageType } from '../stage-types.ts';
import type { StageFormDraft } from '../stageDocument.ts';
import { StageEditSession, type StageEditTarget } from '../stageEdit.tsx';
import {
  createInMemoryHost,
  type InMemoryHost,
} from './host/createInMemoryHost.ts';
import { fixtureProtocolSections } from './protocolFixture.ts';

/** DOM id of the stage form, so a play function can address its save. */
const STAGE_FORM_ID = 'stage-form';

/**
 * The host's own save control.
 *
 * Rendered through the shell's action slot rather than beside it, because the
 * form store is the shell's: a submit button outside it has no form to submit.
 * Disabled for a spectator rather than hidden — a control that disappears
 * cannot show that editing is held elsewhere.
 */
const hostChrome: StageEditorActions = ({ formId, readOnly }) => (
  <div className="flex justify-end">
    <SubmitButton form={formId} disabled={readOnly}>
      Save stage
    </SubmitButton>
  </div>
);

/** Every fixture stage carries its own interface; nothing here works without it. */
const stageTypeOf = (fields: StageFormDraft) => {
  const { type } = fields;
  if (typeof type !== 'string' || !isStageType(type)) {
    throw new Error('The fixture stage does not name an interface.');
  }
  return type;
};

const COLLABORATOR = {
  sessionId: 'collaborator-tab',
  userId: 'collaborator',
  displayName: 'Robin',
};

export type FieldStoryHostProps = Readonly<{
  /** The stage of the shared all-interfaces protocol the field is a part of. */
  stageId: string;
  /** What the section around the field is called. */
  sectionTitle: string;
  /** The field, or fields, under the researcher's cursor. */
  children: ReactNode;
  /** Somebody else holds the stage, so this editor opens read-only. */
  readOnly?: boolean;
  /**
   * Opens a stage being CREATED of the same interface, rather than the one the
   * fixture holds.
   *
   * What a field does while the stage does not exist yet is sometimes a
   * different thing — a name is proposed for a new stage and never for an
   * existing one — and only the open edit says which this is. The fixture
   * stage's own configuration comes with it, minus its identity and its name,
   * so the new stage collects what the fixture's does and arrives unnamed.
   */
  creating?: boolean;
  /**
   * A change to the protocol, applied to the host before anything is rendered.
   *
   * How a story shows a state the shared fixture does not hold — a type
   * somebody deleted, an attribute somebody added — without a second fixture.
   * A revision arriving WHILE an editor is open is a matter of timing, which a
   * story cannot hold still; the tests beside these stories drive that.
   */
  seedEdit?: (host: InMemoryHost) => void;
}>;

/**
 * One field of one stage of the shared protocol, over the package's own
 * contract served from memory.
 *
 * The lighter sibling of `StageEditorStoryHost`: that one mounts a whole named
 * editor to show what an editor is, and this one mounts a single control to
 * show what the control does. Everything the field knows still arrives the way
 * it does in an application — the stage over the lock, the rest of the protocol
 * over the subscription — so a story cannot show a state a host could not
 * produce.
 *
 * The host is built once, so a control changed after the story has rendered
 * does not rebuild the protocol underneath it.
 */
export function FieldStoryHost({
  stageId,
  sectionTitle,
  children,
  readOnly = false,
  creating = false,
  seedEdit,
}: FieldStoryHostProps) {
  const [saved, setSaved] = useState<SectionDoc | null>(null);
  const stage = sectionId({ kind: 'stage', stageId });
  const [host] = useState(() => {
    const built = createInMemoryHost({ sections: fixtureProtocolSections() });
    seedEdit?.(built);
    if (readOnly) built.store.acquire(stage, COLLABORATOR);
    return built;
  });
  const [target] = useState<StageEditTarget>(() => {
    if (!creating) return { sectionId: stage };
    // Its identity and its name are the two things a stage being created does
    // not have yet: the host mints the first, and the second is what the
    // editor is about to propose.
    const {
      id: _id,
      label: _label,
      ...fields
    } = host.store.read(stage).document as StageFormDraft;
    return {
      stageType: stageTypeOf(fields),
      position: 0,
      fields,
    };
  });

  return (
    <DialogProvider>
      <ProtocolBuilder client={host.client} protocolId={host.protocolId}>
        <ResourceClientProvider>
          <StageEditSession
            target={target}
            formId={STAGE_FORM_ID}
            onSaved={(id) => setSaved(host.store.read(id).document)}
          >
            <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
              <StageEditorShell actions={hostChrome}>
                <BuilderSection title={sectionTitle}>{children}</BuilderSection>
              </StageEditorShell>
              {/*
                Named, because the editor above mounts live regions of its own:
                a story asking for "the status" would get whichever one the
                tree rendered first. An editor that saved and one that quietly
                did nothing look identical on screen, and a play function has
                to be able to tell them apart.
              */}
              <p role="status" aria-label="Save status">
                {saved === null
                  ? 'Nothing saved yet.'
                  : `Saved: ${JSON.stringify(saved)}`}
              </p>
            </main>
          </StageEditSession>
        </ResourceClientProvider>
      </ProtocolBuilder>
    </DialogProvider>
  );
}
