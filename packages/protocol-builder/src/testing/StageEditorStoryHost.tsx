import { type ReactNode, useState } from 'react';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import {
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import { ProtocolBuilder } from '../ProtocolBuilder.tsx';
import type { StageEditorActions } from '../stage-editor-contract.ts';
import type { StageEditTarget } from '../stageEdit.tsx';
import { createInMemoryHost } from './host/createInMemoryHost.ts';
import {
  fixtureAssetContent,
  fixtureAssetManifest,
  fixtureProtocolSections,
} from './protocolFixture.ts';

/** DOM id of the stage form, so a play function can address it. */
const STAGE_FORM_ID = 'stage-form';

const COLLABORATOR = {
  sessionId: 'collaborator-tab',
  userId: 'collaborator',
  displayName: 'Robin',
};

export type StageEditorStoryHostProps = Readonly<{
  /** The stage of the shared all-interfaces protocol this story opens. */
  stageId: string;
  /**
   * The editor under test, given the host's own chrome.
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
      target: StageEditTarget;
      formId: string;
      onSaved: (sectionId: ProtocolSectionId) => void;
      actions: StageEditorActions;
    }>,
  ) => ReactNode;
  /** Open the stage as a spectator, with the lock held elsewhere. */
  readOnly?: boolean;
  /**
   * Extra manifest entries this stage may reference, keyed by asset id, so a
   * stage pointing at one is a stage a host would accept.
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
 * It serves the shared all-interfaces protocol over the package's own contract
 * — the same host `renderStageEditor` mounts — renders the editor, and reports
 * what a save committed. That last part is the only thing a story needs that a
 * host does not give it: an editor that saved and one that quietly did nothing
 * look identical on screen, and a play function has to be able to tell them
 * apart.
 *
 * The report is two things, because two different questions are asked of it. A
 * live region names the stage that was saved, which is what a play watches
 * for; the committed document is printed verbatim beneath it, which is where a
 * play checks that the value it just set is what the protocol now holds.
 */
export function StageEditorStoryHost({
  stageId,
  renderEditor,
  readOnly = false,
  assets,
  createResourceId,
}: StageEditorStoryHostProps) {
  const [saved, setSaved] = useState<SectionDoc | null>(null);
  const [host] = useState(() => {
    const manifest = { ...fixtureAssetManifest(), ...assets };
    const built = createInMemoryHost({
      sections: {
        ...fixtureProtocolSections(),
        [sectionId({ kind: 'assets' })]: manifest,
      },
      assetContent: assetContentFor(manifest),
      ...(createResourceId === undefined ? {} : { nextId: createResourceId }),
    });
    if (readOnly) {
      built.store.acquire(sectionId({ kind: 'stage', stageId }), COLLABORATOR);
    }
    return built;
  });

  const stage = sectionId({ kind: 'stage', stageId });

  return (
    <DialogProvider>
      <ProtocolBuilder client={host.client} protocolId={host.protocolId}>
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
            // headings are the editor's own sections keeps its outline — and
            // the region is the box itself rather than a `<section>` around
            // it, because the box is what scrolls. A stage holding a long line
            // makes it scroll sideways, and its end is then reachable only by
            // scrolling: a reader who cannot use a pointer needs to put focus
            // here and use the arrow keys.
            <pre
              tabIndex={0}
              role="region"
              aria-label="What the host was asked to commit"
              className="focusable overflow-x-auto text-xs"
            >
              {JSON.stringify(saved, null, 2)}
            </pre>
          )}
          {renderEditor({
            target: { sectionId: stage },
            formId: STAGE_FORM_ID,
            onSaved: (id) => setSaved(host.store.read(id).document),
            actions: hostChrome,
          })}
        </main>
      </ProtocolBuilder>
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

/**
 * The bytes behind the manifest's entries, as `renderStageEditor` seeds them.
 *
 * A stage editor asks the host what is INSIDE a data file — a roster's columns
 * are what its card, sort and search sections offer; a map layer's feature
 * properties are what a geospatial stage records a selection as — so a host
 * with no bytes answers "this file cannot be read", and every one of those
 * controls renders its failure state instead of itself. The tests' harness has
 * seeded them from the start; a story that mounts the same editor over the
 * same protocol has to serve the same files, or the two disagree about the
 * fixture.
 *
 * An asset the fixture ships a file for is seeded with that file; everything
 * else gets a placeholder body, because the editors that reference those read
 * only a resource's kind, name and size.
 */
function assetContentFor(
  manifest: Readonly<Record<string, unknown>>,
): Record<string, Blob> {
  const content: Record<string, Blob> = {};
  for (const entry of Object.values(manifest)) {
    if (typeof entry !== 'object' || entry === null) continue;
    const source = Reflect.get(entry, 'source');
    if (typeof source !== 'string') continue;
    const bytes = fixtureAssetContent(source);
    content[source] = new Blob(
      [(bytes ?? new TextEncoder().encode('{}')) as BlobPart],
      { type: 'application/json' },
    );
  }
  return content;
}

const stageLabel = (document: SectionDoc): string => {
  const label = document.label;
  return typeof label === 'string' && label !== '' ? label : 'Untitled stage';
};
