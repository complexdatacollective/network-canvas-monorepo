import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
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
import { authClient } from '../lib/auth.ts';
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

/** One study as its team's list reports it. */
type Study = Awaited<ReturnType<typeof rpcClient.protocols.list>>[number];

/**
 * Which team owns the study in the URL, as far as this researcher can see.
 *
 * Four answers rather than two, because "not yet" and "not found" and "could
 * not ask" are different things to put on screen, and collapsing any pair of
 * them is what leaves a researcher on a spinner that will never resolve.
 */
type StudyOwner =
  | { status: 'pending' }
  | { status: 'unavailable' }
  | { status: 'notFound' }
  | { status: 'found'; teamId: string; study: Study };

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

function stageOrder(sections: Readonly<Record<string, SectionDoc>>): string[] {
  const value = sections[sectionId({ kind: 'stageOrder' })]?.stages;
  return Array.isArray(value) &&
    value.every((entry) => typeof entry === 'string')
    ? value
    : [];
}

function stageLabel(document: SectionDoc | undefined, index: number): string {
  return typeof document?.label === 'string' && document.label.trim() !== ''
    ? document.label
    : `Screen ${index + 1}`;
}

/**
 * Which team owns `studyId`, resolved from the study id itself rather than
 * from whichever team the researcher was last acting in.
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
 * **One question, asked of the teams the researcher has.** `study.shell` (§6.3)
 * is the procedure that answers "which team owns this study?" in one request,
 * and it is the one server surface this slice may not add. What the client can
 * do without it is ask each team it belongs to for its own studies, which is a
 * procedure that already exists and is already authorized per team. The cost
 * is kept to the ordinary case's one request: the active team is asked first
 * and alone, because arriving from a team's studies list has already cached
 * exactly that answer, and the rest are asked only when it does not have the
 * study. When `study.shell` lands this whole hook becomes one query, and
 * nothing above it changes.
 *
 * A team list that could not be read, or a studies list that could not be
 * read, is `unavailable` and never `notFound`: "no team of yours has this
 * study" is a claim about the researcher's access, and an outage is no basis
 * for making it.
 */
function useStudyOwner(studyId: string): StudyOwner {
  const teams = authClient.useListOrganizations();
  const activeTeamId = authClient.useActiveOrganization().data?.id;

  const activeList = useQuery({
    ...orpc.protocols.list.queryOptions({
      input: { teamId: activeTeamId ?? '' },
    }),
    enabled: activeTeamId !== undefined,
  });
  const activeStudy = activeList.data?.find(
    (candidate) => candidate.id === studyId,
  );
  // A disabled query is `pending` for ever, so "has the active team answered?"
  // cannot be read off the status alone — with no active team there was
  // nothing to ask and the answer is immediate.
  const activeAnswered =
    activeTeamId === undefined || activeList.status !== 'pending';

  const otherTeamIds =
    activeStudy !== undefined || !activeAnswered
      ? []
      : (teams.data ?? [])
          .map((team) => team.id)
          .filter((id) => id !== activeTeamId);
  const otherLists = useQueries({
    queries: otherTeamIds.map((teamId) =>
      orpc.protocols.list.queryOptions({ input: { teamId } }),
    ),
  });

  if (activeStudy !== undefined && activeTeamId !== undefined) {
    return { status: 'found', teamId: activeTeamId, study: activeStudy };
  }
  if (!activeAnswered || teams.isPending) return { status: 'pending' };

  const ownerIndex = otherLists.findIndex((list) =>
    list.data?.some((candidate) => candidate.id === studyId),
  );
  const owner = otherTeamIds[ownerIndex];
  const study = otherLists[ownerIndex]?.data?.find(
    (candidate) => candidate.id === studyId,
  );
  if (owner !== undefined && study !== undefined) {
    return { status: 'found', teamId: owner, study };
  }

  if (otherLists.some((list) => list.isPending)) return { status: 'pending' };
  if (
    activeList.isError ||
    otherLists.some((list) => list.isError) ||
    // Better Auth reports a refused list by storing an error and leaving
    // `data` null, so an unreadable team list is an empty one here — and
    // concluding "not found" from a list of teams nobody could read is the
    // same lie in a different place.
    (teams.error !== null && teams.data === null)
  ) {
    return { status: 'unavailable' };
  }
  return { status: 'notFound' };
}

/**
 * The protocol editor, at `/study/$studyId/editor` (§5.2, #1272).
 *
 * **Resolving the draft from the study id.** The editing procedures are
 * addressed by `{ teamId, protocolId, draftId }` and the URL carries only
 * `$studyId`, which addresses the protocol until #1262 lands the studies
 * model. Both missing halves come from procedures that already exist, so no
 * new server surface was written for the move:
 *
 * - the team is the one that owns the study, resolved by `useStudyOwner` above
 *   from the study id the URL carries.
 * - the current draft is `protocols.list`'s own `draftId` for this protocol,
 *   which arrives with the same answer.
 *
 * A study no team of this researcher's has, and a study with no editable
 * draft, are the two answers that leave nothing to open, and each says which
 * it is.
 */
export default function Editor() {
  const { studyId } = route.useParams();
  const owner = useStudyOwner(studyId);

  if (owner.status === 'pending') {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
        <span className="sr-only">Opening protocol editor…</span>
      </div>
    );
  }

  if (owner.status === 'unavailable') {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          This study could not be opened. Reload the page and try again.
        </Alert>
      </div>
    );
  }

  if (owner.status === 'notFound' || owner.study.draftId === null) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          {owner.status === 'notFound'
            ? 'This study is not in any of your teams. Ask whoever sent you the link to invite you to the team that owns it.'
            : 'This study has no editable draft.'}
        </Alert>
      </div>
    );
  }

  return (
    <ProtocolEditor
      address={{
        teamId: owner.teamId,
        protocolId: studyId,
        draftId: owner.study.draftId,
      }}
    />
  );
}

function ProtocolEditor({ address }: { address: DraftAddress }) {
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
    async (description: string) => {
      if (discardRequestPending.current) return false;

      discardRequestPending.current = true;
      try {
        const result = await confirm({
          title: 'Discard unsaved screen changes?',
          description,
          confirmLabel: 'Discard changes',
          cancelLabel: 'Keep editing',
          intent: 'destructive',
          onConfirm: () => undefined,
        });
        return result === true;
      } finally {
        discardRequestPending.current = false;
      }
    },
    [confirm],
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
        !(await confirmDiscardStageChanges(
          'The values in this screen have not been saved. Discard them and open another section?',
        ))
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
      'The values in this screen have not been saved. Discard them and leave the protocol editor?',
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
      !(await confirmDiscardStageChanges(
        'The values in this screen have not been saved. Discard them and add a new screen?',
      ))
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
        <span className="sr-only">Opening protocol editor…</span>
      </div>
    );
  }
  if (!draft.data) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          This protocol draft could not be opened. Return to protocols and try
          again.
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
            Draft editor
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
              Protocol sections
            </Heading>
            <nav
              aria-label="Protocol sections"
              className="min-h-0 overflow-y-auto"
            >
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                <OutlineButton
                  selected={selection.kind === 'settings'}
                  onClick={() => void requestSelection({ kind: 'settings' })}
                >
                  Settings
                </OutlineButton>
                <li>
                  <div className="flex items-center justify-between gap-2 px-2 py-1">
                    <span className="font-heading font-bold">Screens</span>
                    <Button
                      size="sm"
                      variant="text"
                      icon={<Plus aria-hidden="true" />}
                      disabled={
                        addStage.isPending || addStage.isError || reconcilingAdd
                      }
                      onClick={() => void requestAddStage()}
                    >
                      Add
                    </Button>
                  </div>
                  {addStage.isError && (
                    <Alert className="mb-2" variant="destructive">
                      <Paragraph margin="none">
                        Studio could not confirm whether the screen was added.
                        Refresh the outline before trying again.
                      </Paragraph>
                      <Button
                        className="mt-3"
                        size="sm"
                        variant="outline"
                        disabled={reconcilingAdd}
                        onClick={() => void reconcileAddStage()}
                      >
                        Refresh outline
                      </Button>
                      {addRecoveryFailed && (
                        <Paragraph className="mt-2" margin="none">
                          The outline could not be refreshed. Reload this editor
                          before adding another screen.
                        </Paragraph>
                      )}
                    </Alert>
                  )}
                  {moveStage.isError && (
                    <Alert className="mb-2" variant="destructive">
                      <Paragraph margin="none">
                        Studio could not confirm the new screen order. Refresh
                        the outline before moving another screen.
                      </Paragraph>
                      <Button
                        className="mt-3"
                        size="sm"
                        variant="outline"
                        disabled={reconcilingMove}
                        onClick={() => void reconcileMoveStage()}
                      >
                        Refresh order
                      </Button>
                      {moveRecoveryFailed && (
                        <Paragraph className="mt-2" margin="none">
                          The outline could not be refreshed. Reload this editor
                          before moving another screen.
                        </Paragraph>
                      )}
                    </Alert>
                  )}
                  {stages.length === 0 ? (
                    <Paragraph className="px-2 text-sm">
                      Add a screen to begin the interview flow.
                    </Paragraph>
                  ) : (
                    <ol className="m-0 flex list-none flex-col gap-2 p-0 pl-3">
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
                              className="focusable aria-current:bg-selected aria-current:text-selected-contrast min-w-0 flex-1 rounded px-3 py-2 text-left"
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
                                {stageLabel(stage, index)}
                              </span>
                              <span className="block truncate text-xs opacity-70">
                                {typeof stage?.type === 'string'
                                  ? stage.type
                                  : 'Unknown screen'}
                              </span>
                            </button>
                            <div className="flex shrink-0 flex-col">
                              <button
                                type="button"
                                className="focusable rounded p-1 disabled:opacity-30"
                                aria-label={`Move ${stageLabel(stage, index)} up`}
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
                                aria-label={`Move ${stageLabel(stage, index)} down`}
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
                  Codebook
                </OutlineButton>
                <OutlineButton
                  selected={selection.kind === 'assets'}
                  onClick={() => void requestSelection({ kind: 'assets' })}
                >
                  Assets
                </OutlineButton>
                <OutlineButton
                  selected={selection.kind === 'translations'}
                  onClick={() =>
                    void requestSelection({ kind: 'translations' })
                  }
                >
                  Translations
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
              Inspector
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
                  Select a screen to see access and change details.
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
        className="focusable aria-current:bg-selected aria-current:text-selected-contrast w-full rounded px-3 py-2 text-left"
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
  const { validation } = props;
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => document.getElementById('protocol-problems')?.focus()}
    >
      {validation.status === 'invalid'
        ? `${validation.issues.length} validation ${validation.issues.length === 1 ? 'problem' : 'problems'}`
        : validation.status === 'valid'
          ? 'Protocol valid'
          : 'Checking protocol'}
    </Button>
  );
}

function useDraftValidation(
  sections: Readonly<Record<string, SectionDoc>> | undefined,
): DraftValidation {
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
                  : 'The protocol document could not be assembled.',
            },
          ],
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [sections]);

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
  useEffect(() => {
    if (props.sessionState.status !== 'ready') props.onDirtyChange(false);
  }, [props.onDirtyChange, props.sessionState.status]);

  if (props.sessionState.status === 'loading') {
    return (
      <div className="flex items-center gap-3">
        <Spinner size="sm" />
        <Paragraph>Opening screen…</Paragraph>
      </div>
    );
  }
  if (props.sessionState.status === 'failed') {
    return <Alert variant="destructive">{props.sessionState.message}</Alert>;
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
          ? `${props.stage.type} screen`
          : 'Interview screen'}
      </Paragraph>
      {readOnly && (
        <Alert>
          This screen is read-only while another editor holds its lock.
        </Alert>
      )}
      {props.addingStage && (
        <Paragraph role="status">Adding a new screen…</Paragraph>
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
              formErrors: [
                'This screen could not be saved. Wait a moment and try again.',
              ],
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
          Save screen
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
        label="Screen name"
        component={InputField}
        ref={props.labelInput}
        initialValue={props.baseline.label}
        required
        disabled={props.disabled}
      />
      {hasTitle && (
        <Field
          name="title"
          label="Page heading"
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
  message: string;
  formDirty: boolean;
}) {
  const controller = useStageEditorController(
    props.session,
    'inspector-actions',
  );
  const snapshot = controller.snapshot;
  return (
    <div className="flex flex-col gap-4">
      <Paragraph role="status" className="text-sm">
        {props.message}
      </Paragraph>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
        <dt className="font-bold">Access</dt>
        <dd>{snapshot.access.mode === 'editable' ? 'Editing' : 'Read-only'}</dd>
        <dt className="font-bold">Changes</dt>
        <dd>
          {snapshot.pendingCommands.length === 0
            ? 'Saved'
            : `${snapshot.pendingCommands.length} pending`}
        </dd>
      </dl>
      <div className="flex flex-wrap gap-2" aria-label="Change history">
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
          Undo
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
          Redo
        </Button>
      </div>
      {props.formDirty && (
        <Paragraph id="history-disabled-reason" className="text-sm">
          Save or discard your screen changes to use Undo and Redo.
        </Paragraph>
      )}
      <ProtocolProblems validation={snapshot.validation} />
    </div>
  );
}

function ProtocolProblems(props: { validation: DraftValidation }) {
  return (
    <section aria-labelledby="validation-heading">
      <Heading id="validation-heading" level="h3">
        Validation
      </Heading>
      {props.validation.status === 'pending' && (
        <Paragraph>Checking this protocol…</Paragraph>
      )}
      {props.validation.status === 'valid' && (
        <Paragraph>No validation problems.</Paragraph>
      )}
      {props.validation.status === 'invalid' && (
        <ul className="list-disc space-y-2 pl-5">
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
  const content = {
    settings: {
      heading: 'Protocol settings',
      body: 'Protocol metadata editing will use this canvas.',
    },
    codebook: {
      heading: 'Codebook',
      body: 'People, connections, and participant variables will be managed here.',
    },
    assets: {
      heading: 'Assets',
      body: 'Images, audio, and video used by this protocol will be managed here.',
    },
    translations: {
      heading: 'Translations',
      body: 'Translated protocol content will be managed here.',
    },
  }[props.kind];
  return (
    <>
      <Heading level="h2">{content.heading}</Heading>
      <Paragraph>{content.body}</Paragraph>
    </>
  );
}
