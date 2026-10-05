'use client';

import { useContext, useEffect, useMemo, useRef, useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import { useAccessibilityAnnouncements } from '@codaco/fresco-ui/dnd/useAccessibilityAnnouncements';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { NcEdge, NcNode, VariableValue } from '@codaco/shared-consts';
import {
  entityAttributesProperty,
  isFamilyPedigreeStageMetadata,
} from '@codaco/shared-consts';

import { useTrack } from '../../analytics/useTrack';
import Prompts from '../../components/Prompts/Prompts';
import { useContractFlags } from '../../contract/context';
import useBeforeNext from '../../hooks/useBeforeNext';
import useReadyForNextStage from '../../hooks/useReadyForNextStage';
import { useStageSelector } from '../../hooks/useStageSelector';
import {
  getNetworkEdges,
  getNetworkNodes,
  getStageMetadata,
} from '../../selectors/session';
import { toggleNodeAttributes } from '../../store/modules/session';
import { useAppDispatch } from '../../store/store';
import type { StageProps } from '../../types';
import { buildPedigreeDialog } from './buildPedigreeDialog';
import PedigreeChecklist from './components/PedigreeChecklist';
import EgoCellWizard from './components/wizards/EgoCellWizard';
import { useFamilyPedigreeStore } from './FamilyPedigreeContext';
import { useFamilyPedigreeDialog } from './familyPedigreeDialog';
import { FamilyPedigreeProvider } from './FamilyPedigreeProvider';
import { messages } from './messages';
import FamilyPedigreePlaceholder from './pedigree-layout/components/FamilyPedigreePlaceholder';
import PedigreeView from './pedigree-layout/components/PedigreeView';
import { SuppressPedigreeHintContext } from './pedigreeHintContext';
import type { VariableConfig } from './store';
import {
  getEdgeTypeKey,
  getGameteRoleVariable,
  getIsActiveVariable,
  getIsGestationalCarrierVariable,
  getRelationshipTypeVariable,
} from './utils/edgeUtils';
import {
  getBiologicalSexVariable,
  getEgoVariable,
  getNodeLabelVariable,
  getNodeTypeKey,
  getRelationshipVariable,
} from './utils/nodeUtils';
import { pedigreeMemberIds } from './utils/pedigreeMembership';
import { getBoundaries } from './utils/stageConfig';
import {
  validatePedigreeCompleteness,
  type Boundaries,
} from './utils/validatePedigree';

// The interview network is a single shared graph, so getNetworkNodes/Edges
// return entities of every type. Restrict the nomination-phase override maps to
// the pedigree's own node/edge types, mirroring the provider seed
// (FamilyPedigreeProvider.tsx), so foreign-typed entities are never laid out as
// orphan pedigree members or coerced into pedigree relationships. When the
// pedigree recorded its private membership (memberIds), also drop same-typed
// alters nominated in later stages, which are not part of this pedigree.
export const buildOverrideNodesMap = (
  nodes: NcNode[],
  nodeType: string,
  memberIds: Set<string> | null = null,
) =>
  new Map<string, NcNode>(
    nodes
      .filter(
        (node) =>
          node.type === nodeType &&
          (memberIds === null || memberIds.has(node._uid)),
      )
      .map((node) => [node._uid, node]),
  );

export const buildOverrideEdgesMap = (edges: NcEdge[], edgeType: string) =>
  new Map<string, NcEdge>(
    edges
      .filter((edge) => edge.type === edgeType)
      .map((edge) => [edge._uid, edge]),
  );

const FamilyPedigree = (props: StageProps<'FamilyPedigree'>) => {
  const intl = useAppIntl();
  const {
    stage: { censusPrompt, nominationPrompts },
  } = props;

  const dispatch = useAppDispatch();
  const { confirm, openDialog } = useFamilyPedigreeDialog();
  const suppressHint = useContext(SuppressPedigreeHintContext);
  const { isDevelopment } = useContractFlags();
  const { moveForward } = props.getNavigationHelpers();
  const { updateReady } = useReadyForNextStage();
  const nodesMap = useFamilyPedigreeStore((s) => s.network.nodes);
  const edgesMap = useFamilyPedigreeStore((s) => s.network.edges);
  const addNode = useFamilyPedigreeStore((s) => s.addNode);
  const addEdge = useFamilyPedigreeStore((s) => s.addEdge);
  const updateNode = useFamilyPedigreeStore((s) => s.updateNode);
  const syncMetadata = useFamilyPedigreeStore((s) => s.syncMetadata);
  const clearNetwork = useFamilyPedigreeStore((s) => s.clearNetwork);
  const commitBatch = useFamilyPedigreeStore((s) => s.commitBatch);
  const finalizeNetwork = useFamilyPedigreeStore((s) => s.finalizeNetwork);
  const resetNetwork = useFamilyPedigreeStore((s) => s.resetNetwork);
  const setActiveNominationVariable = useFamilyPedigreeStore(
    (s) => s.setActiveNominationVariable,
  );

  const nodeType = useStageSelector(getNodeTypeKey);
  const edgeType = useStageSelector(getEdgeTypeKey);
  const nodeLabelVariable = useStageSelector(getNodeLabelVariable);
  const egoVariable = useStageSelector(getEgoVariable);
  const relationshipVariable = useStageSelector(getRelationshipVariable);
  const relationshipTypeVariable = useStageSelector(
    getRelationshipTypeVariable,
  );
  const isActiveVariable = useStageSelector(getIsActiveVariable);
  const isGestationalCarrierVariable = useStageSelector(
    getIsGestationalCarrierVariable,
  );
  const gameteRoleVariable = useStageSelector(getGameteRoleVariable);
  const biologicalSexVariable = useStageSelector(getBiologicalSexVariable);

  const allNodes = useStageSelector(getNetworkNodes);
  const allEdges = useStageSelector(getNetworkEdges);

  const stageMetadata = useStageSelector(getStageMetadata);
  const boundaries = useStageSelector(getBoundaries);

  const isNetworkCommitted =
    isFamilyPedigreeStageMetadata(stageMetadata) &&
    stageMetadata.isNetworkCommitted;
  // The alters this pedigree committed to its private network, or null while it
  // is still being built. Used to drop same-typed alters added by later stages.
  const memberIds = useMemo(
    () => pedigreeMemberIds(stageMetadata),
    [stageMetadata],
  );

  const variableConfig: VariableConfig = {
    nodeType,
    edgeType,
    nodeLabelVariable,
    egoVariable,
    relationshipVariable,
    relationshipTypeVariable,
    isActiveVariable,
    isGestationalCarrierVariable,
    gameteRoleVariable,
    biologicalSexVariable,
  };

  const reduxNodesMap = useMemo(
    () => buildOverrideNodesMap(allNodes, nodeType, memberIds),
    [allNodes, nodeType, memberIds],
  );
  const reduxEdgesMap = useMemo(
    () => buildOverrideEdgesMap(allEdges, edgeType),
    [allEdges, edgeType],
  );
  const handleToggleAttribute = (nodeId: string, variable: string) => {
    const node = allNodes.find((n) => n._uid === nodeId);
    const currentValue = node?.[entityAttributesProperty][variable] === true;
    dispatch(
      toggleNodeAttributes({
        nodeId,
        attributePatch: {
          set: { [variable]: !currentValue },
          unset: [],
        },
      }),
    );
  };

  const egoId = [...nodesMap.entries()].find(
    ([, n]) => n[entityAttributesProperty][egoVariable] === true,
  )?.[0];
  const nonEgoNodeCount = [...nodesMap.values()].filter(
    (n) => n[entityAttributesProperty][egoVariable] !== true,
  ).length;
  const hasNodes = nonEgoNodeCount > 0;

  const scaffoldingPrompt = {
    id: 'scaffolding',
    text: censusPrompt,
  };
  const allPrompts = [scaffoldingPrompt, ...(nominationPrompts ?? [])] as {
    id: string;
    text: string;
    variable?: string;
  }[];
  const hasNominationPrompts = allPrompts.length > 1;

  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // moveForward() re-runs the registered beforeNext handlers; this lets our
  // handler wave through the navigation we trigger ourselves after finalizing a
  // pedigree that has no nomination prompts.
  const bypassBeforeNextRef = useRef(false);

  // Pulse the "next" control once every pedigree checklist item is checked,
  // nudging the participant to finalize. Scoped to the building phase — the
  // nomination steps manage their own progression.
  const [checklistComplete, setChecklistComplete] = useState(false);
  const buildingPhase =
    currentStepIndex === 0 && hasNodes && !isNetworkCommitted;
  useEffect(() => {
    updateReady(buildingPhase && checklistComplete);
  }, [updateReady, buildingPhase, checklistComplete]);

  // Screen-reader announcements for the build phase. The pedigree is built via
  // context-menu wizards that mutate the diagram without a page change, so
  // without a live region a screen-reader participant gets no feedback that a
  // relative was added or removed, or that the pedigree can now be finalized.
  // The count is included so consecutive additions re-announce (identical text
  // is not re-read by assistive technology).
  const { announce } = useAccessibilityAnnouncements();
  const prevNonEgoCountRef = useRef(nonEgoNodeCount);
  const prevChecklistCompleteRef = useRef(checklistComplete);
  useEffect(() => {
    if (!buildingPhase) {
      prevNonEgoCountRef.current = nonEgoNodeCount;
      prevChecklistCompleteRef.current = checklistComplete;
      return;
    }
    if (checklistComplete && !prevChecklistCompleteRef.current) {
      announce(intl.formatMessage(messages.buildComplete));
    } else if (nonEgoNodeCount > prevNonEgoCountRef.current) {
      announce(
        intl.formatMessage(messages.memberAdded, { count: nonEgoNodeCount }),
      );
    } else if (nonEgoNodeCount < prevNonEgoCountRef.current) {
      announce(
        intl.formatMessage(messages.memberRemoved, { count: nonEgoNodeCount }),
      );
    }
    // Consume each count/checklist transition. The live-region hook clears the
    // spoken result; changing locale cannot translate and replay an old event.
    prevNonEgoCountRef.current = nonEgoNodeCount;
    prevChecklistCompleteRef.current = checklistComplete;
  }, [buildingPhase, nonEgoNodeCount, checklistComplete, intl, announce]);

  const updateNominationVariable = (stepIndex: number) => {
    const prompt = allPrompts[stepIndex];
    setActiveNominationVariable(prompt?.variable ?? null);
  };

  useBeforeNext((direction, intent) => {
    if (direction === 'forwards') {
      // Step 0 → finalize before advancing
      if (currentStepIndex === 0) {
        // Navigation we trigger ourselves (moveForward, after finalizing a
        // pedigree with no nomination prompts) should pass straight through.
        if (bypassBeforeNextRef.current) {
          bypassBeforeNextRef.current = false;
          return true;
        }

        if (isNetworkCommitted) {
          if (hasNominationPrompts && intent === 'step') {
            // Already finalized (revisiting) — skip straight to nomination
            setCurrentStepIndex(1);
            updateNominationVariable(1);
            return false;
          }
          // Finalized with no nomination prompts — leave the stage.
          return true;
        }

        if (!hasNodes) {
          // Ego wizard not yet completed
          void openDialog({
            type: 'acknowledge',
            title: <AppMessage message={messages.incompleteTitle} />,
            description: <AppMessage message={messages.incompleteNoFamily} />,
            intent: 'destructive',
            actions: {
              primary: {
                label: <AppMessage message={messages.okay} />,
                value: true as const,
              },
            },
          });
        } else {
          // Not finalized — show confirmation dialog
          void handleConfirmAndAdvance();
        }
        return false;
      }

      const isLastStep = currentStepIndex === allPrompts.length - 1;
      if (intent === 'jump' || isLastStep) {
        syncMetadata();
        return true;
      }

      const nextStep = currentStepIndex + 1;
      setCurrentStepIndex(nextStep);
      updateNominationVariable(nextStep);
      return false;
    }
    if (direction === 'backwards') {
      if (currentStepIndex === 0) {
        return true;
      }

      if (intent === 'jump') {
        syncMetadata();
        return true;
      }

      const prevStep = currentStepIndex - 1;
      setCurrentStepIndex(prevStep);
      updateNominationVariable(prevStep);
      return false;
    }
    return false;
  });

  const handleConfirmAndAdvance = async () => {
    const issues = validatePedigreeCompleteness(
      nodesMap,
      edgesMap,
      variableConfig,
      boundaries,
      isFamilyPedigreeStageMetadata(stageMetadata) &&
        stageMetadata.noChildrenAffirmed === true,
      intl,
    );

    if (issues.length > 0) {
      await openDialog({
        type: 'acknowledge',
        title: <AppMessage message={messages.incompleteTitle} />,
        intent: 'destructive',
        description: <AppMessage message={messages.incompleteIssues} />,
        children: (
          <PedigreeValidationIssues
            nodes={nodesMap}
            edges={edgesMap}
            variableConfig={variableConfig}
            boundaries={boundaries}
            noChildrenAffirmed={
              isFamilyPedigreeStageMetadata(stageMetadata) &&
              stageMetadata.noChildrenAffirmed === true
            }
          />
        ),
        actions: {
          primary: {
            label: <AppMessage message={messages.returnToEditing} />,
            value: true as const,
          },
        },
      });
      return;
    }

    const result = await confirm({
      title: <AppMessage message={messages.finalizeQuestion} />,
      description: <AppMessage message={messages.finalizeDescription} />,
      confirmLabel: <AppMessage message={messages.finalize} />,
      cancelLabel: <AppMessage message={messages.keepEditing} />,
      intent: 'default',
      onConfirm: async () => {
        await finalizeNetwork();
      },
    });

    if (result === true) {
      if (hasNominationPrompts) {
        setCurrentStepIndex(1);
        updateNominationVariable(1);
      } else {
        // No nomination prompts — finalizing leaves the stage.
        bypassBeforeNextRef.current = true;
        moveForward();
      }
    }
  };

  const handleResetPedigree = async () => {
    await confirm({
      title: <AppMessage message={messages.resetQuestion} />,
      description: <AppMessage message={messages.resetDescription} />,
      confirmLabel: <AppMessage message={messages.reset} />,
      cancelLabel: <AppMessage message={commonMessages.cancel} />,
      intent: 'destructive',
      onConfirm: () => {
        resetNetwork();
      },
    });
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const showQuickStart = currentStepIndex === 0 && !hasNodes;
  const track = useTrack();
  const wizardShownRef = useRef(false);
  useEffect(() => {
    if (showQuickStart && !wizardShownRef.current) {
      track('pedigree_wizard_shown');
      wizardShownRef.current = true;
    }
  }, [showQuickStart, track]);
  const showResetOption =
    currentStepIndex === 0 && hasNodes && isNetworkCommitted;

  const [dumpCopied, setDumpCopied] = useState(false);
  const dumpCopiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(dumpCopiedTimer.current), []);

  const handleDumpNetwork = async () => {
    const json = JSON.stringify(
      {
        nodes: Object.fromEntries(nodesMap.entries()),
        edges: Object.fromEntries(edgesMap.entries()),
      },
      null,
      2,
    );
    await navigator.clipboard.writeText(json);
    setDumpCopied(true);
    clearTimeout(dumpCopiedTimer.current);
    dumpCopiedTimer.current = setTimeout(() => setDumpCopied(false), 1500);
  };

  return (
    <>
      <div className="interface p-0">
        <Prompts
          prompts={allPrompts}
          currentPromptId={allPrompts[currentStepIndex]?.id}
          className="phone-landscape:px-4 phone-landscape:pt-4 tablet-landscape:px-6 tablet-landscape:pt-6 desktop:px-8 shrink-0 px-2 pt-2"
        />
        <div
          ref={containerRef}
          className="relative flex min-h-0 w-full grow items-center justify-center"
        >
          {isDevelopment && (
            <div className="absolute top-2 right-2 z-50 flex gap-1">
              <button
                type="button"
                className="rounded bg-black/50 px-2 py-1 text-xs text-white opacity-50 hover:opacity-100"
                onClick={handleDumpNetwork}
              >
                {dumpCopied
                  ? intl.formatMessage(messages.copied)
                  : intl.formatMessage(messages.dump)}
              </button>
              <button
                type="button"
                className="rounded bg-black/50 px-2 py-1 text-xs text-white opacity-50 hover:opacity-100"
                onClick={() => {
                  const json = window.prompt(
                    intl.formatMessage(messages.pasteJson),
                  );
                  if (!json) return;
                  try {
                    const data = JSON.parse(json) as {
                      nodes: Record<string, NcNode>;
                      edges: Record<
                        string,
                        {
                          from: string;
                          to: string;
                          attributes: Record<string, unknown>;
                        }
                      >;
                    };
                    clearNetwork();
                    for (const [id, node] of Object.entries(data.nodes)) {
                      addNode({
                        id,
                        attributes: node[entityAttributesProperty] as Record<
                          string,
                          VariableValue
                        >,
                      });
                    }
                    for (const [id, edge] of Object.entries(data.edges)) {
                      addEdge({
                        id,
                        from: edge.from,
                        to: edge.to,
                        attributes: edge.attributes as Record<
                          string,
                          VariableValue
                        >,
                      });
                    }
                  } catch {
                    // eslint-disable-next-line no-console
                    console.error('Failed to parse network JSON');
                  }
                }}
              >
                <AppMessage message={messages.load} />
              </button>
            </div>
          )}
          {showQuickStart ? (
            <>
              <div className="flex h-full w-full flex-col items-center justify-center gap-12 py-10">
                <FamilyPedigreePlaceholder className="hidden min-h-0 w-full flex-1 [@media_((min-height:800px))]:block" />
                <div className="max-w-prose shrink-0 text-center">
                  <Heading level="h3">
                    <AppMessage message={messages.buildTitle} />
                  </Heading>
                  <Paragraph emphasis="muted">
                    <AppMessage message={messages.buildDefinition} />
                  </Paragraph>
                  <Paragraph emphasis="muted">
                    <AppMessage message={messages.buildInstructions} />
                  </Paragraph>
                  <Paragraph emphasis="muted" margin="none">
                    <AppMessage message={messages.buildGetStarted} />
                  </Paragraph>
                </div>
              </div>
            </>
          ) : (
            <>
              {isNetworkCommitted && currentStepIndex > 0 ? (
                <PedigreeView
                  overrideNodes={reduxNodesMap}
                  overrideEdges={reduxEdgesMap}
                  activeNominationVariable={
                    allPrompts[currentStepIndex]?.variable ?? null
                  }
                  onToggleAttribute={handleToggleAttribute}
                />
              ) : (
                <PedigreeView isFinalized={isNetworkCommitted} />
              )}
              {currentStepIndex === 0 && hasNodes && !isNetworkCommitted && (
                <PedigreeChecklist
                  dragConstraints={containerRef}
                  onFinalize={() => void handleConfirmAndAdvance()}
                  onAllDoneChange={setChecklistComplete}
                  variableConfig={variableConfig}
                  boundaries={boundaries}
                />
              )}
              {showResetOption && (
                <div className="absolute bottom-4 flex flex-col items-center gap-2">
                  <Paragraph emphasis="muted" margin="none">
                    <AppMessage message={messages.finalized} />
                  </Paragraph>
                  <Button
                    size="sm"
                    color="destructive"
                    onClick={() => void handleResetPedigree()}
                  >
                    <AppMessage message={messages.resetPedigree} />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
        {showQuickStart && (
          <EgoCellWizard
            egoId={egoId}
            onSubmit={(result) => {
              commitBatch(result.batch);
              if (egoId && result.egoAttributes) {
                updateNode(egoId, {
                  set: result.egoAttributes,
                  unset: [],
                });
              }
              track('pedigree_wizard_complete', {
                nodes_created: Object.keys(result.batch.nodes ?? {}).length,
                edges_created: Object.keys(result.batch.edges ?? {}).length,
              });
              if (!suppressHint) void openDialog(buildPedigreeDialog);
            }}
            variableConfig={variableConfig}
          />
        )}
      </div>
    </>
  );
};

export default function FamilyPedigreeWithProvider(
  props: StageProps<'FamilyPedigree'>,
) {
  const allNodes = useStageSelector(getNetworkNodes);
  const allEdges = useStageSelector(getNetworkEdges);
  return (
    <FamilyPedigreeProvider nodes={allNodes} edges={allEdges}>
      <FamilyPedigree {...props} />
    </FamilyPedigreeProvider>
  );
}

function PedigreeValidationIssues({
  nodes,
  edges,
  variableConfig,
  boundaries,
  noChildrenAffirmed,
}: {
  nodes: Map<string, NcNode>;
  edges: Map<string, NcEdge>;
  variableConfig: VariableConfig;
  boundaries: Boundaries;
  noChildrenAffirmed: boolean;
}) {
  const intl = useAppIntl();
  const issues = validatePedigreeCompleteness(
    nodes,
    edges,
    variableConfig,
    boundaries,
    noChildrenAffirmed,
    intl,
  );
  return (
    <ul className="list-disc space-y-1 pl-5">
      {issues.map((issue, index) => (
        <li key={`${issue.nodeId}-${index}`}>{issue.message}</li>
      ))}
    </ul>
  );
}
