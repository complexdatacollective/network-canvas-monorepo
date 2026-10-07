'use client';

import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';

import type { FramingId } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  isFamilyPedigreeStageMetadata,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import { useCurrentStep } from '../../contexts/CurrentStepContext';
import { useStageSelector } from '../../hooks/useStageSelector';
import { makeGetCodebookVariablesForNodeType } from '../../selectors/protocol';
import { getStageMetadata } from '../../selectors/session';
import { useAppDispatch } from '../../store/store';
import type { DecryptionScope } from '../Anonymisation/decryptionScope';
import { isAttributeEncrypted } from '../Anonymisation/isAttributeEncrypted';
import PassphraseNotice, {
  type PassphraseNoticeStatus,
} from '../Anonymisation/PassphraseNotice';
import { useDecryptedNodes } from '../Anonymisation/useDecryptedNodes';
import { useDecryptionScope } from '../Anonymisation/useDecryptionScope';
import { usePassphrase } from '../Anonymisation/usePassphrase';
import { FamilyPedigreeContext } from './FamilyPedigreeContext';
import {
  createFamilyPedigreeStore,
  type FamilyPedigreeStoreApi,
  type NodeMetadata,
  type VariableConfig,
} from './store';
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
  getNodeForm,
  getNodeLabelVariable,
  getNodeTypeKey,
  getRelationshipVariable,
} from './utils/nodeUtils';
import {
  edgesWithinPedigreeMembership,
  pedigreeEdgeMembership,
  pedigreeMemberIds,
} from './utils/pedigreeMembership';
import { getFramingConfig } from './utils/stageConfig';

export const FamilyPedigreeProvider = ({
  nodes,
  edges,
  children,
}: {
  nodes: NcNode[];
  edges: NcEdge[];
  children: React.ReactNode;
}) => {
  const [store, setStore] = useState<FamilyPedigreeStoreApi | null>(null);
  const dispatch = useAppDispatch();
  const { currentStep } = useCurrentStep();

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
  const framingConfig = useStageSelector(getFramingConfig);
  const stageMetadata = useStageSelector(getStageMetadata);
  const nodeForm = useStageSelector(getNodeForm);
  const getCodebookVariablesForNodeType = useSelector(
    makeGetCodebookVariablesForNodeType,
  );
  const { passphraseInvalid, requirePassphrase, isEnabled } = usePassphrase();
  const scope = useDecryptionScope();
  const [openedUnder, setOpenedUnder] = useState<DecryptionScope>();
  const initialFraming: FramingId | null =
    framingConfig.mode === 'fixed'
      ? framingConfig.value
      : ((isFamilyPedigreeStageMetadata(stageMetadata)
          ? stageMetadata.selectedFraming
          : undefined) ?? null);

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

  const nodeVariables = getCodebookVariablesForNodeType(nodeType);
  const encryptedVariableIds = new Set(
    Object.keys(nodeVariables).filter((variableId) =>
      isAttributeEncrypted(isEnabled, nodeVariables, variableId),
    ),
  );
  const writesEncrypted = [
    nodeLabelVariable,
    relationshipVariable,
    ...(nodeForm ?? []).map((field) => field.variable),
  ].some((variableId) => encryptedVariableIds.has(variableId));

  useEffect(() => {
    if (writesEncrypted) requirePassphrase();
  }, [writesEncrypted, requirePassphrase]);

  // The interview network is a single shared graph. Seed only the pedigree's
  // own node/edge types so the store works against the same entities it owns,
  // and remember which were already in Redux so finalize doesn't duplicate
  // them. Once the pedigree has committed its private membership, also drop
  // same-typed alters nominated in later stages, which are not part of it.
  // The store is created once, from the network as it was on mount; nothing
  // in this stage writes to Redux before then.
  const [seed] = useState(() => {
    const memberIds = pedigreeMemberIds(stageMetadata);
    const seededNodes = nodes.filter(
      (node) =>
        node.type === nodeType &&
        (memberIds === null || memberIds.has(node._uid)),
    );
    return {
      nodes: seededNodes,
      edges: edgesWithinPedigreeMembership(
        edges,
        edgeType,
        new Set(seededNodes.map((node) => node._uid)),
        pedigreeEdgeMembership(stageMetadata),
      ),
    };
  });
  const decryptedSeed = useDecryptedNodes(seed.nodes);

  // The store holds plaintext, so the pedigree is only shown while a working
  // passphrase to encrypt with is in force and the seeded relatives are
  // decrypted through it. The store itself is kept, so a family being entered
  // survives a lock. A pedigree already open under the passphrase in force
  // stays open if that passphrase is later found not to work; committing it is
  // refused, with the reason shown, until a working one is entered.
  const locked =
    writesEncrypted && (!scope || (passphraseInvalid && openedUnder !== scope));
  const shown = !locked && store !== null && decryptedSeed.status === 'ready';

  useEffect(() => {
    if (shown) setOpenedUnder(scope);
  }, [shown, scope]);

  if (locked) return <StageNotice status="locked" />;
  if (decryptedSeed.status !== 'ready') {
    return <StageNotice status={decryptedSeed.status} />;
  }

  if (!store) {
    const seededNodes = decryptedSeed.nodes;
    setStore(
      createFamilyPedigreeStore(
        new Map(seededNodes.map((node) => [node._uid, node])),
        new Map(seed.edges.map((edge) => [edge._uid, edge])),
        new Map<string, NodeMetadata>(
          seededNodes.map((node) => [
            node._uid,
            { readOnly: node[entityAttributesProperty][egoVariable] === true },
          ]),
        ),
        variableConfig,
        dispatch,
        currentStep,
        new Set(seededNodes.map((node) => node._uid)),
        new Set(seed.edges.map((edge) => edge._uid)),
        initialFraming,
        framingConfig.mode,
        encryptedVariableIds,
      ),
    );
    return null;
  }

  return (
    <FamilyPedigreeContext.Provider value={store}>
      {children}
    </FamilyPedigreeContext.Provider>
  );
};

function StageNotice({ status }: { status: PassphraseNoticeStatus }) {
  return (
    <div className="interface">
      <PassphraseNotice status={status} className="max-w-prose" />
    </div>
  );
}
