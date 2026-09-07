import { type ReactNode, useState } from 'react';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { applyCommands, type SectionDoc } from '@codaco/studio-sync/apply';
import {
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import {
  type StageEditorController,
  useStageEditorController,
} from '../controller.ts';
import {
  stageDraftFromDocument,
  type FinishRequest,
  type ProtocolBuilderPresence,
} from '../session.ts';
import type { StageEditorActions } from '../stage-editor-contract.ts';
import {
  openFixtureStageSession,
  type FixtureSession,
} from './fixtureSession.ts';
import { loadFixtureStage } from './protocolFixture.ts';
import StudioHostSurface from './StudioHostSurface.tsx';

/** DOM id of the stage form, so a play function can address it. */
const STAGE_FORM_ID = 'stage-form';

export type StageEditorStoryHostProps = Readonly<{
  /** The stage of the shared all-interfaces protocol this story opens. */
  stageId: string;
  /**
   * The editor under test, given the controller and the host's own chrome.
   *
   * A render prop rather than a component prop because each named editor
   * declares the one interface it edits, and a host that took them all as one
   * type would have to widen `stageType` back to the whole union. It is also
   * what lets a family show the package's own dispatcher instead — render
   * `StageEditor` with the family's registry part, and the story proves the
   * family claims the interface its stage is of.
   */
  renderEditor: (
    props: Readonly<{
      controller: StageEditorController;
      actions: StageEditorActions;
    }>,
  ) => ReactNode;
  /** Open the stage as a spectator, with editing held elsewhere. */
  readOnly?: boolean;
  /**
   * Extra manifest entries this stage may reference, keyed by asset id. They
   * join the fixture's own assets in both the protocol's manifest and the
   * gateway, so a stage pointing at one is a stage a host would accept.
   */
  assets?: Readonly<Record<string, SectionDoc>>;
  /**
   * Names staged resources in sequence rather than randomly. A story that
   * imports a file renders the id it was given, and a fresh uuid on every run
   * would make the page differ from itself in every visual comparison.
   */
  createResourceId?: () => string;
  /**
   * Who else is in this protocol, and what they are doing.
   *
   * Presence reaches an editor over the host's own channel, so a story that is
   * about working alongside somebody has to say who that is.
   */
  presence?: readonly ProtocolBuilderPresence[];
  /**
   * Sections a colleague is holding, named by who is holding them, so a
   * compound edit that needs one is blocked rather than applied.
   */
  heldSections?: readonly Readonly<{
    sectionId: ProtocolSectionId;
    displayName: string;
  }>[];
  /**
   * Runs the host the way Studio runs it, and shows what it knows.
   *
   * Two things at once, because they are one thing. The host commits every
   * batch as the editor makes it and answers with the revision that committed
   * it — `receiveAuthoritativeUpdate` then `acknowledge`, which is the whole
   * of `useStudioStageSession`'s `onCommands` — and `StudioHostSurface` above
   * the editor renders what the session tells the host: who else is here,
   * whether the lock is still held, whether the protocol is valid and who
   * broke it, what has been sent, and what is imported but unsaved. The
   * controls beside those readouts are the rest of Studio: a colleague
   * changing the codebook, the lock being lost, the editor being closed
   * without saving.
   *
   * Off, this is the plain mount every editor family's stories use: the host
   * is handed nothing until the save, and none of the above is on screen.
   */
  collaborative?: boolean;
}>;

/**
 * The one host every stage editor's stories run in: no Redux, no router, no
 * store of its own.
 *
 * It opens a real editing session over the shared all-interfaces protocol —
 * the same one `renderStageEditor` opens, from the same builder — renders the
 * editor, and reports what a save committed. That last part is the only thing
 * a story needs that a host does not give it: an editor that saved and one
 * that quietly did nothing look identical on screen, and a play function has
 * to be able to tell them apart.
 *
 * The report is two things, because two different questions are asked of it. A
 * live region names the stage that was saved, which is what a play watches
 * for; the committed document is printed verbatim beneath it, which is where a
 * play checks that the value it just set is what the host was asked to store.
 *
 * Opened with `collaborative`, it is also the proof that this package can be
 * hosted by Studio: every contract it uses is one Studio uses
 * (`apps/studio/client/src/editor/useStudioStageSession.ts`), there is no
 * Architect alias and no store anywhere in it, and the host's whole job is the
 * six things listed on {@link HOST_RESPONSIBILITIES}.
 */
export function StageEditorStoryHost({
  stageId,
  renderEditor,
  readOnly = false,
  assets,
  createResourceId,
  presence,
  heldSections,
  collaborative = false,
}: StageEditorStoryHostProps) {
  const [saved, setSaved] = useState<FinishRequest | null>(null);
  /**
   * How many batches the host has been handed.
   *
   * The one question the session cannot be asked. `pendingCommands` empties as
   * each batch is acknowledged, so a host that had been given six batches and
   * one that had been given none look the same through it — and "the editor
   * sent nothing back when a colleague's change arrived" is exactly the claim
   * that needs telling apart from "the editor sent something and it has since
   * been acknowledged".
   */
  const [sent, setSent] = useState(0);
  const [fixture] = useState<FixtureSession>(() => {
    const stageSection = sectionId({ kind: 'stage', stageId });
    let opened: FixtureSession | undefined;

    /**
     * What a host does with a batch, and the whole of it.
     *
     * The batch reaches the host before this runs — `openFixtureStageSession`
     * applies it, because a host that is handed a batch owns it — so all that
     * is left is to say what revision committed it. Both halves are owed: the
     * update moves the protocol the editor validates against, and the
     * acknowledgement moves the base its unsaved work is measured from. A host
     * that sent only the first would leave every batch pending for ever.
     *
     * Answered here and now, where Studio answers a round trip later. The
     * session takes an acknowledgement whenever it arrives; answering
     * immediately is what makes a story settle without a story having to wait
     * on a clock.
     */
    const commit = (batchId: number) => {
      const session = opened?.session;
      const host = opened?.host;
      if (session === undefined || host === undefined) return;
      const applied = host.getSnapshot();
      const document = applied.protocolSections[stageSection];
      // A stage being CREATED has no section on the host yet, so there is
      // nothing to acknowledge against; its batches travel with the finish.
      if (document === undefined) return;
      setSent((count) => count + 1);
      session.receiveAuthoritativeUpdate({
        protocolSections: applied.protocolSections,
        manifestRevision: applied.manifestRevision,
      });
      session.acknowledge({
        fields: stageDraftFromDocument(document).fields,
        throughBatchId: batchId,
        manifestRevision: applied.manifestRevision,
      });
    };

    /**
     * The finish, applied as ONE revision.
     *
     * The stage and the manifest entries for the files it now references have
     * to land together: the bytes are already moved, and a host that commits
     * the stage without the manifest commits references to resources the
     * protocol does not have. One `receiveAuthoritativeSections` call is one
     * revision, which is the guarantee `FinishRequest.resourceManifest` asks
     * a host for.
     */
    const commitFinish = (request: FinishRequest) => {
      setSaved(request);
      const host = opened?.host;
      const session = opened?.session;
      if (!collaborative || host === undefined || session === undefined) return;
      const sections: Record<string, SectionDoc | null> = {
        [stageSection]: request.stageDocument,
      };
      const manifest = request.resourceManifest;
      if (manifest !== undefined) {
        const current =
          host.getSnapshot().protocolSections[manifest.sectionId] ?? {};
        sections[manifest.sectionId] = applyCommands(current, [
          ...manifest.commands,
        ]);
      }
      const applied = host.receiveAuthoritativeSections(sections);
      session.receiveAuthoritativeUpdate({
        protocolSections: applied.protocolSections,
        manifestRevision: applied.manifestRevision,
      });
    };

    opened = openFixtureStageSession({
      seeded: loadFixtureStage(stageId),
      readOnly,
      ...(assets === undefined ? {} : { assets }),
      ...(createResourceId === undefined ? {} : { createResourceId }),
      ...(presence === undefined ? {} : { presence }),
      ...(heldSections === undefined ? {} : { heldSections }),
      ...(collaborative ? { onCommands: (batch) => commit(batch.id) } : {}),
      onFinish: commitFinish,
    });
    return opened;
  });
  const controller = useStageEditorController(fixture.session, STAGE_FORM_ID);

  return (
    <DialogProvider>
      <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
        {/*
          Named, because the editor below mounts live regions of its own: a
          story asking for "the status" would otherwise get whichever one the
          tree happened to render first.
        */}
        <Paragraph role="status" aria-label="Save status" margin="none">
          {saved === null
            ? 'Nothing saved yet.'
            : `Saved “${stageLabel(saved)}”.`}
        </Paragraph>
        {saved !== null && (
          // A named region rather than a heading, so a document whose real
          // headings are the editor's own sections keeps its outline — and the
          // region is the box itself rather than a `<section>` around it,
          // because the box is what scrolls. A stage holding a long line makes
          // it scroll sideways, and the end of that line is then reachable
          // only by scrolling: a reader who cannot use a pointer needs to be
          // able to put focus here and use the arrow keys. The name belongs on
          // whatever takes that focus, and one element carrying both is one
          // stop in the tab order rather than two.
          <pre
            tabIndex={0}
            role="region"
            aria-label="What the host was asked to commit"
            className="focusable overflow-x-auto text-xs"
          >
            {JSON.stringify(saved.stageDocument, null, 2)}
          </pre>
        )}
        {collaborative && (
          <StudioHostSurface
            controller={controller}
            session={fixture.session}
            host={fixture.host}
            sent={sent}
          />
        )}
        {renderEditor({ controller, actions: hostChrome })}
      </main>
    </DialogProvider>
  );
}

/**
 * The host's own action chrome.
 *
 * Disabled for a spectator rather than hidden: a control that disappears
 * cannot show that editing is held elsewhere, and the researcher is left
 * wondering where the save button went.
 */
const hostChrome: StageEditorActions = ({ formId, readOnly }) => (
  <div className="flex justify-end">
    <SubmitButton form={formId} disabled={readOnly}>
      Save stage
    </SubmitButton>
  </div>
);

const stageLabel = (request: FinishRequest): string => {
  const label = request.stageDocument.label;
  return typeof label === 'string' && label !== '' ? label : 'Untitled stage';
};
