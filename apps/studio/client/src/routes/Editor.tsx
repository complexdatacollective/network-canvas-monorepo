import { ORPCError } from '@orpc/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi, useBlocker } from '@tanstack/react-router';
import { ArrowDown, ArrowUp, Plus } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Form from '@codaco/fresco-ui/form/Form';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { selectIsFormDirty } from '@codaco/fresco-ui/form/store/formStoreProvider';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { routeFocusTargetProps } from '@codaco/fresco-ui/navigation/RouteFocus';
import Spinner from '@codaco/fresco-ui/Spinner';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { useStageEditorController } from '@codaco/protocol-builder/controller';
import type { ProtocolBuilderSession } from '@codaco/protocol-builder/session';
import { CurrentProtocolSchema } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { assembleProtocolSections } from '@codaco/studio-sync/protocol-document';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { useStudioStageSession } from '../editor/useStudioStageSession.ts';
import { orpc, rpcClient } from '../lib/api.ts';
import { createUuid } from '../lib/createUuid.ts';

// The route id carries the area layout it sits under (§5.3), so it moved with
// the screen onto `/study/$studyId/editor`.
const route = getRouteApi('/app/study/$studyId/editor/');

/** What `protocols.draft` and every editing procedure are addressed by. */
type DraftAddress = {
  teamId: string;
  protocolId: string;
  draftId: string;
};

type Selection =
  | { kind: 'stage'; stageId: string }
  | { kind: 'settings' | 'codebook' | 'assets' | 'translations' };

type Draft = Awaited<ReturnType<typeof rpcClient.protocols.draft>>;

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
  moveScreenUp: {
    id: 'studio.editor.moveScreenUp',
    defaultMessage: 'Move {name} up',
    description:
      'Accessible name of the control that moves an interview screen one place earlier; {name} is the screen name.',
  },
  moveScreenDown: {
    id: 'studio.editor.moveScreenDown',
    defaultMessage: 'Move {name} down',
    description:
      'Accessible name of the control that moves an interview screen one place later; {name} is the screen name.',
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
      'Heading of the panel showing access, change, and validation detail for the selected screen.',
  },
  selectScreen: {
    id: 'studio.editor.selectScreen',
    defaultMessage: 'Select a screen to see access and change details.',
    description:
      'Shown in the inspector while no interview screen is selected.',
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
  openingScreen: {
    id: 'studio.editor.openingScreen',
    defaultMessage: 'Opening screen…',
    description:
      'Shown on the editing canvas while the selected interview screen is being opened.',
  },
  screenTypeSummary: {
    id: 'studio.editor.screenTypeSummary',
    defaultMessage: '{type} screen',
    description:
      'Supporting line naming the kind of interview screen being edited; {type} is the screen type recorded in the protocol.',
  },
  interviewScreen: {
    id: 'studio.editor.interviewScreen',
    defaultMessage: 'Interview screen',
    description:
      'Supporting line used when the screen being edited carries no recognisable type.',
  },
  readOnlyScreen: {
    id: 'studio.editor.readOnlyScreen',
    defaultMessage:
      'This screen is read-only while another editor holds its lock.',
    description:
      'Shown when somebody else is editing the screen, so this researcher can only read it.',
  },
  addingScreen: {
    id: 'studio.editor.addingScreen',
    defaultMessage: 'Adding a new screen…',
    description: 'Status shown while a new interview screen is being created.',
  },
  saveFailed: {
    id: 'studio.editor.saveFailed',
    defaultMessage:
      'This screen could not be saved. Wait a moment and try again.',
    description: 'Form error shown when saving an interview screen failed.',
  },
  saveScreen: {
    id: 'studio.editor.saveScreen',
    defaultMessage: 'Save screen',
    description: "Submit button of the interview screen's form.",
  },
  screenName: {
    id: 'studio.editor.screenName',
    defaultMessage: 'Screen name',
    description:
      'Label of the field naming an interview screen for the researcher, in the outline.',
  },
  pageHeading: {
    id: 'studio.editor.pageHeading',
    defaultMessage: 'Page heading',
    description:
      'Label of the field holding the heading a participant sees on this interview screen.',
  },
  access: {
    id: 'studio.editor.access',
    defaultMessage: 'Access',
    description:
      'Inspector term for whether this researcher may currently change the screen.',
  },
  accessEditing: {
    id: 'studio.editor.accessEditing',
    defaultMessage: 'Editing',
    description:
      'Inspector value shown when this researcher holds the screen lock and may change it.',
  },
  accessReadOnly: {
    id: 'studio.editor.accessReadOnly',
    defaultMessage: 'Read-only',
    description:
      'Inspector value shown when this researcher may read the screen but not change it.',
  },
  changes: {
    id: 'studio.editor.changes',
    defaultMessage: 'Changes',
    description:
      'Inspector term for whether the screen has changes still being saved.',
  },
  changesSaved: {
    id: 'studio.editor.changesSaved',
    defaultMessage: 'Saved',
    description:
      'Inspector value shown when every change to the screen has been saved.',
  },
  changesPending: {
    id: 'studio.editor.changesPending',
    defaultMessage: '{count, plural, one {# pending} other {# pending}}',
    description:
      'Inspector value counting the changes to the screen that are still being saved.',
  },
  changeHistory: {
    id: 'studio.editor.changeHistory',
    defaultMessage: 'Change history',
    description: 'Accessible name of the group holding Undo and Redo.',
  },
  undo: {
    id: 'studio.editor.undo',
    defaultMessage: 'Undo',
    description: 'Button that reverses the last saved change to the screen.',
  },
  redo: {
    id: 'studio.editor.redo',
    defaultMessage: 'Redo',
    description: 'Button that reapplies the change Undo reversed.',
  },
  historyDisabled: {
    id: 'studio.editor.historyDisabled',
    defaultMessage: 'Save or discard your screen changes to use Undo and Redo.',
    description:
      'Explains why Undo and Redo are unavailable while the screen form holds unsaved values.',
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

function stageOrder(sections: Readonly<Record<string, SectionDoc>>): string[] {
  const value = sections[sectionId({ kind: 'stageOrder' })]?.stages;
  return Array.isArray(value) &&
    value.every((entry) => typeof entry === 'string')
    ? value
    : [];
}

function stageLabel(
  intl: IntlShape,
  document: SectionDoc | undefined,
  index: number,
): string {
  return typeof document?.label === 'string' && document.label.trim() !== ''
    ? document.label
    : intl.formatMessage(messages.defaultScreenName, { number: index + 1 });
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
  const study = useQuery(orpc.studies.get.queryOptions({ input: { studyId } }));

  if (study.isPending) return { status: 'pending' };
  if (study.isError) {
    return {
      status:
        study.error instanceof ORPCError && study.error.code === 'FORBIDDEN'
          ? 'unreachable'
          : 'unavailable',
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

function ProtocolEditor({ address }: { address: DraftAddress }) {
  const intl = useAppIntl();
  const params = address;
  const { confirm } = useDialog();
  const queryClient = useQueryClient();
  const [selection, setSelection] = useState<Selection>({ kind: 'settings' });
  const [stageFormDirty, setStageFormDirty] = useState(false);
  const [reconcilingAdd, setReconcilingAdd] = useState(false);
  const [addRecoveryFailed, setAddRecoveryFailed] = useState(false);
  const [reconcilingMove, setReconcilingMove] = useState(false);
  const [moveRecoveryFailed, setMoveRecoveryFailed] = useState(false);
  const selectionInitialized = useRef(false);
  const discardRequestPending = useRef(false);
  const draft = useQuery(orpc.protocols.draft.queryOptions({ input: params }));
  const draftQueryKey = useMemo(
    () =>
      orpc.protocols.draft.key({
        input: {
          teamId: params.teamId,
          protocolId: params.protocolId,
          draftId: params.draftId,
        },
      }),
    [params.draftId, params.protocolId, params.teamId],
  );
  const stages = useMemo(
    () => (draft.data ? stageOrder(draft.data.sections) : []),
    [draft.data],
  );
  const draftValidation = useDraftValidation(draft.data?.sections);

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
    [confirm, intl],
  );

  const requestSelection = useCallback(
    async (nextSelection: Selection) => {
      const unchanged =
        nextSelection.kind === selection.kind &&
        (nextSelection.kind !== 'stage' ||
          (selection.kind === 'stage' &&
            nextSelection.stageId === selection.stageId));
      if (unchanged) return;

      if (
        stageFormDirty &&
        !(await confirmDiscardStageChanges(messages.discardForSection))
      ) {
        return;
      }

      setSelection(nextSelection);
    },
    [confirmDiscardStageChanges, selection, stageFormDirty],
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

  useEffect(() => {
    if (draft.data && !selectionInitialized.current) {
      selectionInitialized.current = true;
      const firstStage = stages[0];
      if (firstStage !== undefined) {
        setSelection({ kind: 'stage', stageId: firstStage });
      }
    }
  }, [draft.data, stages]);

  const refreshDraft = useCallback(async () => {
    await queryClient.invalidateQueries(
      {
        queryKey: draftQueryKey,
      },
      { throwOnError: true },
    );
  }, [draftQueryKey, queryClient]);

  const publishAuthoritativeDraft = useCallback(
    (refreshed: Draft) => {
      queryClient.setQueryData<Draft>(draftQueryKey, (current) => {
        if (
          current !== undefined &&
          BigInt(current.revision.sequence) >
            BigInt(refreshed.revision.sequence)
        ) {
          return current;
        }
        return refreshed;
      });
    },
    [draftQueryKey, queryClient],
  );

  const selectedStageId = selection.kind === 'stage' ? selection.stageId : null;
  const session = useStudioStageSession({
    ...params,
    stageId: selectedStageId,
    draft: draft.data ?? {
      protocol: {
        id: params.protocolId,
        draftId: params.draftId,
        name: '',
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
      revision: { sequence: '0', hash: 'unavailable' },
      sections: {},
    },
    onCommitted: refreshDraft,
    onAuthoritativeDraft: publishAuthoritativeDraft,
  });

  const addStage = useMutation({
    mutationFn: async () => {
      const stageId = createUuid();
      await rpcClient.protocols.addInformationStage({ ...params, stageId });
      return stageId;
    },
    onSuccess: async (stageId) => {
      await refreshDraft();
      // Dirty changes were confirmed before the server mutation. Selecting
      // directly avoids asking again after the new screen already exists.
      setSelection({ kind: 'stage', stageId });
    },
  });
  const moveStage = useMutation({
    mutationFn: async (input: { stageId: string; toIndex: number }) =>
      rpcClient.protocols.moveStage({
        ...params,
        ...input,
        expectedRevision: draft.data?.revision.sequence ?? '0',
      }),
    onSuccess: refreshDraft,
  });

  const reconcileAddStage = async () => {
    setReconcilingAdd(true);
    setAddRecoveryFailed(false);
    try {
      await refreshDraft();
      addStage.reset();
    } catch {
      setAddRecoveryFailed(true);
    } finally {
      setReconcilingAdd(false);
    }
  };

  const reconcileMoveStage = async () => {
    setReconcilingMove(true);
    setMoveRecoveryFailed(false);
    try {
      await refreshDraft();
      moveStage.reset();
    } catch {
      setMoveRecoveryFailed(true);
    } finally {
      setReconcilingMove(false);
    }
  };

  const requestAddStage = async () => {
    if (
      stageFormDirty &&
      !(await confirmDiscardStageChanges(messages.discardForNewScreen))
    ) {
      return;
    }

    addStage.mutate();
  };

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

  const selectedStage =
    selectedStageId === null
      ? undefined
      : draft.data.sections[
          sectionId({ kind: 'stage', stageId: selectedStageId })
        ];
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
            {draft.data.protocol.name}
          </Heading>
          <Paragraph className="text-sm" margin="none">
            {intl.formatMessage(messages.draftEditor)}
          </Paragraph>
        </div>
        <ValidationStatusButton
          sessionState={session}
          draftValidation={draftValidation}
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
              aria-label={intl.formatMessage(messages.protocolSections)}
              className="min-h-0 overflow-y-auto"
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
                      size="sm"
                      variant="text"
                      icon={<Plus aria-hidden="true" />}
                      disabled={
                        addStage.isPending || addStage.isError || reconcilingAdd
                      }
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
                        variant="outline"
                        disabled={reconcilingAdd}
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
                        variant="outline"
                        disabled={reconcilingMove}
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
                  {stages.length === 0 ? (
                    <Paragraph className="px-2 text-sm">
                      {intl.formatMessage(messages.noScreens)}
                    </Paragraph>
                  ) : (
                    <ol className="m-0 flex list-none flex-col gap-2 p-0 ps-3">
                      {stages.map((stageId, index) => {
                        const stage =
                          draft.data.sections[
                            sectionId({ kind: 'stage', stageId })
                          ];
                        return (
                          <li
                            key={stageId}
                            className="flex min-w-0 items-center gap-1"
                          >
                            <button
                              type="button"
                              className="focusable aria-current:bg-selected aria-current:text-selected-contrast min-w-0 flex-1 rounded px-3 py-2 text-start"
                              aria-current={
                                selectedStageId === stageId ? 'page' : undefined
                              }
                              onClick={() =>
                                void requestSelection({
                                  kind: 'stage',
                                  stageId,
                                })
                              }
                            >
                              <span className="block truncate">
                                {stageLabel(intl, stage, index)}
                              </span>
                              <span className="block truncate text-xs opacity-70">
                                {typeof stage?.type === 'string'
                                  ? stage.type
                                  : intl.formatMessage(
                                      messages.unknownScreenType,
                                    )}
                              </span>
                            </button>
                            <div className="flex shrink-0 flex-col">
                              <button
                                type="button"
                                className="focusable rounded p-1 disabled:opacity-30"
                                aria-label={intl.formatMessage(
                                  messages.moveScreenUp,
                                  { name: stageLabel(intl, stage, index) },
                                )}
                                disabled={
                                  index === 0 ||
                                  moveStage.isPending ||
                                  moveStage.isError ||
                                  reconcilingMove
                                }
                                onClick={() =>
                                  moveStage.mutate({
                                    stageId,
                                    toIndex: index - 1,
                                  })
                                }
                              >
                                <ArrowUp aria-hidden="true" size={16} />
                              </button>
                              <button
                                type="button"
                                className="focusable rounded p-1 disabled:opacity-30"
                                aria-label={intl.formatMessage(
                                  messages.moveScreenDown,
                                  { name: stageLabel(intl, stage, index) },
                                )}
                                disabled={
                                  index === stages.length - 1 ||
                                  moveStage.isPending ||
                                  moveStage.isError ||
                                  reconcilingMove
                                }
                                onClick={() =>
                                  moveStage.mutate({
                                    stageId,
                                    toIndex: index + 1,
                                  })
                                }
                              >
                                <ArrowDown aria-hidden="true" size={16} />
                              </button>
                            </div>
                          </li>
                        );
                      })}
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

        <div className="min-h-[24rem]">
          <Surface className="h-full" spacing="lg">
            {selection.kind === 'stage' ? (
              <StageCanvas
                sessionState={session}
                stage={selectedStage}
                addingStage={addStage.isPending}
                onDirtyChange={setStageFormDirty}
                heading={stageLabel(
                  intl,
                  selectedStage,
                  stages.indexOf(selection.stageId),
                )}
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
            {session.status === 'ready' && selection.kind === 'stage' ? (
              <Inspector
                session={session.session}
                message={session.message}
                formDirty={stageFormDirty}
              />
            ) : (
              <>
                <Paragraph>
                  {intl.formatMessage(messages.selectScreen)}
                </Paragraph>
                <ProtocolProblems validation={draftValidation} />
              </>
            )}
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

function ValidationStatusButton(props: {
  sessionState: ReturnType<typeof useStudioStageSession>;
  draftValidation: DraftValidation;
}) {
  if (props.sessionState.status !== 'ready') {
    return <ValidationButton validation={props.draftValidation} />;
  }
  return <ConnectedValidationStatus session={props.sessionState.session} />;
}

function ConnectedValidationStatus(props: { session: ProtocolBuilderSession }) {
  const { snapshot } = useStageEditorController(
    props.session,
    'validation-status',
  );
  return <ValidationButton validation={snapshot.validation} />;
}

function ValidationButton(props: { validation: DraftValidation }) {
  const intl = useAppIntl();
  const { validation } = props;
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => document.getElementById('protocol-problems')?.focus()}
    >
      {validation.status === 'invalid'
        ? intl.formatMessage(messages.validationProblems, {
            count: validation.issues.length,
          })
        : intl.formatMessage(
            validation.status === 'valid'
              ? messages.protocolValid
              : messages.checkingProtocol,
          )}
    </Button>
  );
}

function useDraftValidation(
  sections: Readonly<Record<string, SectionDoc>> | undefined,
): DraftValidation {
  const intl = useAppIntl();
  const [validation, setValidation] = useState<DraftValidation>({
    status: 'pending',
    issues: [],
  });

  useEffect(() => {
    let active = true;
    if (sections === undefined) {
      setValidation({ status: 'pending', issues: [] });
      return () => {
        active = false;
      };
    }

    setValidation({ status: 'pending', issues: [] });
    void (async () => {
      try {
        const result = await CurrentProtocolSchema.safeParseAsync(
          assembleProtocolSections(sections),
        );
        if (!active) return;
        setValidation(
          result.success
            ? { status: 'valid', issues: [] }
            : {
                status: 'invalid',
                issues: result.error.issues.map(toDraftValidationIssue),
              },
        );
      } catch (error) {
        if (!active) return;
        setValidation({
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
  }, [intl, sections]);

  return validation;
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

function StageCanvas(props: {
  sessionState: ReturnType<typeof useStudioStageSession>;
  stage: SectionDoc | undefined;
  heading: string;
  addingStage: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const intl = useAppIntl();

  useEffect(() => {
    if (props.sessionState.status !== 'ready') props.onDirtyChange(false);
  }, [props.onDirtyChange, props.sessionState.status]);

  if (props.sessionState.status === 'loading') {
    return (
      <div className="flex items-center gap-3">
        <Spinner size="sm" />
        <Paragraph>{intl.formatMessage(messages.openingScreen)}</Paragraph>
      </div>
    );
  }
  if (props.sessionState.status === 'failed') {
    return (
      <Alert variant="destructive">
        {intl.formatMessage(props.sessionState.message)}
      </Alert>
    );
  }
  return (
    <StageForm
      key={props.sessionState.session.getSnapshot().editedSection.sectionId}
      session={props.sessionState.session}
      save={props.sessionState.save}
      stage={props.stage}
      heading={props.heading}
      addingStage={props.addingStage}
      onDirtyChange={props.onDirtyChange}
    />
  );
}

function StageForm(props: {
  session: ProtocolBuilderSession;
  save: () => Promise<void>;
  stage: SectionDoc | undefined;
  heading: string;
  addingStage: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const intl = useAppIntl();
  const controller = useStageEditorController(props.session);
  const { fields } = controller.snapshot.editedSection;
  const readOnly = controller.snapshot.access.mode === 'readOnly';
  const hasTitle = typeof fields.title === 'string';
  const label = typeof fields.label === 'string' ? fields.label : '';
  const title = typeof fields.title === 'string' ? fields.title : '';
  const baseline = useRef({ label, title });
  const [baselineVersion, setBaselineVersion] = useState(0);
  const labelInput = useRef<HTMLInputElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef<'label' | 'title' | 'save' | null>(null);

  useEffect(() => {
    if (controller.snapshot.pendingCommands.length !== 0) return;
    if (baseline.current.label === label && baseline.current.title === title) {
      return;
    }

    baseline.current = { label, title };
    setBaselineVersion((version) => version + 1);
  }, [controller.snapshot.pendingCommands.length, label, title]);

  useLayoutEffect(() => {
    const target = restoreFocus.current;
    if (target === null) return;
    restoreFocus.current = null;
    const controls = {
      label: labelInput,
      title: titleInput,
      save: saveButton,
    };
    controls[target].current?.focus();
  }, [baselineVersion]);

  return (
    <>
      <Heading level="h2">{props.heading}</Heading>
      <Paragraph className="text-sm">
        {typeof props.stage?.type === 'string'
          ? intl.formatMessage(messages.screenTypeSummary, {
              type: props.stage.type,
            })
          : intl.formatMessage(messages.interviewScreen)}
      </Paragraph>
      {readOnly && <Alert>{intl.formatMessage(messages.readOnlyScreen)}</Alert>}
      {props.addingStage && (
        <Paragraph role="status">
          {intl.formatMessage(messages.addingScreen)}
        </Paragraph>
      )}
      <Form
        key={baselineVersion}
        className="mt-6"
        aria-busy={props.addingStage}
        onSubmit={async (values) => {
          const submittedLabel =
            typeof values.label === 'string' ? values.label : '';
          const submittedTitle =
            typeof values.title === 'string' ? values.title : '';
          const hasChanges =
            submittedLabel !== baseline.current.label ||
            (hasTitle && submittedTitle !== baseline.current.title);
          const activeElement = document.activeElement;
          restoreFocus.current = hasChanges
            ? activeElement === labelInput.current
              ? 'label'
              : activeElement === titleInput.current
                ? 'title'
                : activeElement === saveButton.current
                  ? 'save'
                  : null
            : null;
          // Merged into the draft the session holds at submit time, not into
          // the one this render captured: a change acknowledged while the form
          // was open must survive being saved over.
          controller.changeFields((current) => ({
            ...current,
            label: submittedLabel,
            ...(hasTitle ? { title: submittedTitle } : {}),
          }));
          try {
            await props.save();
            return { success: true };
          } catch {
            restoreFocus.current = null;
            return {
              success: false,
              formErrors: [intl.formatMessage(messages.saveFailed)],
            };
          }
        }}
      >
        <StageFormDirtyObserver onDirtyChange={props.onDirtyChange} />
        <StageFormFields
          fields={fields}
          baseline={baseline.current}
          disabled={readOnly || props.addingStage}
          labelInput={labelInput}
          titleInput={titleInput}
        />
        <SubmitButton ref={saveButton} disabled={readOnly || props.addingStage}>
          {intl.formatMessage(messages.saveScreen)}
        </SubmitButton>
      </Form>
    </>
  );
}

function StageFormDirtyObserver(props: {
  onDirtyChange: (dirty: boolean) => void;
}) {
  const dirty = useFormStore(selectIsFormDirty);

  useLayoutEffect(() => {
    props.onDirtyChange(dirty);
    return () => props.onDirtyChange(false);
  }, [dirty, props.onDirtyChange]);

  return null;
}

function StageFormFields(props: {
  fields: Readonly<Record<string, unknown>>;
  baseline: Readonly<{ label: string; title: string }>;
  disabled: boolean;
  labelInput: RefObject<HTMLInputElement | null>;
  titleInput: RefObject<HTMLInputElement | null>;
}) {
  const intl = useAppIntl();
  const label =
    typeof props.fields.label === 'string' ? props.fields.label : '';
  const title =
    typeof props.fields.title === 'string' ? props.fields.title : '';
  const hasTitle = typeof props.fields.title === 'string';
  const setFieldValue = useFormStore((store) => store.setFieldValue);
  const previous = useRef({ label, title });

  useEffect(() => {
    if (previous.current.label !== label) setFieldValue('label', label);
    if (hasTitle && previous.current.title !== title) {
      setFieldValue('title', title);
    }
    previous.current = { label, title };
  }, [hasTitle, label, setFieldValue, title]);

  return (
    <>
      <Field
        name="label"
        label={intl.formatMessage(messages.screenName)}
        component={InputField}
        ref={props.labelInput}
        initialValue={props.baseline.label}
        required
        disabled={props.disabled}
      />
      {hasTitle && (
        <Field
          name="title"
          label={intl.formatMessage(messages.pageHeading)}
          component={InputField}
          ref={props.titleInput}
          initialValue={props.baseline.title}
          required
          disabled={props.disabled}
        />
      )}
    </>
  );
}

function Inspector(props: {
  session: ProtocolBuilderSession;
  message: MessageDescriptor;
  formDirty: boolean;
}) {
  const intl = useAppIntl();
  const controller = useStageEditorController(
    props.session,
    'inspector-actions',
  );
  const snapshot = controller.snapshot;
  return (
    <div className="flex flex-col gap-4">
      <Paragraph role="status" className="text-sm">
        {intl.formatMessage(props.message)}
      </Paragraph>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
        <dt className="font-bold">{intl.formatMessage(messages.access)}</dt>
        <dd>
          {intl.formatMessage(
            snapshot.access.mode === 'editable'
              ? messages.accessEditing
              : messages.accessReadOnly,
          )}
        </dd>
        <dt className="font-bold">{intl.formatMessage(messages.changes)}</dt>
        <dd>
          {snapshot.pendingCommands.length === 0
            ? intl.formatMessage(messages.changesSaved)
            : intl.formatMessage(messages.changesPending, {
                count: snapshot.pendingCommands.length,
              })}
        </dd>
      </dl>
      <div
        className="flex flex-wrap gap-2"
        aria-label={intl.formatMessage(messages.changeHistory)}
      >
        <Button
          size="sm"
          variant="outline"
          aria-describedby={
            props.formDirty ? 'history-disabled-reason' : undefined
          }
          disabled={
            props.formDirty ||
            !snapshot.history.canUndo ||
            snapshot.access.mode !== 'editable'
          }
          onClick={controller.undo}
        >
          {intl.formatMessage(messages.undo)}
        </Button>
        <Button
          size="sm"
          variant="outline"
          aria-describedby={
            props.formDirty ? 'history-disabled-reason' : undefined
          }
          disabled={
            props.formDirty ||
            !snapshot.history.canRedo ||
            snapshot.access.mode !== 'editable'
          }
          onClick={controller.redo}
        >
          {intl.formatMessage(messages.redo)}
        </Button>
      </div>
      {props.formDirty && (
        <Paragraph id="history-disabled-reason" className="text-sm">
          {intl.formatMessage(messages.historyDisabled)}
        </Paragraph>
      )}
      <ProtocolProblems validation={snapshot.validation} />
    </div>
  );
}

function ProtocolProblems(props: { validation: DraftValidation }) {
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
      {props.validation.status === 'valid' && (
        <Paragraph>
          {intl.formatMessage(messages.noValidationProblems)}
        </Paragraph>
      )}
      {props.validation.status === 'invalid' && (
        <ul className="list-disc space-y-2 ps-5">
          {props.validation.issues.map((issue, index) => (
            <li key={`${issue.path.join('.')}-${index}`}>{issue.message}</li>
          ))}
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
      <Heading level="h2">{intl.formatMessage(content.heading)}</Heading>
      <Paragraph>{intl.formatMessage(content.body)}</Paragraph>
    </>
  );
}
