import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { NcEdge, NcNode, VariableValue } from '@codaco/shared-consts';
import { useTrack } from '~/analytics/useTrack';
import Prompts from '~/components/Prompts/Prompts';
import { useContractFlags } from '~/contract/context';
import useBeforeNext from '~/hooks/useBeforeNext';
import useReadyForNextStage from '~/hooks/useReadyForNextStage';
import { useStageSelector } from '~/hooks/useStageSelector';
import {
  getNetworkEdges,
  getNetworkNodes,
  getStageMetadata,
} from '~/selectors/session';
import { toggleNodeAttributes } from '~/store/modules/session';
import { useAppDispatch } from '~/store/store';
import type { StageProps } from '~/types';

import { buildPedigreeDialog } from './buildPedigreeDialog';
import PedigreeChecklist from './components/PedigreeChecklist';
import EgoCellWizard from './components/wizards/EgoCellWizard';
import {
  FamilyPedigreeProvider,
  useFamilyPedigreeStore,
} from './FamilyPedigreeProvider';
import FamilyPedigreePlaceholder from './pedigree-layout/components/FamilyPedigreePlaceholder';
import PedigreeView from './pedigree-layout/components/PedigreeView';
import type { VariableConfig } from './store';
import {
  getEdgeTypeKey,
  getIsActiveVariable,
  getIsGestationalCarrierVariable,
  getRelationshipTypeVariable,
} from './utils/edgeUtils';
import {
  getEgoVariable,
  getNodeLabelVariable,
  getNodeTypeKey,
  getRelationshipVariable,
} from './utils/nodeUtils';
import { validatePedigreeCompleteness } from './utils/validatePedigree';

const FamilyPedigree = (props: StageProps<'FamilyPedigree'>) => {
  const {
    stage: { censusPrompt, nominationPrompts },
  } = props;

  const dispatch = useAppDispatch();
  const { confirm, openDialog } = useDialog();
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

  const allNodes = useStageSelector(getNetworkNodes);
  const allEdges = useStageSelector(getNetworkEdges);

  const stageMetadata = useStageSelector(getStageMetadata) as
    | { isNetworkCommitted?: boolean }
    | undefined;

  const isNetworkCommitted = stageMetadata?.isNetworkCommitted === true;

  const variableConfig: VariableConfig = {
    nodeType,
    edgeType,
    nodeLabelVariable,
    egoVariable,
    relationshipVariable,
    relationshipTypeVariable,
    isActiveVariable,
    isGestationalCarrierVariable,
  };

  const reduxNodesMap = useMemo(
    () => new Map<string, NcNode>(allNodes.map((n) => [n._uid, n])),
    [allNodes],
  );
  const reduxEdgesMap = useMemo(
    () => new Map<string, NcEdge>(allEdges.map((e) => [e._uid, e])),
    [allEdges],
  );
  const handleToggleAttribute = (nodeId: string, variable: string) => {
    const node = allNodes.find((n) => n._uid === nodeId);
    const currentValue = node?.attributes[variable] === true;
    dispatch(
      toggleNodeAttributes({
        nodeId,
        attributes: { [variable]: !currentValue },
      }),
    );
  };

  const egoId = [...nodesMap.entries()].find(
    ([, n]) => n.attributes[egoVariable] === true,
  )?.[0];
  const nonEgoNodeCount = [...nodesMap.values()].filter(
    (n) => n.attributes[egoVariable] !== true,
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

  const updateNominationVariable = (stepIndex: number) => {
    const prompt = allPrompts[stepIndex];
    setActiveNominationVariable(prompt?.variable ?? null);
  };

  useBeforeNext((direction) => {
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
          if (hasNominationPrompts) {
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
            title: 'Pedigree is incomplete',
            description:
              'You have not created your family pedigree yet. Please complete the pedigree wizard to create your pedigree before continuing. Click the button in the bottom right to get started.',
            intent: 'destructive',
            actions: {
              primary: { label: 'OK', value: true as const },
            },
          });
        } else {
          // Not finalized — show confirmation dialog
          void handleConfirmAndAdvance();
        }
        return false;
      }

      const isLastStep = currentStepIndex === allPrompts.length - 1;
      if (isLastStep) {
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
    );

    if (issues.length > 0) {
      await openDialog({
        type: 'acknowledge',
        title: 'Pedigree is incomplete',
        intent: 'destructive',
        description:
          "It looks like you haven't completed all the required tasks for your family pedigree. The following issues must be resolved before you can continue:",
        children: (
          <ul className="list-disc space-y-1 pl-5">
            {issues.map((issue) => (
              <li key={issue.message}>{issue.message}</li>
            ))}
          </ul>
        ),
        actions: {
          primary: { label: 'Return to editing', value: true as const },
        },
      });
      return;
    }

    const result = await confirm({
      title: 'Finalize your family pedigree?',
      description:
        'Once you continue, you will not be able to add or remove family members. You can still edit their details.',
      confirmLabel: 'Finalize',
      cancelLabel: 'Keep editing',
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
      title: 'Reset family pedigree?',
      description:
        'This will delete all family members and relationships. This action cannot be undone.',
      confirmLabel: 'Reset',
      cancelLabel: 'Cancel',
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
                {dumpCopied ? 'Copied to clipboard!' : 'Dump'}
              </button>
              <button
                type="button"
                className="rounded bg-black/50 px-2 py-1 text-xs text-white opacity-50 hover:opacity-100"
                onClick={() => {
                  const json = window.prompt('Paste network JSON:');
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
                        attributes: node.attributes as Record<
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
                Load
              </button>
            </div>
          )}
          {showQuickStart ? (
            <>
              <div className="flex h-full w-full flex-col items-center justify-center gap-12 py-10">
                <FamilyPedigreePlaceholder className="hidden min-h-0 w-full flex-1 [@media_((min-height:800px))]:block" />
                <div className="max-w-prose shrink-0 text-center">
                  <Heading level="h3">Build your family pedigree</Heading>
                  <Paragraph emphasis="muted">
                    A family pedigree is a diagram of your relatives and how
                    they are connected to you.
                  </Paragraph>
                  <Paragraph emphasis="muted">
                    To begin, we will ask a few quick questions and sketch out
                    your immediate family for you. From there, you can click on
                    any person to add more relatives and fill in their details.
                  </Paragraph>
                  <Paragraph emphasis="muted" margin="none">
                    Click the button below to get started.
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
                />
              )}
              {showResetOption && (
                <div className="absolute bottom-4 flex flex-col items-center gap-2">
                  <Paragraph emphasis="muted" margin="none">
                    Your family pedigree has been finalized.
                  </Paragraph>
                  <Button
                    size="sm"
                    color="destructive"
                    onClick={() => void handleResetPedigree()}
                  >
                    Reset family pedigree
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
                updateNode(egoId, result.egoAttributes);
              }
              track('pedigree_wizard_complete', {
                nodes_created: Object.keys(result.batch.nodes ?? {}).length,
                edges_created: Object.keys(result.batch.edges ?? {}).length,
              });
              void openDialog(buildPedigreeDialog);
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
