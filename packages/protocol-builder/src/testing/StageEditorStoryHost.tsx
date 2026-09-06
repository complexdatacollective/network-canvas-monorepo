import { type ReactNode, useState } from 'react';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import {
  type StageEditorController,
  useStageEditorController,
} from '../controller.ts';
import type { FinishRequest } from '../session.ts';
import type { StageEditorActions } from '../stage-editor-contract.ts';
import { openFixtureStageSession } from './fixtureSession.ts';
import { loadFixtureStage } from './protocolFixture.ts';

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
 */
export function StageEditorStoryHost({
  stageId,
  renderEditor,
  readOnly = false,
  assets,
  createResourceId,
}: StageEditorStoryHostProps) {
  const [saved, setSaved] = useState<FinishRequest | null>(null);
  const [{ session }] = useState(() =>
    openFixtureStageSession({
      seeded: loadFixtureStage(stageId),
      readOnly,
      ...(assets === undefined ? {} : { assets }),
      ...(createResourceId === undefined ? {} : { createResourceId }),
      onFinish: setSaved,
    }),
  );
  const controller = useStageEditorController(session, STAGE_FORM_ID);

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
