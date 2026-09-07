import { useId } from 'react';

import { formatMessageError } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { EnclosingHeadingLevel } from '@codaco/fresco-ui/typography/EnclosingHeadingLevel';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import type { InMemoryCompoundHost } from '../compound-edit/InMemoryCompoundHost.ts';
import type { StageEditorController } from '../controller.ts';
import type {
  ProtocolBuilderPresence,
  ProtocolBuilderSessionStore,
} from '../session.ts';
import { FIXTURE_SESSION_OWNER } from './fixtureSession.ts';

/**
 * Everything a host has to do for this package, and nothing else.
 *
 * Written down here because it is the deliverable: a future Studio integration
 * needs to know what it is signing up for, and the list a reader can check
 * against is the one the proof host is actually built from — every line below
 * is a call this file or `StageEditorStoryHost` makes, and every one of them
 * is a call `apps/studio/client/src/editor/useStudioStageSession.ts` already
 * makes for real.
 *
 * What is NOT on the list is as much the point. There is no store, no router,
 * no protocol document, no codebook model, no undo stack and no validation of
 * the host's own: the session owns all of it, and a host that tried to keep a
 * second copy would be the thing that drifts.
 */
export const HOST_RESPONSIBILITIES: readonly string[] = Object.freeze([
  'Open the session on the stage the researcher chose, with the protocol’s sections, the revision they were read at, and the access the section lock granted.',
  'Commit each batch of commands in the order it is made, then answer with receiveAuthoritativeUpdate and acknowledge under the revision that committed it.',
  'Pass on what changes elsewhere: receiveAuthoritativeUpdate for a newer revision, and replaceAuthoritativeStage when the stage itself moved while this session was only reading.',
  'Own the section lock: setAccess to read-only the moment it is lost, and back to editable when it is regained under its new epoch.',
  'Carry a compound edit to the protocol as one atomic change, and answer with what it applied, blocked or refused.',
  'Provide the resource gateway, and apply a finish’s stage document and its resource manifest in the same revision.',
]);

/** The colleague every story here shares the protocol with. */
export const COLLEAGUE: ProtocolBuilderPresence = Object.freeze({
  sessionId: 'priya-tab',
  userId: 'priya',
  displayName: 'Priya Raman',
  sectionId: sectionId({ kind: 'codebookNode', typeId: 'person' }),
  mode: 'editing',
});

/** The node type a colleague reaches for in these stories. */
const PERSON_SECTION = sectionId({ kind: 'codebookNode', typeId: 'person' });
const ASSETS_SECTION = sectionId({ kind: 'assets' });

/** The attribute a colleague adds, under a fixed id so a repeat is a repeat. */
const COLLEAGUE_ATTRIBUTE_ID = 'nickname-from-priya';

/** How many problems are listed before the rest are counted instead. */
const LISTED_ISSUES = 6;

export type StudioHostSurfaceProps = Readonly<{
  controller: StageEditorController;
  session: ProtocolBuilderSessionStore;
  host: InMemoryCompoundHost;
  /** How many batches the host has been handed. */
  sent: number;
}>;

/**
 * What the host knows, and the rest of Studio as a row of buttons.
 *
 * Two halves, and they are the two halves of the proof. Above, everything on
 * screen is read from the session snapshot and nowhere else — a host has no
 * other source, and a readout that came from somewhere else would be proving
 * the wrong thing. Below, the controls are the events a host relays: a
 * colleague changing the codebook, a section lock lost or regained, an editor
 * closed without saving. A story drives them so that a reader — and a play
 * function — can see exactly what the editor does about each one.
 */
export default function StudioHostSurface({
  controller,
  session,
  host,
  sent,
}: StudioHostSurfaceProps) {
  const intl = useAppIntl();
  const titleId = useId();
  const { snapshot } = controller;
  const { access, presence, validation, history, stagedResources } = snapshot;
  // Read from the session rather than taken as a prop: which stage this is
  // is session-owned identity, and a panel that could be told a different one
  // would be reporting on a stage nobody is editing.
  const stageSection = snapshot.editedSection.sectionId;

  /**
   * A change made outside every session on this host, and the revision it was
   * made under.
   *
   * The host is told FIRST and issues the revision, and the session is then
   * told about it under that same revision — one change to one protocol, seen
   * from both ends. Anything else leaves the two disagreeing about what the
   * protocol holds, and the next compound edit is refused as stale for a
   * reason nothing on screen could explain.
   *
   * The attribution is the other half: it says which section the change
   * touched and who made it, keyed by section and pinned to that revision,
   * which is what lets a validation problem caused by the change be reported
   * with the name of the person who caused it rather than as the researcher's
   * own mistake.
   */
  const changeElsewhere = (
    section: string,
    document: SectionDoc | null,
  ): void => {
    const applied = host.receiveAuthoritativeSections({ [section]: document });
    // The stage the session holds is its own — this host applies each batch as
    // it is made, and a colleague's codebook change says nothing about it.
    const saved = session.getSnapshot().protocolSections[stageSection];
    session.receiveAuthoritativeUpdate({
      protocolSections:
        saved === undefined
          ? applied.protocolSections
          : { ...applied.protocolSections, [stageSection]: saved },
      manifestRevision: applied.manifestRevision,
      attribution: {
        [section]: {
          sessionId: COLLEAGUE.sessionId,
          displayName: COLLEAGUE.displayName,
          revision: applied.manifestRevision,
        },
      },
    });
  };

  const addAttributeElsewhere = () => {
    const person = session.getSnapshot().protocolSections[PERSON_SECTION];
    if (person === undefined) return;
    const variables = isRecord(person.variables) ? person.variables : {};
    changeElsewhere(PERSON_SECTION, {
      ...person,
      variables: {
        ...variables,
        [COLLEAGUE_ATTRIBUTE_ID]: {
          name: 'nickname',
          type: 'text',
          component: 'Text',
        },
      },
    });
  };

  const issues = validation.status === 'invalid' ? validation.issues : [];
  const assets = Object.keys(snapshot.protocolSections[ASSETS_SECTION] ?? {});

  return (
    // The heading below is this panel's own `h2`; everything inside counts
    // from it, so an alert or a section raised in here lands on `h3` rather
    // than falling back to `h4` under it.
    <EnclosingHeadingLevel level="h2">
      <Surface
        as="section"
        spacing="md"
        aria-labelledby={titleId}
        className="flex flex-col gap-4"
      >
        <Heading id={titleId} level="h2" margin="none">
          The host
        </Heading>
        <Paragraph intent="smallText" emphasis="muted" margin="none">
          Everything below is read from the editing session and nowhere else.
          The buttons are the rest of Studio: a colleague at work, a section
          lock changing hands, an editor closed without saving.
        </Paragraph>

        <div className="grid grid-cols-1 gap-3 @min-[48rem]:grid-cols-2">
          <Paragraph role="status" aria-label="Editing access" margin="none">
            {accessSentence(access)}
          </Paragraph>
          <Paragraph
            role="status"
            aria-label="Changes sent to the host"
            margin="none"
          >
            {`${sent} ${sent === 1 ? 'change' : 'changes'} sent to the host.`}
          </Paragraph>
          <Paragraph role="status" aria-label="Unsaved work" margin="none">
            {unsavedSentence(snapshot.pendingCommands.length, history)}
          </Paragraph>
          <Paragraph role="status" aria-label="Protocol validity" margin="none">
            {validitySentence(validation.status, issues.length)}
          </Paragraph>
          <Paragraph role="status" aria-label="Imported files" margin="none">
            {stagedResources.length === 0
              ? 'Nothing has been imported into this edit.'
              : `Imported but not saved: ${stagedResources
                  .map((resource) => resource.name)
                  .join(', ')}.`}
          </Paragraph>
          <Paragraph
            role="status"
            aria-label="Files in the protocol"
            margin="none"
          >
            {`The protocol holds ${assets.length} ${
              assets.length === 1 ? 'file' : 'files'
            }.`}
          </Paragraph>
        </div>

        {presence.length > 0 && (
          <ul
            aria-label="Who else is here"
            className="list-disc space-y-1 pl-5"
          >
            {presence.map((person) => (
              <li key={person.sessionId}>
                {`${person.displayName} is ${
                  person.mode === 'editing' ? 'editing' : 'reading'
                } part of this protocol.`}
              </li>
            ))}
          </ul>
        )}

        {issues.length > 0 && (
          <ul
            aria-label="Problems in this protocol"
            className="list-disc space-y-1 pl-5"
          >
            {issues.slice(0, LISTED_ISSUES).map((issue) => (
              <li key={`${issue.code}:${issue.path.join('.')}`}>
                {formatMessageError(issue.message, intl) ?? issue.message}
                {issue.attributedChange !== undefined &&
                  ` Changed by ${issue.attributedChange.attribution.displayName}.`}
              </li>
            ))}
            {issues.length > LISTED_ISSUES && (
              <li>{`…and ${issues.length - LISTED_ISSUES} more.`}</li>
            )}
          </ul>
        )}

        <div
          role="group"
          aria-label="The rest of Studio"
          className="flex flex-wrap gap-3"
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addAttributeElsewhere}
          >
            A colleague adds an attribute
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => changeElsewhere(PERSON_SECTION, null)}
          >
            A colleague deletes the person type
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              session.setAccess({
                mode: 'readOnly',
                reason: 'lease-lost',
                holder: COLLEAGUE,
              })
            }
          >
            Lose the section lock
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              session.setAccess({
                mode: 'editable',
                leaseOwner: FIXTURE_SESSION_OWNER,
                // The epoch this host's lease is actually at. A real host
                // issues a NEW epoch on every acquisition and reports that
                // one; the in-memory host has no way to be told its lease
                // moved, and a session carrying an epoch the host does not
                // recognise has every later compound edit refused as stale.
                leaseEpoch: 1n,
              })
            }
          >
            Take the section lock back
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!history.canUndo}
            onClick={controller.undo}
          >
            {/*
              Not "Undo": a rich text field carries an undo of its own on its
              toolbar, and a story reaching for "the undo button" would get
              whichever the tree rendered first. This one is the session's.
            */}
            Undo the last change
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void controller.cancel()}
          >
            Close without saving
          </Button>
        </div>

        <div>
          <Heading level="h3" margin="none">
            What a host must do
          </Heading>
          <ol
            aria-label="Host responsibilities"
            className="mt-2 list-decimal space-y-1 pl-5"
          >
            {HOST_RESPONSIBILITIES.map((responsibility) => (
              <li key={responsibility}>{responsibility}</li>
            ))}
          </ol>
        </div>
      </Surface>
    </EnclosingHeadingLevel>
  );
}

const accessSentence = (
  access: StageEditorController['snapshot']['access'],
): string => {
  if (access.mode === 'editable') return 'You hold the section lock.';
  if (access.reason === 'lease-lost') {
    return access.holder === undefined
      ? 'The section lock was lost, so editing has stopped.'
      : `The section lock was lost to ${access.holder.displayName}, so editing has stopped.`;
  }
  if (access.reason === 'permission') {
    return 'You may read this stage but not change it.';
  }
  return access.holder === undefined
    ? 'Someone else holds the section lock, so this stage is open for reading.'
    : `${access.holder.displayName} holds the section lock, so this stage is open for reading.`;
};

const unsavedSentence = (
  pending: number,
  history: StageEditorController['snapshot']['history'],
): string => {
  const waiting =
    pending === 0
      ? 'Everything made here has reached the host.'
      : `${pending} ${pending === 1 ? 'change is' : 'changes are'} waiting to be saved with the stage.`;
  const undo = history.canUndo
    ? 'Undo is available.'
    : 'There is nothing to undo.';
  const fence =
    history.fencedAtRevision === undefined
      ? ''
      : ` History was cut at revision ${history.fencedAtRevision.sequence}.`;
  return `${waiting} ${undo}${fence}`;
};

const validitySentence = (
  status: 'pending' | 'valid' | 'invalid',
  issues: number,
): string => {
  if (status === 'pending') return 'Checking the protocol…';
  if (status === 'valid') return 'The protocol is valid.';
  return `The protocol has ${issues} ${issues === 1 ? 'problem' : 'problems'}.`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
