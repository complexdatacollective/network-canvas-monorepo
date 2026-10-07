'use client';

import { has } from 'es-toolkit/compat';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useAppIntl } from '@codaco/app-i18n/react';
import { ResizableFlexPanel } from '@codaco/fresco-ui/ResizableFlexPanel';
import type { Form } from '@codaco/protocol-validation';
import {
  type EntityAttributesProperty,
  type EntityPrimaryKey,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import NodeBin from '../../components/NodeBin';
import NodeList from '../../components/NodeList';
import Prompts from '../../components/Prompts';
import { usePrompts } from '../../components/Prompts/usePrompts';
import { useCurrentStep } from '../../contexts/CurrentStepContext';
import {
  writeFailureMessage,
  writeSubmissionResult,
} from '../../forms/writeSubmissionResult';
import useMediaQuery from '../../hooks/useMediaQuery';
import useNodeLimits from '../../hooks/useNodeLimits';
import usePortalTarget from '../../hooks/usePortalTarget';
import { useStageSelector } from '../../hooks/useStageSelector';
import { getCodebookVariablesForSubjectType } from '../../selectors/protocol';
import {
  getNetworkNodesForPrompt,
  getPromptAdditionalAttributes,
  getStageNodeCount,
} from '../../selectors/session';
import {
  addNode as addNodeAction,
  addNodeToPrompt as addNodeToPromptAction,
  deleteNode as deleteNodeAction,
} from '../../store/modules/session';
import { useAppDispatch } from '../../store/store';
import { useInterviewToast } from '../../toast/useInterviewToast';
import type { StageProps } from '../../types';
import { isAttributeEncrypted } from '../Anonymisation/isAttributeEncrypted';
import { usePassphrase } from '../Anonymisation/usePassphrase';
import { interfaceMessages } from '../messages';
import NodeForm from './components/NodeForm';
import NodePanels from './components/NodePanels';
import QuickNodeForm from './components/QuickNodeForm';

type NameGeneratorProps = StageProps<'NameGeneratorQuickAdd' | 'NameGenerator'>;

const NameGenerator = (props: NameGeneratorProps) => {
  const intl = useAppIntl();
  const { stage } = props;

  const { behaviours, type, panels } = stage;

  let quickAdd: string | null = null;
  let form: Form | null = null;

  if (type === 'NameGeneratorQuickAdd') {
    quickAdd = stage.quickAdd;
  }

  if (type === 'NameGenerator') {
    form = stage.form;
  }

  const interfaceRef = useRef<HTMLDivElement>(null);

  const { isLastPrompt, promptIndex } = usePrompts();
  const { requirePassphrase, passphrase, passphraseInvalid, isEnabled } =
    usePassphrase();
  const { showToast } = useInterviewToast();

  const [selectedNode, setSelectedNode] = useState<NcNode | null>(null);
  const [isPanelsOpen, setIsPanelsOpen] = useState(false);

  const minNodes = behaviours?.minNodes ?? 0;
  const maxNodes = behaviours?.maxNodes ?? Number.POSITIVE_INFINITY;

  const stageNodeCount = useStageSelector(getStageNodeCount);
  const newNodeAttributes = useStageSelector(getPromptAdditionalAttributes);
  const nodesForPrompt = useStageSelector(getNetworkNodesForPrompt);
  const codebookForNodeType = useStageSelector(
    getCodebookVariablesForSubjectType,
  );

  const dispatch = useAppDispatch();
  const { currentStep } = useCurrentStep();

  const useEncryption = useMemo(() => {
    const isEncrypted = (variableId: string) =>
      isAttributeEncrypted(isEnabled, codebookForNodeType, variableId);

    if (Object.keys(newNodeAttributes).some(isEncrypted)) {
      return true;
    }

    // Check if the quickAdd variable or form has an encrypted variable
    if (stage.type === 'NameGeneratorQuickAdd') {
      return isEncrypted(stage.quickAdd);
    }

    // Check if the form has any variables that are encrypted
    if (stage.type === 'NameGenerator') {
      return stage.form.fields.some((field) => isEncrypted(field.variable));
    }

    return false;
  }, [stage, codebookForNodeType, newNodeAttributes, isEnabled]);

  useEffect(() => {
    if (useEncryption) {
      requirePassphrase();
    }
  }, [useEncryption, requirePassphrase]);

  // Answers this stage would encrypt can only be taken once a passphrase that
  // works is in force.
  const encryptionLocked = useEncryption && (!passphrase || passphraseInvalid);

  const addNodeToPrompt = useCallback(
    (
      nodeId: NcNode[EntityPrimaryKey],
      promptAttributes: Record<string, boolean> = {},
    ) =>
      dispatch(
        addNodeToPromptAction({
          nodeId,
          promptAttributes,
          currentStep,
        }),
      ),
    [dispatch, currentStep],
  );

  const deleteNode = useCallback(
    (uid: NcNode[EntityPrimaryKey]) => {
      dispatch(deleteNodeAction(uid));
    },
    [dispatch],
  );

  const dispatchAddNode = useCallback(
    (
      attributes: NcNode[EntityAttributesProperty],
      options?: {
        allowUnknownAttributes?: boolean;
        modelData?: { [entityPrimaryKeyProperty]: NcNode[EntityPrimaryKey] };
      },
    ) =>
      dispatch(
        addNodeAction({
          type: stage.subject.type,
          attributeData: attributes,
          useEncryption,
          allowUnknownAttributes: options?.allowUnknownAttributes,
          modelData: options?.modelData,
          currentStep,
        }),
      ),
    [dispatch, stage.subject.type, useEncryption, currentStep],
  );

  const addNode = useCallback(
    async (attributes: NcNode[EntityAttributesProperty]) =>
      writeSubmissionResult(await dispatchAddNode(attributes)),
    [dispatchAddNode],
  );

  const { maxNodesReached } = useNodeLimits({
    stageNodeCount,
    minNodes,
    maxNodes,
    isLastPrompt,
  });

  /**
   * Drop node handler
   * Adds prompt attributes to existing nodes, or adds new nodes to the network.
   */
  const handleDropNode = async (metadata?: Record<string, unknown>) => {
    const node = metadata as NcNode | undefined;
    if (!node) return;

    // Test if we are updating an existing network node, or adding it to the network
    if (has(node, 'promptIDs')) {
      void addNodeToPrompt(node[entityPrimaryKeyProperty], newNodeAttributes);
      return;
    }

    if (encryptionLocked) {
      requirePassphrase();
      return;
    }

    // Panel nodes may come from external data with attributes not in the codebook
    const result = await dispatchAddNode(
      { ...node[entityAttributesProperty], ...newNodeAttributes },
      {
        allowUnknownAttributes: true,
        modelData: {
          [entityPrimaryKeyProperty]: node[entityPrimaryKeyProperty],
        },
      },
    );
    const failure = writeFailureMessage(result);
    if (failure) {
      showToast({
        description: intl.formatMessage(failure),
        variant: 'destructive',
        anchor: 'forward',
      });
    }
  };

  // When a node is tapped, trigger editing. The form decrypts what it shows,
  // and is not opened at all while answers it would encrypt could not be saved.
  const handleSelectNode = useCallback(
    (node: NcNode) => {
      if (!form) return;
      if (encryptionLocked) {
        requirePassphrase();
        return;
      }
      setSelectedNode(node);
    },
    [form, encryptionLocked, requirePassphrase],
  );

  const clearSelectedNode = useCallback(() => setSelectedNode(null), []);

  // Tapping a node opens it for editing, which only exists when the stage has
  // a form: a quick-add stage has none, and offering the tap anyway gives the
  // node every clickable affordance — pointer cursor, press feedback, a
  // toggle role — for something that does nothing.
  const onNodeTapped = form ? handleSelectNode : undefined;

  const stageElement = usePortalTarget('stage', interfaceRef);
  const isSmallScreen = useMediaQuery('(max-aspect-ratio: 3/4)');
  const isWideScreen = useMediaQuery('(min-aspect-ratio: 3/2)');

  function defaultBasis() {
    if (isSmallScreen) {
      return 50;
    }
    if (isWideScreen) {
      return 25;
    }
    return 33;
  }

  return (
    <>
      <div className="interface min-h-0" ref={interfaceRef}>
        <Prompts />
        {panels ? (
          <ResizableFlexPanel
            storageKey={
              isSmallScreen
                ? 'name-generator-panels-vertical'
                : 'name-generator-panels-horizontal'
            }
            defaultBasis={defaultBasis()}
            breakpoints={[
              {
                value: 25,
                label: intl.formatMessage(interfaceMessages.quarterPanels),
              },
              {
                value: 33,
                label: intl.formatMessage(interfaceMessages.oneThirdPanels),
              },
              {
                value: 50,
                label: intl.formatMessage(interfaceMessages.equalSplit),
              },
            ]}
            overrideBasis={isPanelsOpen ? undefined : 0}
            className="min-h-0 w-full flex-1 basis-full"
            aria-label={intl.formatMessage(interfaceMessages.resizePanels)}
            orientation={isSmallScreen ? 'vertical' : 'horizontal'}
          >
            <NodePanels
              disableAddNew={maxNodesReached || encryptionLocked}
              onOpenChange={setIsPanelsOpen}
              animationKey={promptIndex}
            />
            <NodeList
              items={nodesForPrompt}
              id="MAIN_NODE_LIST"
              accepts={['NEW_NODE']}
              itemType="EXISTING_NODE"
              onDrop={handleDropNode}
              onItemClick={onNodeTapped}
              animationKey={promptIndex}
              className="flex flex-1 rounded"
              announcedName={intl.formatMessage(interfaceMessages.addedNodes)}
              testId="node-list"
            />
          </ResizableFlexPanel>
        ) : (
          <div className="flex min-h-0 w-full flex-1 basis-full gap-4">
            <NodeList
              items={nodesForPrompt}
              id="MAIN_NODE_LIST"
              accepts={['NEW_NODE']}
              itemType="EXISTING_NODE"
              onDrop={handleDropNode}
              onItemClick={onNodeTapped}
              animationKey={promptIndex}
              className="flex flex-1 rounded"
              announcedName={intl.formatMessage(interfaceMessages.addedNodes)}
              testId="node-list"
            />
          </div>
        )}
        {form ? (
          <NodeForm
            selectedNode={selectedNode}
            form={form}
            disabled={maxNodesReached || encryptionLocked}
            onClose={clearSelectedNode}
            addNode={addNode}
          />
        ) : (
          <QuickNodeForm
            disabled={maxNodesReached || encryptionLocked}
            targetVariable={quickAdd!}
            addNode={addNode}
          />
        )}
      </div>
      {stageElement &&
        createPortal(
          <NodeBin
            accepts={(node: NcNode & { itemType?: string }) =>
              node.itemType === 'EXISTING_NODE'
            }
            dropHandler={(meta: NcNode) =>
              deleteNode(meta[entityPrimaryKeyProperty])
            }
          />,
          stageElement,
        )}
    </>
  );
};

export default NameGenerator;
