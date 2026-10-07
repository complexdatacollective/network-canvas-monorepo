'use client';
import { AnimatePresence, motion } from 'motion/react';
import type { ComponentProps } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type { ValidationContext } from '@codaco/fresco-ui/form/store/types';
import UINode from '@codaco/fresco-ui/Node';
import {
  type PresentationalText,
  presentationalTextValue,
} from '@codaco/fresco-ui/PresentationalText';
import type { Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { useTrack } from '../../analytics/useTrack';
import NodeDrawer from '../../components/NodeDrawer';
import PassphraseEntry from '../../components/PassphraseEntry';
import Prompts from '../../components/Prompts';
import { usePrompts } from '../../components/Prompts/usePrompts';
import { useCurrentStep } from '../../contexts/CurrentStepContext';
import { buildVariableLabels } from '../../forms/buildVariableLabels';
import { useValidationNetwork } from '../../forms/useValidationNetwork';
import {
  writeFailureMessage,
  writeSubmissionResult,
} from '../../forms/writeSubmissionResult';
import useReadyForNextStage from '../../hooks/useReadyForNextStage';
import { useStageSelector } from '../../hooks/useStageSelector';
import { useResolvePresentationalText } from '../../localization/ProtocolLocalizationProvider';
import {
  getValidationContext,
  selectValidationMetadataForVariable,
  validationPropsFor,
} from '../../selectors/forms';
import { getCodebookVariablesForSubjectType } from '../../selectors/protocol';
import {
  getNodeColorSelector,
  getNodeTypeDefinition,
  resolveNodeShape,
} from '../../selectors/session';
import { updateNode } from '../../store/modules/session';
import { useAppDispatch } from '../../store/store';
import { useInterviewToast } from '../../toast/useInterviewToast';
import type { StageProps } from '../../types';
import { useNodeLabel } from '../Anonymisation/useNodeLabel';
import { usePassphrase } from '../Anonymisation/usePassphrase';
import { interfaceMessages } from '../messages';
import CategoricalBinItem from './components/CategoricalBinItem';
import { useCategoricalBins } from './useCategoricalBins';

type CategoricalBinStageProps = StageProps<'CategoricalBin'>;

const CAT_COLOR_VARS = [
  'var(--cat-1)',
  'var(--cat-2)',
  'var(--cat-3)',
  'var(--cat-4)',
  'var(--cat-5)',
  'var(--cat-6)',
  'var(--cat-7)',
  'var(--cat-8)',
  'var(--cat-9)',
  'var(--cat-10)',
];

const binsContainerVariants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      staggerChildren: 0.07,
      when: 'beforeChildren' as const,
    },
  },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

const getCatColor = (index: number) => {
  if (index < 0) return null;
  return CAT_COLOR_VARS[index % CAT_COLOR_VARS.length]!;
};

type CategoricalBinPrompts = Extract<
  Stage,
  { type: 'CategoricalBin' }
>['prompts'][number];

type OtherResponseProps = Pick<
  ComponentProps<typeof UINode>,
  'color' | 'shape'
> & {
  node: NcNode;
  variable: string;
  label: PresentationalText;
  validationProps: ReturnType<typeof validationPropsFor>;
};

/**
 * The "other" dialog's question about the person dropped. Queued dialog
 * children subscribe themselves, so the placeholder and fallback label follow
 * a locale switch while the participant keeps their entered answer, and the
 * stored answers the question's rules compare with are read as they are now.
 * When reading them needs the passphrase, it is asked for here: the
 * navigation can't be reached while the dialog is open.
 */
function OtherResponse({
  node,
  color,
  shape,
  variable,
  label,
  validationProps,
}: OtherResponseProps) {
  const intl = useAppIntl();
  const nodeId = node[entityPrimaryKeyProperty];
  // Base pieces of the validation context useProtocolForm builds for every
  // other Field (codebook + network + this stage's subject), scoped to the
  // dropped node via currentEntityId.
  const baseValidationContext = useStageSelector(getValidationContext);
  const { context: validationNetwork, passphraseNeeded } = useValidationNetwork(
    baseValidationContext,
    baseValidationContext.stageSubject,
    [variable],
    nodeId,
  );
  const labelText = presentationalTextValue(label);

  // Context-dependent rules (unique, sameAs, differentFrom,
  // greaterThanVariable, etc.) resolve against the entity being edited and
  // the live network — mirror useProtocolForm's ValidationContext, scoped
  // to this dropped node via currentEntityId so e.g. `unique` excludes the
  // node's own previous value and `differentFrom`/`sameAs` can read a
  // sibling attribute already recorded on this same node.
  // stageSubject is only ever null for stage types that carry no subject
  // at all (Information/Anonymisation/FamilyPedigree/NarrativePedigree);
  // CategoricalBin always has a node subject, so the undefined fallback
  // here is defensive only.
  const validationContext = useMemo<ValidationContext | undefined>(
    () =>
      baseValidationContext.stageSubject
        ? {
            codebook: baseValidationContext.codebook,
            ...validationNetwork,
            stageSubject: baseValidationContext.stageSubject,
            currentEntityId: nodeId,
            // …and the same comparison rule must word its error the same way
            // here as it does in a form. The one variable this dialog asks
            // about has exactly one piece of authored, participant-facing
            // text — the prompt rendered as the field's label below. The
            // node's own label is deliberately not a source: it is the name
            // the participant typed, not something the researcher authored.
            variableLabels: buildVariableLabels([
              { variable, label: labelText },
            ]),
          }
        : undefined,
    [baseValidationContext, validationNetwork, nodeId, variable, labelText],
  );

  return (
    <>
      <PassphraseEntry needed={passphraseNeeded} />
      <div className="flex items-start gap-4">
        <div className="shrink-0">
          <OtherResponseNode node={node} color={color} shape={shape} />
        </div>
        <Field
          label={label}
          component={InputField}
          name={variable}
          nameMode="opaque"
          placeholder={intl.formatMessage(
            interfaceMessages.responsePlaceholder,
          )}
          {...validationProps}
          validationContext={validationContext}
          autoFocus
        />
      </div>
    </>
  );
}

// Labelled as everywhere else the person is shown, so a protected name is
// decrypted rather than shown as stored.
function OtherResponseNode({
  node,
  ...props
}: Omit<ComponentProps<typeof UINode>, 'label'> & { node: NcNode }) {
  return <UINode {...props} label={useNodeLabel(node)} />;
}

const CategoricalBin = (_props: CategoricalBinStageProps) => {
  const [expandedBinIndex, setExpandedBinIndex] = useState<number | null>(null);
  const track = useTrack();
  const previousExpandedRef = useRef<number | null>(null);

  useEffect(() => {
    const previous = previousExpandedRef.current;
    if (expandedBinIndex !== null && previous === null) {
      track('bin_expanded', { bin_index: expandedBinIndex });
    } else if (expandedBinIndex === null && previous !== null) {
      track('bin_collapsed', { bin_index: previous });
    } else if (
      expandedBinIndex !== null &&
      previous !== null &&
      expandedBinIndex !== previous
    ) {
      track('bin_collapsed', { bin_index: previous });
      track('bin_expanded', { bin_index: expandedBinIndex });
    }
    previousExpandedRef.current = expandedBinIndex;
  }, [expandedBinIndex, track]);

  const lastBinIndexRef = useRef<Map<string, number>>(new Map());

  // Collapse expanded bin on document-level click or Escape press, so the wrapping
  // container doesn't need an interactive role.
  useEffect(() => {
    if (expandedBinIndex === null) return;
    const collapse = () => setExpandedBinIndex(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') collapse();
    };
    document.addEventListener('click', collapse);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', collapse);
      document.removeEventListener('keydown', onKey);
    };
  }, [expandedBinIndex]);

  const { prompt } = usePrompts<CategoricalBinPrompts>();
  const { id, variable } = prompt;

  const { bins, uncategorisedNodes } = useCategoricalBins();

  const { updateReady } = useReadyForNextStage();

  useEffect(() => {
    updateReady(uncategorisedNodes.length === 0);
  }, [uncategorisedNodes.length, updateReady]);

  // Reset expanded bin when prompt changes. Compared during render so the new
  // prompt is never painted with the previous prompt's bin still expanded.
  const [expandedPromptId, setExpandedPromptId] = useState(id);
  if (expandedPromptId !== id) {
    setExpandedPromptId(id);
    setExpandedBinIndex(null);
  }

  const hasExpanded = expandedBinIndex !== null;

  const circleCount = hasExpanded ? bins.length - 1 : bins.length;

  // The expanded bin is rendered as a sibling of .catbin-inflow (not inside
  // it) so its position:absolute anchors to .catbin-circles. If it sat
  // inside .catbin-inflow, the container-type:size on .catbin-inflow would
  // make .catbin-inflow itself the containing block — and the panel would
  // be confined to the (shrunken) in-flow area instead of the full one.
  const expandedBin =
    expandedBinIndex !== null ? bins[expandedBinIndex] : undefined;

  const dispatch = useAppDispatch();
  const { currentStep } = useCurrentStep();
  const { openDialog } = useDialog();
  const nodeColor = useStageSelector(getNodeColorSelector);
  const nodeTypeDefinition = useStageSelector(getNodeTypeDefinition);
  const stageVariables = useStageSelector(getCodebookVariablesForSubjectType);
  const intl = useAppIntl();
  const { unlocked, requirePassphrase, lockedNotice } = usePassphrase();
  const { showToast } = useInterviewToast();

  // A refused write leaves the person where they were; say why.
  const committed = (
    updateResult: Parameters<typeof writeFailureMessage>[0],
  ) => {
    const failure = writeFailureMessage(updateResult);
    if (!failure) return true;
    showToast({
      description: intl.formatMessage(failure),
      variant: 'destructive',
      anchor: 'forward',
    });
    return false;
  };
  const toPresentationalText = useResolvePresentationalText();

  const handleDropNode = async (node: NcNode, binIndex: number) => {
    const nodeId = node[entityPrimaryKeyProperty];
    const bin = bins[binIndex]!;
    const recordCommittedDrop = () => {
      const previousIndex = lastBinIndexRef.current.get(nodeId);
      if (previousIndex === undefined) {
        track('node_binned', {
          node_id: nodeId,
          node_type: node.type,
          bin_index: binIndex,
        });
      } else if (previousIndex !== binIndex) {
        track('node_rebinned', {
          node_id: nodeId,
          node_type: node.type,
          from_bin_index: previousIndex,
          to_bin_index: binIndex,
        });
      }
      lastBinIndexRef.current.set(nodeId, binIndex);
    };

    // If the node is being dropped into the 'other' bin, show a dialog to
    // specify the value for the other variable. The schema's prompt union
    // proves otherVariablePrompt exists whenever otherVariable is set.
    if (bin.isOther && prompt.otherVariable !== undefined) {
      const { otherVariable, otherVariablePrompt } = prompt;
      const otherPromptLabel = toPresentationalText(otherVariablePrompt);

      // An answer that would be encrypted is not asked for until it could be
      // saved.
      if (stageVariables[otherVariable]?.encrypted && !unlocked) {
        requirePassphrase();
        showToast({
          description: intl.formatMessage(lockedNotice),
          variant: 'info',
          anchor: 'forward',
        });
        return false;
      }

      // Derive the other variable's validation props directly from its
      // codebook definition — the other-input renders its own Field/component
      // and only ever needs `.validation`, so this skips component
      // resolution entirely (see selectValidationMetadataForVariable). A
      // variable with no validation rules renders a genuinely optional field.
      const otherValidationMetadata = selectValidationMetadataForVariable(
        stageVariables,
        otherVariable,
      );
      const otherValidationProps = otherValidationMetadata
        ? validationPropsFor(otherValidationMetadata)
        : {};

      const result = await openDialog({
        type: 'form',
        title: <AppMessage message={interfaceMessages.specifyOther} />,
        children: (
          <OtherResponse
            node={node}
            color={nodeColor}
            shape={
              nodeTypeDefinition
                ? resolveNodeShape(
                    nodeTypeDefinition.shape,
                    node[entityAttributesProperty],
                  )
                : undefined
            }
            variable={otherVariable}
            label={otherPromptLabel}
            validationProps={otherValidationProps}
          />
        ),
        intent: 'default',
        // Saving inside the dialog means a refused save keeps it open with
        // the answer as typed and the reason shown, ready to retry.
        onSubmit: async (values) => {
          const otherValue = values[otherVariable];
          return writeSubmissionResult(
            await dispatch(
              updateNode({
                nodeId,
                attributePatch: {
                  set: {
                    [otherVariable]:
                      typeof otherValue === 'string' ? otherValue : '',
                  },
                  unset: [variable],
                },
                currentStep,
              }),
            ),
          );
        },
      });

      // The dialog only resolves with values once they have been saved.
      if (!result) return false;

      recordCommittedDrop();
      return true;
    }
    // Only the 'other' bin (handled above) has a null value; a regular bin
    // always carries a concrete option value.
    if (bin.value === null) return false;

    const updateResult = await dispatch(
      updateNode({
        nodeId,
        attributePatch: {
          set: { [variable]: [bin.value] },
          unset:
            prompt.otherVariable !== undefined ? [prompt.otherVariable] : [],
        },
        currentStep,
      }),
    );

    if (!committed(updateResult)) return false;

    recordCommittedDrop();
    return true;
  };

  return (
    <div
      data-testid="categorical-bin-interface"
      className="interface overflow-hidden pb-0"
    >
      <Prompts />
      <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-2">
        <div className="catbin-outer min-h-0 w-full flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={id}
              className="catbin-circles size-full"
              data-expanded={hasExpanded || undefined}
              variants={binsContainerVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {expandedBin && expandedBinIndex !== null && (
                <CategoricalBinItem
                  // Key includes the index so React unmounts + remounts when a
                  // different bin is expanded. With a constant key, props would
                  // just update — but the inner motion.div's layoutId derives
                  // from the index, so it would change mid-component-life and
                  // motion would lose the layoutId transition (panel never
                  // appears after switching between expanded bins).
                  key={`expanded-${expandedBinIndex}`}
                  index={expandedBinIndex}
                  label={expandedBin.label}
                  isExpanded
                  onToggleExpand={() => setExpandedBinIndex(null)}
                  catColor={getCatColor(expandedBinIndex)}
                  onDropNode={(node) => handleDropNode(node, expandedBinIndex)}
                  nodes={expandedBin.nodes}
                  flowOrdinal={undefined}
                />
              )}
              <div className="catbin-inflow">
                {/* .catbin-inflow is the size query container; .catbin-grid is
									the actual grid descendant where @container catbin rules
									match and where data-count drives the lookup. */}
                <div className="catbin-grid" data-count={circleCount}>
                  {bins.map((bin, index) => {
                    if (index === expandedBinIndex) return null;
                    // 1-based ordinal among in-flow (non-expanded) bins.
                    // Drives CSS ragged-row centring via [data-flow-index="N"].
                    const flowOrdinal =
                      expandedBinIndex !== null && expandedBinIndex < index
                        ? index
                        : index + 1;
                    return (
                      <CategoricalBinItem
                        key={index}
                        index={index}
                        label={bin.label}
                        isExpanded={false}
                        onToggleExpand={() => setExpandedBinIndex(index)}
                        catColor={getCatColor(index)}
                        onDropNode={(node) => handleDropNode(node, index)}
                        nodes={bin.nodes}
                        flowOrdinal={flowOrdinal}
                      />
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
        <NodeDrawer nodes={uncategorisedNodes} itemType="NODE" />
      </div>
    </div>
  );
};

export default CategoricalBin;
