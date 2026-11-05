import { useMutation, useQuery } from '@tanstack/react-query';
import { getRouteApi, useBlocker } from '@tanstack/react-router';
import { Redacted } from 'effect';
import { Plus } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { makeRpcAdapter } from '@codaco/effect-query/adapter';
import type { RpcAdapter } from '@codaco/effect-query/types';
import { Alert } from '@codaco/fresco-ui/Alert';
import { Button } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { useAccessibilityAnnouncements } from '@codaco/fresco-ui/dnd/useAccessibilityAnnouncements';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { selectIsFormDirty } from '@codaco/fresco-ui/form/store/formStoreProvider';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { routeFocusTargetProps } from '@codaco/fresco-ui/navigation/RouteFocus';
import Spinner from '@codaco/fresco-ui/Spinner';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { ProtocolBuilderRpcs } from '@codaco/protocol-builder-core/contract';
import StageNameField from '@codaco/protocol-builder/fields/StageNameField';
import { useStageName } from '@codaco/protocol-builder/naming/useStageName';
import { ProtocolBuilder } from '@codaco/protocol-builder/ProtocolBuilder';
import type {
  StageEditorAccess,
  StageEditorActionContext,
} from '@codaco/protocol-builder/stage-editor-contract';
import StageEditor from '@codaco/protocol-builder/StageEditor';
import {
  useProtocolRevision,
  useRereadProtocol,
  useStageIndex,
  type StageSummary,
} from '@codaco/protocol-builder/state/hooks';
import {
  useProtocolReading,
  type ProtocolReading,
} from '@codaco/protocol-builder/state/protocolContext';
import {
  CurrentProtocolSchema,
  findTimelineStructureProblems,
} from '@codaco/protocol-validation';
import {
  StageId,
  type DraftId,
  type ProtocolId,
  type TeamId,
} from '@codaco/studio-contract/schema/ids';
import { assembleProtocolSections } from '@codaco/studio-sync/protocol-document';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import LockAnnouncer from '../editor/LockAnnouncer.tsx';
import OutlineStageRow from '../editor/OutlineStageRow.tsx';
import { locateProblem, type ProblemTarget } from '../editor/problemTarget.ts';
import { useFieldFocus } from '../editor/useFieldFocus.ts';
import ValidationAnnouncer from '../editor/ValidationAnnouncer.tsx';
import { createUuid } from '../lib/createUuid.ts';
import { toStudyId } from '../lib/ids.ts';
import { teamScope } from '../runtime/browserLogs.ts';
import { isForbidden } from '../runtime/errors.ts';
import { HostClient } from '../runtime/hostClient.ts';
import { editorVisits, observeLocks } from '../runtime/hostFaults.ts';
import { hostRuntime } from '../runtime/hostSession.ts';
import {
  reportUnauthorizedFailure,
  rpcCall,
  rpcQuery,
} from '../runtime/rpc.ts';

// The route id carries the area layout it sits under (§5.3), so it moved with
// the screen onto `/study/$studyId/editor`.
const route = getRouteApi('/app/study/$studyId/editor/');

/**
 * Built once: `ProtocolBuilder` memoises its whole context on this identity.
 */
const baseHostAdapter: RpcAdapter<ProtocolBuilderRpcs> = makeRpcAdapter({
  runtime: hostRuntime,
  client: HostClient,
  onFailure: reportUnauthorizedFailure,
});

/** What `protocols.draft` and every editing procedure are addressed by. */
type DraftAddress = {
  teamId: TeamId;
  protocolId: ProtocolId;
  draftId: DraftId;
};

/**
 * Whether moving one screen adds a problem to the timeline's structure — a
 * screen after the finish stage, or the interview ending anywhere else — which
 * the server refuses, as Architect does. Only problems a move ADDS count, so a
 * protocol already in such a shape can still be reordered into a better one.
 */
function moveAddsTimelineProblems(
  stages: readonly StageSummary[],
  fromIndex: number,
  toIndex: number,
): boolean {
  const proposed = [...stages];
  const [moved] = proposed.splice(fromIndex, 1);
  if (moved === undefined) return true;
  proposed.splice(toIndex, 0, moved);
  return (
    findTimelineStructureProblems(proposed).length >
    findTimelineStructureProblems(stages).length
  );
}

type Selection =
  | { kind: 'stage'; stageId: string }
  | { kind: 'settings' | 'codebook' | 'assets' | 'translations' };

/**
 * What the study in the URL gives the editor to open, as far as this
 * researcher can see.
 *
 * Five answers rather than two, because "not yet", "not yours", "nothing to
 * edit" and "could not ask" are different things to put on screen, and
 * collapsing any pair of them is what leaves a researcher on a spinner that
 * will never resolve.
 */
type EditorTarget =
  | { status: 'pending' }
  | { status: 'unavailable' }
  | { status: 'unreachable' }
  | { status: 'noDraft' }
  | { status: 'found'; address: DraftAddress };

type DraftValidation =
  | Readonly<{ status: 'pending'; issues: readonly [] }>
  | Readonly<{ status: 'unreadable'; issues: readonly [] }>
  | Readonly<{ status: 'valid'; issues: readonly [] }>
  | Readonly<{
      status: 'invalid';
      issues: readonly Readonly<{
        path: readonly (string | number)[];
        message: string;
      }>[];
    }>;

const messages = defineMessages({
  openingEditor: {
    id: 'studio.editor.openingEditor',
    defaultMessage: 'Opening protocol editor…',
    description:
      'Screen-reader status announced while the protocol editor is still loading.',
  },
  studyUnavailable: {
    id: 'studio.editor.studyUnavailable',
    defaultMessage:
      'This study could not be opened. Reload the page and try again.',
    description:
      'Shown when the study the editor URL names could not be read at all.',
  },
  studyUnreachable: {
    id: 'studio.editor.studyUnreachable',
    defaultMessage:
      'This study is not one of yours. Ask whoever sent you the link to give you access to it.',
    description:
      'Shown when the researcher has no access to the study the editor URL names.',
  },
  studyWithoutDraft: {
    id: 'studio.editor.studyWithoutDraft',
    defaultMessage: 'This study has no protocol draft to edit.',
    description:
      'Shown when the study exists but carries no protocol draft for the editor to open.',
  },
  discardTitle: {
    id: 'studio.editor.discardTitle',
    defaultMessage: 'Discard unsaved screen changes?',
    description:
      'Title of the dialog asking whether to abandon unsaved values on the current interview screen.',
  },
  discardConfirm: {
    id: 'studio.editor.discardConfirm',
    defaultMessage: 'Discard changes',
    description:
      'Button that abandons the unsaved values on the current interview screen.',
  },
  keepEditing: {
    id: 'studio.editor.keepEditing',
    defaultMessage: 'Keep editing',
    description:
      'Button that dismisses the discard dialog and leaves the unsaved values in place.',
  },
  discardForSection: {
    id: 'studio.editor.discardForSection',
    defaultMessage:
      'The values in this screen have not been saved. Discard them and open another section?',
    description:
      'Body of the discard dialog when the researcher is opening another section of the protocol.',
  },
  discardForLeaving: {
    id: 'studio.editor.discardForLeaving',
    defaultMessage:
      'The values in this screen have not been saved. Discard them and leave the protocol editor?',
    description:
      'Body of the discard dialog when the researcher is navigating away from the editor.',
  },
  discardForNewScreen: {
    id: 'studio.editor.discardForNewScreen',
    defaultMessage:
      'The values in this screen have not been saved. Discard them and add a new screen?',
    description:
      'Body of the discard dialog when the researcher is adding another interview screen.',
  },
  draftUnavailable: {
    id: 'studio.editor.draftUnavailable',
    defaultMessage:
      'This protocol draft could not be opened. Return to protocols and try again.',
    description:
      'Shown when the protocol draft itself could not be loaded into the editor.',
  },
  draftEditor: {
    id: 'studio.editor.draftEditor',
    defaultMessage: 'Draft editor',
    description:
      'Supporting line under the protocol name, naming what this screen edits.',
  },
  protocolSections: {
    id: 'studio.editor.protocolSections',
    defaultMessage: 'Protocol sections',
    description:
      "Heading and accessible name of the editor's own section selector.",
  },
  settings: {
    id: 'studio.editor.settings',
    defaultMessage: 'Settings',
    description:
      "Section selector entry for the protocol's own settings section.",
  },
  screens: {
    id: 'studio.editor.screens',
    defaultMessage: 'Screens',
    description:
      'Section selector group holding the interview screens of the protocol.',
  },
  addScreen: {
    id: 'studio.editor.addScreen',
    defaultMessage: 'Add',
    description: 'Button that adds another interview screen to the protocol.',
  },
  addUnconfirmed: {
    id: 'studio.editor.addUnconfirmed',
    defaultMessage:
      'Studio could not confirm whether the screen was added. Refresh the outline before trying again.',
    description:
      'Shown when adding an interview screen failed without saying whether it was created.',
  },
  refreshOutline: {
    id: 'studio.editor.refreshOutline',
    defaultMessage: 'Refresh outline',
    description:
      'Button that re-reads the protocol after an unconfirmed screen addition.',
  },
  outlineRefreshFailedForAdd: {
    id: 'studio.editor.outlineRefreshFailedForAdd',
    defaultMessage:
      'The outline could not be refreshed. Reload this editor before adding another screen.',
    description:
      'Shown when re-reading the protocol after an unconfirmed screen addition also failed.',
  },
  moveUnconfirmed: {
    id: 'studio.editor.moveUnconfirmed',
    defaultMessage:
      'Studio could not confirm the new screen order. Refresh the outline before moving another screen.',
    description:
      'Shown when reordering interview screens failed without saying whether the new order was kept.',
  },
  refreshOrder: {
    id: 'studio.editor.refreshOrder',
    defaultMessage: 'Refresh order',
    description:
      'Button that re-reads the protocol after an unconfirmed screen reorder.',
  },
  outlineRefreshFailedForMove: {
    id: 'studio.editor.outlineRefreshFailedForMove',
    defaultMessage:
      'The outline could not be refreshed. Reload this editor before moving another screen.',
    description:
      'Shown when re-reading the protocol after an unconfirmed screen reorder also failed.',
  },
  readingScreens: {
    id: 'studio.editor.readingScreens',
    defaultMessage: 'Reading the protocol…',
    description:
      'Shown in place of the list of interview screens while the protocol is still being read.',
  },
  screensUnreadable: {
    id: 'studio.editor.screensUnreadable',
    defaultMessage:
      'Part of this protocol could not be read, so its screens are not shown.',
    description:
      'Shown in place of the list of interview screens when part of the protocol could not be read at all.',
  },
  protocolUnreadable: {
    id: 'studio.editor.protocolUnreadable',
    defaultMessage:
      'Part of this protocol could not be read, so it has not been checked.',
    description:
      'Shown in the validation panel when part of the protocol could not be read at all.',
  },
  protocolNotChecked: {
    id: 'studio.editor.protocolNotChecked',
    defaultMessage: 'Protocol not checked',
    description:
      'Button reporting that the protocol could not be checked, because part of it could not be read.',
  },
  noScreens: {
    id: 'studio.editor.noScreens',
    defaultMessage: 'Add a screen to begin the interview flow.',
    description: 'Shown when the protocol has no interview screens yet.',
  },
  defaultScreenName: {
    id: 'studio.editor.defaultScreenName',
    defaultMessage: 'Screen {number}',
    description:
      'Stands in for an interview screen the researcher has not named; {number} is its position in the interview, counting from one.',
  },
  unknownScreenType: {
    id: 'studio.editor.unknownScreenType',
    defaultMessage: 'Unknown screen',
    description:
      'Supporting line of an outline entry whose screen carries no recognisable type.',
  },
  screenMoved: {
    id: 'studio.editor.screenMoved',
    defaultMessage:
      'Moved {name} to position {position, number} of {total, number}.',
    description:
      'Screen-reader announcement after an interview screen has been moved in the outline; {name} is the screen name, {position} its new place counting from one, and {total} how many screens the interview has.',
  },
  screenMoveRefused: {
    id: 'studio.editor.screenMoveRefused',
    defaultMessage:
      '{name} cannot move there, because the interview has to end with its finish screen.',
    description:
      'Screen-reader announcement when a requested move of an interview screen is refused because it would leave a screen after the finish screen or the interview ending somewhere else; {name} is the screen name.',
  },
  codebook: {
    id: 'studio.editor.codebook',
    defaultMessage: 'Codebook',
    description:
      "Name of the protocol's codebook section, in the section selector and as the canvas heading.",
  },
  assets: {
    id: 'studio.editor.assets',
    defaultMessage: 'Assets',
    description:
      "Name of the protocol's assets section, in the section selector and as the canvas heading.",
  },
  translations: {
    id: 'studio.editor.translations',
    defaultMessage: 'Translations',
    description:
      "Name of the protocol's translations section, in the section selector and as the canvas heading.",
  },
  inspector: {
    id: 'studio.editor.inspector',
    defaultMessage: 'Inspector',
    description:
      'Heading of the panel listing the validation problems of the protocol being edited.',
  },
  validationProblems: {
    id: 'studio.editor.validationProblems',
    defaultMessage:
      '{count, plural, one {# validation problem} other {# validation problems}}',
    description:
      'Button reporting how many validation problems the protocol currently has.',
  },
  protocolValid: {
    id: 'studio.editor.protocolValid',
    defaultMessage: 'Protocol valid',
    description:
      'Button reporting that the protocol currently has no validation problems.',
  },
  checkingProtocol: {
    id: 'studio.editor.checkingProtocol',
    defaultMessage: 'Checking protocol',
    description: 'Button reporting that the protocol is still being validated.',
  },
  assemblyFailed: {
    id: 'studio.editor.assemblyFailed',
    defaultMessage: 'The protocol document could not be assembled.',
    description:
      'Validation problem shown when the draft could not be turned into a protocol document to check.',
  },
  saveScreen: {
    id: 'studio.editor.saveScreen',
    defaultMessage: 'Save screen',
    description: "Submit button of the interview screen's form.",
  },
  validationHeading: {
    id: 'studio.editor.validationHeading',
    defaultMessage: 'Validation',
    description:
      'Heading of the section listing the protocol’s validation problems.',
  },
  checkingThisProtocol: {
    id: 'studio.editor.checkingThisProtocol',
    defaultMessage: 'Checking this protocol…',
    description: 'Shown while the protocol is still being validated.',
  },
  noValidationProblems: {
    id: 'studio.editor.noValidationProblems',
    defaultMessage: 'No validation problems.',
    description: 'Shown when the protocol has no validation problems.',
  },
  protocolSettings: {
    id: 'studio.editor.protocolSettings',
    defaultMessage: 'Protocol settings',
    description:
      'Canvas heading of the section holding the settings of the protocol itself.',
  },
  settingsBody: {
    id: 'studio.editor.settingsBody',
    defaultMessage: 'Protocol metadata editing will use this canvas.',
    description:
      'Says what the protocol settings section will do once it is built.',
  },
  codebookBody: {
    id: 'studio.editor.codebookBody',
    defaultMessage:
      'People, connections, and participant variables will be managed here.',
    description: 'Says what the codebook section will do once it is built.',
  },
  assetsBody: {
    id: 'studio.editor.assetsBody',
    defaultMessage:
      'Images, audio, and video used by this protocol will be managed here.',
    description: 'Says what the assets section will do once it is built.',
  },
  translationsBody: {
    id: 'studio.editor.translationsBody',
    defaultMessage: 'Translated protocol content will be managed here.',
    description: 'Says what the translations section will do once it is built.',
  },
});

function stageLabel(
  intl: IntlShape,
  stage: StageSummary,
  index: number,
): string {
  return stage.label.trim() === ''
    ? intl.formatMessage(messages.defaultScreenName, { number: index + 1 })
    : stage.label;
}

/**
 * What `/study/$studyId/editor` opens, resolved from the study id itself
 * rather than from whichever team the researcher was last acting in.
 *
 * **`$studyId` is authoritative** (§2.2, §5.6): a study URL is a canonical
 * link, and it has to open the study whoever follows it and however they got
 * there. Reading the ACTIVE team instead makes that false in two ways, both
 * reachable from an ordinary bookmark. A direct visit to team B's study while
 * the setting still names team A asks A's list, does not find it and reports
 * the study unavailable; and a session that names no team at all — which is
 * every first sign-in, since nothing sets `activeOrganizationId` when a
 * session is created — has nothing to ask, so the screen never resolves at
 * all. §6.6's reconciler cannot help: a study route names no team, so it
 * leaves the setting wherever the last team route left it.
 *
 * **One question, answered by the server.** `studies.get` takes the study id
 * alone and derives the tenant from the caller's own memberships (§6.3), and
 * it carries both halves the editing procedures need beyond the study: the
 * owning team, and the current draft of the study's protocol line. This
 * replaces asking every team the researcher belongs to for its own list, and
 * with it the assumption that a study id IS a protocol id.
 *
 * A refusal is `unreachable` and anything else is `unavailable`: FORBIDDEN is
 * the server's one answer for a study that is absent, in another team, or not
 * shown to this researcher's role, while an outage is no basis for a claim
 * about their access.
 */
function useEditorTarget(studyId: string): EditorTarget {
  const study = useQuery(
    rpcQuery('studies.get', { studyId: toStudyId(studyId) }),
  );

  if (study.isPending) return { status: 'pending' };
  if (study.isError) {
    return {
      status: isForbidden(study.error) ? 'unreachable' : 'unavailable',
    };
  }
  const { teamId, study: row, protocolDraftId } = study.data;
  if (row.protocolId === null || protocolDraftId === null) {
    return { status: 'noDraft' };
  }
  return {
    status: 'found',
    address: { teamId, protocolId: row.protocolId, draftId: protocolDraftId },
  };
}

/**
 * The protocol editor, at `/study/$studyId/editor` (§5.2, #1272).
 *
 * The editing procedures are addressed by `{ teamId, protocolId, draftId }`
 * and the URL carries only `$studyId`; `useEditorTarget` above turns one into
 * the other. A study this researcher cannot reach, and a study with no draft
 * to edit, are the two answers that leave nothing to open, and each says which
 * it is.
 */
export default function Editor() {
  const intl = useAppIntl();
  const { studyId } = route.useParams();
  const target = useEditorTarget(studyId);

  if (target.status === 'pending') {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
        <span className="sr-only">
          {intl.formatMessage(messages.openingEditor)}
        </span>
      </div>
    );
  }

  if (target.status === 'unavailable') {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          {intl.formatMessage(messages.studyUnavailable)}
        </Alert>
      </div>
    );
  }

  if (target.status !== 'found') {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          {intl.formatMessage(
            target.status === 'unreachable'
              ? messages.studyUnreachable
              : messages.studyWithoutDraft,
          )}
        </Alert>
      </div>
    );
  }

  return <ProtocolEditor address={target.address} />;
}

/**
 * What has to be answered before the editor can be opened at all: that this
 * researcher's draft is there, and what it is called.
 *
 * The one thing `protocols.draft` is still asked for. Everything the editor
 * then draws — the screens, their names, the validation, which screen it opens
 * on, the revision a reorder is fenced on — comes from the protocol the
 * package holds, which one channel keeps current (#1810). Two readings of one
 * protocol is what left a collaborator's work off this screen until something
 * unrelated happened to refetch.
 */
function ProtocolEditor({ address }: { address: DraftAddress }) {
  const intl = useAppIntl();
  const draft = useQuery(rpcQuery('protocols.draft', address));
  const hostAdapter = useMemo(
    () => observeLocks(baseHostAdapter, teamScope(address.teamId)),
    [address.teamId],
  );
  useEffect(
    () => editorVisits.open(),
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- the address is the re-run trigger: a visit to another draft closes the last one's and opens its own.
    [address.teamId, address.protocolId, address.draftId],
  );

  if (draft.isPending) {
    return (
      // The `<main id="main-content">` is the area layout's (§5.3, §7.1):
      // `AppFrame` renders the skip link and `AppArea` the landmark it
      // targets. These three branches are mutually exclusive, but each one
      // used to declare a second `<main>` with the same id inside the area's.
      <div className="flex h-full items-center justify-center">
        <Spinner />
        <span className="sr-only">
          {intl.formatMessage(messages.openingEditor)}
        </span>
      </div>
    );
  }
  if (!draft.data) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          {intl.formatMessage(messages.draftUnavailable)}
        </Alert>
      </div>
    );
  }

  return (
    <ProtocolBuilder adapter={hostAdapter} protocolId={address.protocolId}>
      <EditorWorkspace
        address={address}
        protocolName={Redacted.value(draft.data.protocol.name)}
      />
    </ProtocolBuilder>
  );
}

/**
 * The editor itself, inside the protocol the package holds.
 *
 * Inside rather than around it because everything here reads that protocol:
 * the package's hooks are observers on its cache, and the channel feeding it
 * is what carries a collaborator's screen, rename, deletion or reorder onto
 * this screen without anything here asking for it again.
 */
function EditorWorkspace({
  address,
  protocolName,
}: {
  address: DraftAddress;
  protocolName: string;
}) {
  const intl = useAppIntl();
  const params = address;
  const { confirm } = useDialog();
  const [selection, setSelectionState] = useState<Selection>({
    kind: 'settings',
  });
  const [stageFormDirty, setStageFormDirty] = useState(false);
  const [reconcilingAdd, setReconcilingAdd] = useState(false);
  const [addRecoveryFailed, setAddRecoveryFailed] = useState(false);
  const [reconcilingMove, setReconcilingMove] = useState(false);
  const [moveRecoveryFailed, setMoveRecoveryFailed] = useState(false);
  const [selectionInitialized, setSelectionInitialized] = useState(false);
  const discardRequestPending = useRef(false);
  // Where focus goes once an outline the researcher refreshed has been read
  // back: the Refresh button they pressed is in an alert that goes with it.
  const addButtonRef = useRef<HTMLButtonElement>(null);
  // The outline, the position a reorder points at and the validation all read
  // the protocol as a WHOLE, so all three wait for the whole of it. A stage
  // whose section has not arrived is one `useStageIndex` leaves out, and an
  // index in a list with a hole in it is not an index in the interview: a
  // reorder computed from it moves the screen somewhere the researcher did not
  // point at, and a list that is briefly empty is not a protocol with no
  // screens in it.
  const reading = useProtocolReading();
  const stages = useStageIndex();
  const revision = useProtocolRevision();
  const rereadProtocol = useRereadProtocol();
  const { announce } = useAccessibilityAnnouncements();
  const draftValidation = useDraftValidation(reading);
  // What the open screen's editor last said about the editing lock, with the
  // screen it said it for: the report outlives the editor that made it (a lost
  // lock remounts the editor's form), so which screen it was about is kept
  // beside it.
  const [stageAccess, setStageAccess] = useState<
    { stageId: string; access: StageEditorAccess } | undefined
  >();
  const canvasRef = useRef<HTMLDivElement>(null);
  const outlineRef = useRef<HTMLElement>(null);
  const { focusField, cancelFieldFocus } = useFieldFocus(canvasRef);

  // Opening something starts it afresh. What was said about the lock before
  // is forgotten: a screen reopened is asked for its lock again, and what it
  // said last time (held by somebody who has since let it go) is not true of
  // this opening. A field still being waited for, for a problem on whatever
  // was open, is no longer wanted.
  const setSelection = useCallback(
    (next: Selection) => {
      setSelectionState(next);
      setStageAccess(undefined);
      cancelFieldFocus();
    },
    [cancelFieldFocus],
  );

  const confirmDiscardStageChanges = useCallback(
    // `confirm` takes plain strings, so the descriptors are formatted here
    // rather than teaching the shared dialog API about message descriptors.
    async (description: MessageDescriptor) => {
      if (discardRequestPending.current) return false;

      discardRequestPending.current = true;
      try {
        const result = await confirm({
          title: intl.formatMessage(messages.discardTitle),
          description: intl.formatMessage(description),
          confirmLabel: intl.formatMessage(messages.discardConfirm),
          cancelLabel: intl.formatMessage(messages.keepEditing),
          intent: 'destructive',
          onConfirm: () => undefined,
        });
        return result === true;
      } finally {
        discardRequestPending.current = false;
      }
    },
    // oxlint-disable-next-line react/memo-dependencies -- `confirm` and `intl` are used in the `try/finally`, which the rule cannot follow.
    [confirm, intl],
  );

  const requestSelection = useCallback(
    async (nextSelection: Selection) => {
      const unchanged =
        nextSelection.kind === selection.kind &&
        (nextSelection.kind !== 'stage' ||
          (selection.kind === 'stage' &&
            nextSelection.stageId === selection.stageId));
      if (unchanged) return true;

      if (
        stageFormDirty &&
        !(await confirmDiscardStageChanges(messages.discardForSection))
      ) {
        return false;
      }

      setSelection(nextSelection);
      return true;
    },
    [confirmDiscardStageChanges, selection, setSelection, stageFormDirty],
  );

  const shouldBlockNavigation = useCallback(async () => {
    if (!stageFormDirty) return false;

    const shouldDiscard = await confirmDiscardStageChanges(
      messages.discardForLeaving,
    );
    return !shouldDiscard;
  }, [confirmDiscardStageChanges, stageFormDirty]);

  useBlocker({
    shouldBlockFn: shouldBlockNavigation,
    enableBeforeUnload: stageFormDirty,
    disabled: !stageFormDirty,
  });

  // Once, and only once the whole protocol has been read: a protocol that has
  // no screens when it is opened stays on its settings, and the screen a
  // collaborator adds minutes later is theirs rather than something this
  // editor is moved to. A reading still missing sections would open on
  // whichever screen happened to arrive first.
  if (reading.status === 'read' && !selectionInitialized) {
    setSelectionInitialized(true);
    const firstStage = stages[0];
    if (firstStage !== undefined) {
      setSelection({ kind: 'stage', stageId: firstStage.id });
    }
  }

  const selectedStageId = selection.kind === 'stage' ? selection.stageId : null;
  const selectedStageIndex = stages.findIndex(
    (stage) => stage.id === selectedStageId,
  );
  const selectedStage = stages[selectedStageIndex];
  const selectedStageAccess =
    stageAccess?.stageId === selectedStageId ? stageAccess?.access : undefined;

  // Stable between renders for the screen that is open, and built outside the
  // render of the slot: the editor calls these as functions in its slots, but
  // a function that returns elements and is made during render reads as a
  // component made during render, which would remount its subtree each time
  // if it were used as one.
  const renderStageActions = useMemo(
    () =>
      stageActionsRenderer(setStageFormDirty, (access) => {
        if (selectedStageId !== null) {
          setStageAccess({ stageId: selectedStageId, access });
        }
      }),
    [selectedStageId],
  );

  const addStage = useMutation({
    mutationFn: async () => {
      const stageId = StageId.make(createUuid());
      await rpcCall('protocols.addInformationStage', { ...params, stageId });
      return stageId;
    },
    onSuccess: async (stageId) => {
      await rereadProtocol();
      // Dirty changes were confirmed before the server mutation. Selecting
      // directly avoids asking again after the new screen already exists.
      setSelection({ kind: 'stage', stageId });
    },
  });
  const moveStage = useMutation({
    mutationFn: async (input: {
      stageId: string;
      toIndex: number;
      expectedRevision: bigint;
      /** What the move is announced as once it has landed. */
      announcement: string;
    }) =>
      rpcCall('protocols.moveStage', {
        ...params,
        stageId: input.stageId,
        toIndex: input.toIndex,
        expectedRevision: String(input.expectedRevision),
      }),
    onSuccess: async (_, input) => {
      await rereadProtocol();
      // Said once the outline shows the new order, however the move was made,
      // and not before the server has kept it: a move the server refused must
      // not have been announced as done.
      announce(input.announcement);
    },
  });
  const moveBlocked = moveStage.isError || reconcilingMove;
  // The screen whose move is with the server, and whether it landed.
  const moveInFlight = useRef<
    { stageId: string; landed: Promise<boolean> } | undefined
  >(undefined);

  // Whether a screen may be moved to `toIndex` right now, for the outline's
  // controls. A move in flight counts as unavailable, but is not a reason to
  // take the control out of the tab order (see `OutlineStageRow`).
  const canMoveStage = (fromIndex: number, toIndex: number) =>
    toIndex >= 0 &&
    toIndex < stages.length &&
    !moveStage.isPending &&
    !moveBlocked &&
    !moveAddsTimelineProblems(stages, fromIndex, toIndex);

  // The order this move is expressed against is the one on screen, so the
  // revision it is fenced on has to be the one that drew it — the newest the
  // channel has delivered. Quoting a revision from a reading of the draft made
  // somewhere else is how a move computed from THIS order was accepted against
  // another one.
  //
  // Answers `false` for a move refused on the spot, and otherwise a promise of
  // whether the server kept it, so a control waiting to take focus back after
  // the list reorders stops waiting for a move that never landed. A second
  // press on the screen whose move is in flight is not repeated; it is given
  // that move's answer, since its control is waiting on the same reorder.
  const requestMoveStage = (
    stageId: string,
    toIndex: number,
  ): false | Promise<boolean> => {
    const fromIndex = stages.findIndex((stage) => stage.id === stageId);
    const stage = stages[fromIndex];
    if (revision === undefined || stage === undefined || moveBlocked) {
      return false;
    }
    if (moveStage.isPending) {
      const inFlight = moveInFlight.current;
      return inFlight?.stageId === stageId ? inFlight.landed : false;
    }
    const name = stageLabel(intl, stage, fromIndex);
    if (moveAddsTimelineProblems(stages, fromIndex, toIndex)) {
      announce(intl.formatMessage(messages.screenMoveRefused, { name }));
      return false;
    }
    const landed = moveStage
      .mutateAsync({
        stageId,
        toIndex,
        expectedRevision: revision,
        announcement: intl.formatMessage(messages.screenMoved, {
          name,
          position: toIndex + 1,
          total: stages.length,
        }),
      })
      .then(
        () => true,
        () => false,
      );
    moveInFlight.current = { stageId, landed };
    return landed;
  };

  // Takes the researcher to what a validation problem is about: opens the
  // section that holds it, then moves focus to the field. A problem that names
  // no field this editor has (the interview as a whole, a section not built
  // yet) lands on the nearest thing that does exist, never on the page body.
  //
  // Focus moves once the selection that opens the problem has been DRAWN, not
  // when it has been asked for. After a discard prompt the selection is set
  // outside any event, and React draws it after the code that asked has
  // already carried on, which would then search the canvas it is leaving and
  // land on a field of the screen being closed. Each request is a fresh object
  // so that asking twice for the same problem moves focus twice.
  const [problemToReach, setProblemToReach] = useState<{
    target: Exclude<ProblemTarget, { kind: 'outline' }>;
  }>();
  const goToProblem = async (target: ProblemTarget) => {
    if (target.kind === 'outline') {
      cancelFieldFocus();
      outlineRef.current?.focus();
      return;
    }
    const opened = await requestSelection(
      target.kind === 'stage'
        ? { kind: 'stage', stageId: target.stageId }
        : { kind: target.section },
    );
    if (opened) setProblemToReach({ target });
  };
  useEffect(() => {
    if (problemToReach === undefined) return;
    const { target } = problemToReach;
    if (target.kind === 'section') {
      // The section's heading is the only thing its canvas has to land on.
      canvasRef.current
        ?.querySelector<HTMLElement>('[data-canvas-heading]')
        ?.focus();
      return;
    }
    // The canvas now holds the target screen's editor, which is keyed by the
    // screen and draws nothing until that screen has been read, so no field
    // found here belongs to the screen that was open before. The screen's own
    // entry in the outline names it, and is the selected one.
    focusField(target.fieldNames, () =>
      outlineRef.current
        ?.querySelector<HTMLElement>('[aria-current="page"]')
        ?.focus(),
    );
  }, [problemToReach, focusField]);

  // The reading is what reports a failure, so a retry that fails again has
  // nothing to add: it puts the same message back on screen.
  const retryReadingProtocol = () => {
    void rereadProtocol().catch(() => undefined);
  };

  const reconcileAddStage = async () => {
    if (reconcilingAdd) return;
    setReconcilingAdd(true);
    setAddRecoveryFailed(false);
    try {
      await rereadProtocol();
      addButtonRef.current?.focus();
      addStage.reset();
    } catch {
      setAddRecoveryFailed(true);
    } finally {
      setReconcilingAdd(false);
    }
  };

  const reconcileMoveStage = async () => {
    if (reconcilingMove) return;
    setReconcilingMove(true);
    setMoveRecoveryFailed(false);
    try {
      await rereadProtocol();
      // Which screen the lost move was about is not known any more, so focus
      // lands on the control that heads the list it reread.
      addButtonRef.current?.focus();
      moveStage.reset();
    } catch {
      setMoveRecoveryFailed(true);
    } finally {
      setReconcilingMove(false);
    }
  };

  // A button whose action is unavailable for now stays focusable
  // (`aria-disabled`, not `disabled`): a `disabled` button drops the focus of
  // the researcher who just pressed it.
  const addUnavailable =
    addStage.isPending || addStage.isError || reconcilingAdd;

  const requestAddStage = async () => {
    if (addUnavailable) return;
    if (
      stageFormDirty &&
      !(await confirmDiscardStageChanges(messages.discardForNewScreen))
    ) {
      return;
    }

    addStage.mutate();
  };

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-surface-1 flex flex-wrap items-center justify-between gap-4 border-y px-4 py-3">
        {/*
            No way-out control here: the area's outline owns "Back to study" and
            the header owns the team and study chips (§5.5). A second back
            affordance inside `<main>` would be a third answer to the same
            question, and the two would not even agree on where "back" is.
          */}
        <div className="min-w-0">
          <Heading
            className="truncate"
            level="h1"
            margin="none"
            {...routeFocusTargetProps}
          >
            {protocolName}
          </Heading>
          <Paragraph className="text-sm" margin="none">
            {intl.formatMessage(messages.draftEditor)}
          </Paragraph>
        </div>
        <ValidationButton validation={draftValidation} />
        <LockAnnouncer
          key={selectedStageId ?? 'none'}
          name={
            selectedStage === undefined
              ? ''
              : stageLabel(intl, selectedStage, selectedStageIndex)
          }
          access={selectedStageAccess}
        />
        <ValidationAnnouncer
          problemCount={
            draftValidation.status === 'invalid'
              ? draftValidation.issues.length
              : draftValidation.status === 'valid'
                ? 0
                : undefined
          }
        />
      </div>

      <div className="laptop:grid-cols-[minmax(15rem,1fr)_minmax(24rem,2.5fr)_minmax(16rem,1fr)] grid min-h-0 flex-1 grid-cols-1 gap-4 p-4">
        <aside aria-labelledby="outline-heading" className="min-h-0">
          <Surface className="flex h-full min-h-0 flex-col" spacing="sm">
            {/*
                "Protocol sections", not "Protocol outline": the area's sidebar
                is the outline (§5.5), and two regions on one screen carrying
                one name is two things a screen reader cannot tell apart. This
                one is the editor's own section selector, inside `<main>`, and
                #1272 is what eventually merges the two.
              */}
            <Heading id="outline-heading" level="h2">
              {intl.formatMessage(messages.protocolSections)}
            </Heading>
            <nav
              ref={outlineRef}
              // Where focus goes for a validation problem about the interview
              // as a whole, which no field or section holds.
              tabIndex={-1}
              aria-label={intl.formatMessage(messages.protocolSections)}
              className="focusable min-h-0 overflow-y-auto"
            >
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                <OutlineButton
                  selected={selection.kind === 'settings'}
                  onClick={() => void requestSelection({ kind: 'settings' })}
                >
                  {intl.formatMessage(messages.settings)}
                </OutlineButton>
                <li>
                  <div className="flex items-center justify-between gap-2 px-2 py-1">
                    <span className="font-heading font-bold">
                      {intl.formatMessage(messages.screens)}
                    </span>
                    <Button
                      ref={addButtonRef}
                      size="sm"
                      variant="text"
                      icon={<Plus aria-hidden="true" />}
                      aria-disabled={addUnavailable}
                      onClick={() => void requestAddStage()}
                    >
                      {intl.formatMessage(messages.addScreen)}
                    </Button>
                  </div>
                  {addStage.isError && (
                    <Alert className="mb-2" variant="destructive">
                      <Paragraph margin="none">
                        {intl.formatMessage(messages.addUnconfirmed)}
                      </Paragraph>
                      <Button
                        className="mt-3"
                        size="sm"
                        aria-disabled={reconcilingAdd}
                        onClick={() => void reconcileAddStage()}
                      >
                        {intl.formatMessage(messages.refreshOutline)}
                      </Button>
                      {addRecoveryFailed && (
                        <Paragraph className="mt-2" margin="none">
                          {intl.formatMessage(
                            messages.outlineRefreshFailedForAdd,
                          )}
                        </Paragraph>
                      )}
                    </Alert>
                  )}
                  {moveStage.isError && (
                    <Alert className="mb-2" variant="destructive">
                      <Paragraph margin="none">
                        {intl.formatMessage(messages.moveUnconfirmed)}
                      </Paragraph>
                      <Button
                        className="mt-3"
                        size="sm"
                        aria-disabled={reconcilingMove}
                        onClick={() => void reconcileMoveStage()}
                      >
                        {intl.formatMessage(messages.refreshOrder)}
                      </Button>
                      {moveRecoveryFailed && (
                        <Paragraph className="mt-2" margin="none">
                          {intl.formatMessage(
                            messages.outlineRefreshFailedForMove,
                          )}
                        </Paragraph>
                      )}
                    </Alert>
                  )}
                  {reading.status === 'reading' && (
                    <Paragraph className="px-2 text-sm">
                      {intl.formatMessage(messages.readingScreens)}
                    </Paragraph>
                  )}
                  {reading.status === 'unreadable' && (
                    <Alert className="mb-2" variant="destructive">
                      <div className="flex flex-wrap items-center gap-3">
                        <span>
                          {intl.formatMessage(messages.screensUnreadable)}
                        </span>
                        <Button size="sm" onClick={retryReadingProtocol}>
                          {intl.formatMessage(commonMessages.retry)}
                        </Button>
                      </div>
                    </Alert>
                  )}
                  {reading.status === 'read' && stages.length === 0 && (
                    <Paragraph className="px-2 text-sm">
                      {intl.formatMessage(messages.noScreens)}
                    </Paragraph>
                  )}
                  {reading.status === 'read' && stages.length > 0 && (
                    <ol className="m-0 flex list-none flex-col gap-2 p-0 ps-3">
                      {stages.map((stage, index) => (
                        <OutlineStageRow
                          key={stage.id}
                          stageId={stage.id}
                          name={stageLabel(intl, stage, index)}
                          typeLabel={
                            stage.type === ''
                              ? intl.formatMessage(messages.unknownScreenType)
                              : stage.type
                          }
                          index={index}
                          stageCount={stages.length}
                          selected={selectedStageId === stage.id}
                          canMoveUp={canMoveStage(index, index - 1)}
                          canMoveDown={canMoveStage(index, index + 1)}
                          onSelect={() =>
                            void requestSelection({
                              kind: 'stage',
                              stageId: stage.id,
                            })
                          }
                          onMove={requestMoveStage}
                        />
                      ))}
                    </ol>
                  )}
                </li>
                <OutlineButton
                  selected={selection.kind === 'codebook'}
                  onClick={() => void requestSelection({ kind: 'codebook' })}
                >
                  {intl.formatMessage(messages.codebook)}
                </OutlineButton>
                <OutlineButton
                  selected={selection.kind === 'assets'}
                  onClick={() => void requestSelection({ kind: 'assets' })}
                >
                  {intl.formatMessage(messages.assets)}
                </OutlineButton>
                <OutlineButton
                  selected={selection.kind === 'translations'}
                  onClick={() =>
                    void requestSelection({ kind: 'translations' })
                  }
                >
                  {intl.formatMessage(messages.translations)}
                </OutlineButton>
              </ul>
            </nav>
          </Surface>
        </aside>

        <div ref={canvasRef} className="min-h-[24rem]">
          <Surface className="h-full" spacing="lg">
            {selection.kind === 'stage' ? (
              <StageEditor
                target={{
                  sectionId: sectionId({
                    kind: 'stage',
                    stageId: selection.stageId,
                  }),
                }}
                header={renderScreenTitle}
                actions={renderStageActions}
              />
            ) : (
              <SectionPlaceholder kind={selection.kind} />
            )}
          </Surface>
        </div>

        <aside
          id="protocol-problems"
          aria-labelledby="inspector-heading"
          tabIndex={-1}
          className="min-h-0"
        >
          <Surface className="h-full" spacing="sm">
            <Heading id="inspector-heading" level="h2">
              {intl.formatMessage(messages.inspector)}
            </Heading>
            <ProtocolProblems
              validation={draftValidation}
              stages={stages}
              onSelectProblem={(target) => void goToProblem(target)}
            />
          </Surface>
        </aside>
      </div>
    </div>
  );
}

function OutlineButton(props: {
  selected: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        className="focusable aria-current:bg-selected aria-current:text-selected-contrast w-full rounded px-3 py-2 text-start"
        aria-current={props.selected ? 'page' : undefined}
        onClick={() => props.onClick()}
      >
        {props.children}
      </button>
    </li>
  );
}

/**
 * The screen's name, at the top of Studio's editor panel.
 *
 * Studio's rather than the package's: the package publishes the name as a
 * field, and what a title looks like around it belongs to the host. The least
 * of one — no picture, no badge — because the rename Studio is heading for is
 * a menu on the outline rather than a title here.
 *
 * Rendered from the editor's HEADER slot: inside the stage form's provider,
 * because the name is a field of it, and above the form's own fields.
 */
function ScreenTitle() {
  const { label } = useStageName();

  return (
    <div className="flex w-full flex-col">
      {/*
        A heading rather than a label: the visible one is the name field, which
        is a control and cannot be a heading. Hidden, so the name is the only
        title on screen.
      */}
      <Heading level="h2" className="sr-only">
        {label}
      </Heading>
      <StageNameField />
    </div>
  );
}

const renderScreenTitle = () => <ScreenTitle />;

const stageActionsRenderer =
  (
    onDirtyChange: (dirty: boolean) => void,
    onAccessChange: (access: StageEditorAccess) => void,
  ) =>
  (context: StageEditorActionContext) => (
    <StageActions
      context={context}
      onDirtyChange={onDirtyChange}
      onAccessChange={onAccessChange}
    />
  );

/**
 * Studio's own chrome for the stage the package is editing.
 *
 * The action slot renders inside the editor's form store, which is the only
 * place the screen's unsaved state can be read from: the form belongs to
 * `@codaco/protocol-builder`, while the discard dialog and the navigation
 * blocker that consume this belong to the route.
 */
function StageActions(props: {
  context: StageEditorActionContext;
  onDirtyChange: (dirty: boolean) => void;
  onAccessChange: (access: StageEditorAccess) => void;
}) {
  const intl = useAppIntl();
  const dirty = useFormStore(selectIsFormDirty);
  const { onDirtyChange, onAccessChange } = props;
  const { access } = props.context;

  // Reported upward rather than spoken from here: this chrome is rebuilt when
  // the lock is lost (the editor starts again from what the protocol holds),
  // and a live region that is rebuilt with its text already inside is often
  // not announced. The route keeps the one that is always there.
  useLayoutEffect(() => {
    onAccessChange(access);
  }, [access, onAccessChange]);

  useLayoutEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  return (
    <div className="flex justify-end">
      <SubmitButton
        form={props.context.formId}
        disabled={props.context.readOnly}
      >
        {intl.formatMessage(messages.saveScreen)}
      </SubmitButton>
    </div>
  );
}

function ValidationButton(props: { validation: DraftValidation }) {
  const intl = useAppIntl();
  const { validation } = props;
  return (
    <Button
      size="sm"
      onClick={() => document.getElementById('protocol-problems')?.focus()}
    >
      {validation.status === 'invalid' &&
        intl.formatMessage(messages.validationProblems, {
          count: validation.issues.length,
        })}
      {validation.status === 'valid' &&
        intl.formatMessage(messages.protocolValid)}
      {validation.status === 'unreadable' &&
        intl.formatMessage(messages.protocolNotChecked)}
      {validation.status === 'pending' &&
        intl.formatMessage(messages.checkingProtocol)}
    </Button>
  );
}

const PENDING_VALIDATION: DraftValidation = { status: 'pending', issues: [] };
const UNREADABLE_VALIDATION: DraftValidation = {
  status: 'unreadable',
  issues: [],
};

function useDraftValidation(reading: ProtocolReading): DraftValidation {
  const intl = useAppIntl();
  // The outcome of checking one reading, kept with the reading it is for. A
  // reading that has changed since has no outcome yet, so what is shown is
  // derived from the pair rather than reset by the effect that checks.
  const [checked, setChecked] = useState<
    { reading: ProtocolReading; validation: DraftValidation } | undefined
  >();

  useEffect(() => {
    if (reading.status !== 'read') return undefined;
    let active = true;
    const { sections } = reading;
    const settle = (validation: DraftValidation) => {
      if (active) setChecked({ reading, validation });
    };
    void (async () => {
      try {
        const result = await CurrentProtocolSchema.safeParseAsync(
          assembleProtocolSections(sections),
        );
        settle(
          result.success
            ? { status: 'valid', issues: [] }
            : {
                status: 'invalid',
                issues: result.error.issues.map(toDraftValidationIssue),
              },
        );
      } catch (error) {
        settle({
          status: 'invalid',
          issues: [
            {
              path: [],
              message:
                error instanceof Error
                  ? error.message
                  : intl.formatMessage(messages.assemblyFailed),
            },
          ],
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [intl, reading]);

  // "Could not be read" and "not yet" are different things to leave on
  // screen: the first is an answer, and reporting it as the second is a
  // check that never finishes.
  if (reading.status === 'unreadable') return UNREADABLE_VALIDATION;
  if (reading.status !== 'read' || checked?.reading !== reading) {
    return PENDING_VALIDATION;
  }
  return checked.validation;
}

function toDraftValidationIssue(
  issue: Readonly<{ path: readonly PropertyKey[]; message: string }>,
): Readonly<{ path: readonly (string | number)[]; message: string }> {
  return {
    path: issue.path.map((segment) =>
      typeof segment === 'symbol' ? String(segment) : segment,
    ),
    message: issue.message,
  };
}

/**
 * Names where a problem is, for the line under it: the screen, or the section
 * of the protocol. A problem about the interview as a whole has no one place.
 */
function problemLocation(
  intl: IntlShape,
  target: ProblemTarget,
  stages: readonly StageSummary[],
): string | undefined {
  if (target.kind === 'section') {
    return intl.formatMessage(messages[target.section]);
  }
  if (target.kind !== 'stage') return undefined;
  const index = stages.findIndex((stage) => stage.id === target.stageId);
  const stage = stages[index];
  return stage === undefined ? undefined : stageLabel(intl, stage, index);
}

function ProtocolProblems(props: {
  validation: DraftValidation;
  stages: readonly StageSummary[];
  onSelectProblem: (target: ProblemTarget) => void;
}) {
  const intl = useAppIntl();
  return (
    <section aria-labelledby="validation-heading">
      <Heading id="validation-heading" level="h3">
        {intl.formatMessage(messages.validationHeading)}
      </Heading>
      {props.validation.status === 'pending' && (
        <Paragraph>
          {intl.formatMessage(messages.checkingThisProtocol)}
        </Paragraph>
      )}
      {props.validation.status === 'unreadable' && (
        <Paragraph>{intl.formatMessage(messages.protocolUnreadable)}</Paragraph>
      )}
      {props.validation.status === 'valid' && (
        <Paragraph>
          {intl.formatMessage(messages.noValidationProblems)}
        </Paragraph>
      )}
      {props.validation.status === 'invalid' && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {props.validation.issues.map((issue, index) => {
            const target = locateProblem(issue.path, props.stages);
            const location = problemLocation(intl, target, props.stages);
            return (
              <li key={`${issue.path.join('.')}-${index}`}>
                {/* Each problem is a control: it opens the section and moves
                    focus to the field it is about. */}
                <button
                  type="button"
                  className="focusable w-full rounded px-2 py-1 text-start"
                  onClick={() => props.onSelectProblem(target)}
                >
                  <span className="block">{issue.message}</span>
                  {location !== undefined && (
                    <span className="block text-xs opacity-70">{location}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SectionPlaceholder(props: {
  kind: Exclude<Selection['kind'], 'stage'>;
}) {
  const intl = useAppIntl();
  // The three section names the outline also carries are one descriptor each:
  // the entry and the canvas heading name the same section, and translating
  // them apart would let a researcher's way in disagree with where it landed.
  const content = {
    settings: {
      heading: messages.protocolSettings,
      body: messages.settingsBody,
    },
    codebook: {
      heading: messages.codebook,
      body: messages.codebookBody,
    },
    assets: {
      heading: messages.assets,
      body: messages.assetsBody,
    },
    translations: {
      heading: messages.translations,
      body: messages.translationsBody,
    },
  }[props.kind];
  return (
    <>
      {/* tabIndex: where focus lands for a validation problem in this section. */}
      <Heading level="h2" tabIndex={-1} data-canvas-heading="">
        {intl.formatMessage(content.heading)}
      </Heading>
      <Paragraph>{intl.formatMessage(content.body)}</Paragraph>
    </>
  );
}
