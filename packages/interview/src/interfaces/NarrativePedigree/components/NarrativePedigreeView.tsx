'use client';

import { createSelector } from '@reduxjs/toolkit';
import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Button } from '@codaco/fresco-ui/Button';
import Node from '@codaco/fresco-ui/Node';
import type { NodeShape } from '@codaco/fresco-ui/Node';
import type { Codebook } from '@codaco/protocol-validation';
import type { NcEdge, NcNode } from '@codaco/shared-consts';
import ActionButton from '~/components/ActionButton';
import { useNodeMeasurement } from '~/hooks/useNodeMeasurement';
import { useStageSelector } from '~/hooks/useStageSelector';
import PedigreeLayout from '~/interfaces/FamilyPedigree/pedigree-layout/components/PedigreeLayout';
import { computeNodeDisplayLabels } from '~/interfaces/FamilyPedigree/pedigree-layout/components/PedigreeNode';
import type { VariableConfig } from '~/interfaces/FamilyPedigree/store';
import {
  getNetworkEdges,
  getNetworkNodes,
  resolveNodeShape,
} from '~/selectors/session';
import { getCodebook, getStages } from '~/store/modules/protocol';
import type { StageProps } from '~/types';

import { exportSnapshot } from '../export/snapshot';
import {
  computeAtRiskHomozygous,
  computeStatuses,
} from '../genetics/computeStatuses';
import { buildGeneticGraph } from '../genetics/geneticGraph';
import { resolveSex } from '../genetics/resolveSex';
import { affectedSet, type Status } from '../genetics/status';
import { computeContributors } from '../highlight';
import {
  ClassicNotationNode,
  type ClassicDisease,
} from './ClassicNotationNode';
import DiseaseLegend from './DiseaseLegend';
import { type DiseaseSticker, StickerNode } from './StickerNode';

type NarrativeStage = StageProps<'NarrativePedigree'>['stage'];
type Disease = NarrativeStage['diseases'][number];

type SourceStageConfig = {
  nodeType: string;
  edgeType: string;
  nodeLabelVariable: string;
  egoVariable: string;
  relationshipVariable: string;
  relationshipTypeVariable: string;
  isActiveVariable: string;
  isGestationalCarrierVariable: string;
  gameteRoleVariable: string;
  biologicalSexVariable: string;
};

/**
 * Resolves the FamilyPedigree stage referenced by `sourceStageId` and reads its
 * node/edge config, plus the node-shape definition from the codebook for that
 * stage's node type. Returns `null` when the source stage is missing or is not
 * a FamilyPedigree (a misconfigured protocol — the view then renders empty).
 */
function makeSourceConfigSelector(sourceStageId: string) {
  return createSelector(getStages, getCodebook, (stages, codebook) => {
    const source = stages.find(
      (s) => s.id === sourceStageId && s.type === 'FamilyPedigree',
    );
    if (!source || source.type !== 'FamilyPedigree') {
      return null;
    }

    const { nodeConfig, edgeConfig } = source;
    const config: SourceStageConfig = {
      nodeType: nodeConfig.type,
      edgeType: edgeConfig.type,
      nodeLabelVariable: nodeConfig.nodeLabelVariable,
      egoVariable: nodeConfig.egoVariable,
      relationshipVariable: nodeConfig.relationshipVariable,
      relationshipTypeVariable: edgeConfig.relationshipTypeVariable,
      isActiveVariable: edgeConfig.isActiveVariable,
      isGestationalCarrierVariable: edgeConfig.isGestationalCarrierVariable,
      gameteRoleVariable: edgeConfig.gameteRoleVariable,
      biologicalSexVariable: nodeConfig.biologicalSexVariable,
    };

    const shapeDefinition =
      (codebook as Codebook).node?.[nodeConfig.type]?.shape ?? null;

    return { config, shapeDefinition };
  });
}

type RenderableNode = NcNode & { id: string };

type NarrativePedigreeViewProps = {
  stage: NarrativeStage;
};

export default function NarrativePedigreeView({
  stage,
}: NarrativePedigreeViewProps) {
  const { diseases } = stage;

  const sourceConfigSelector = useMemo(
    () => makeSourceConfigSelector(stage.sourceStageId),
    [stage.sourceStageId],
  );
  const sourceConfig = useStageSelector(sourceConfigSelector);

  const allNodes = useStageSelector(getNetworkNodes);
  const allEdges = useStageSelector(getNetworkEdges);

  const [selectedDiseaseId, setSelectedDiseaseId] = useState<string | null>(
    null,
  );
  const [focalId, setFocalId] = useState<string | null>(null);

  const viewRef = useRef<HTMLDivElement>(null);
  const { nodeWidth, nodeHeight, measurementContainer } = useNodeMeasurement({
    component: <Node size="sm" />,
  });

  // Restrict the shared interview network to the source stage's own node/edge
  // types. The interview network is one shared graph, so foreign-typed entities
  // must never enter the pedigree layout or the genetics engine.
  const pedigreeNodes = useMemo<NcNode[]>(() => {
    if (!sourceConfig) return [];
    return allNodes.filter(
      (node) => node.type === sourceConfig.config.nodeType,
    );
  }, [allNodes, sourceConfig]);

  const pedigreeEdges = useMemo<NcEdge[]>(() => {
    if (!sourceConfig) return [];
    return allEdges.filter(
      (edge) => edge.type === sourceConfig.config.edgeType,
    );
  }, [allEdges, sourceConfig]);

  const resolveSexFn = useMemo(() => {
    if (!sourceConfig) return () => 'unknown' as const;
    const { config } = sourceConfig;
    return (id: string) =>
      resolveSex(id, pedigreeNodes, pedigreeEdges, {
        biologicalSexVariable: config.biologicalSexVariable,
        gameteRoleVariable: config.gameteRoleVariable,
        relationshipTypeVariable: config.relationshipTypeVariable,
      });
  }, [sourceConfig, pedigreeNodes, pedigreeEdges]);

  const graph = useMemo(() => {
    if (!sourceConfig) return null;
    return buildGeneticGraph(
      pedigreeNodes,
      pedigreeEdges,
      {
        relationshipTypeVariable: sourceConfig.config.relationshipTypeVariable,
      },
      resolveSexFn,
    );
  }, [sourceConfig, pedigreeNodes, pedigreeEdges, resolveSexFn]);

  const egoId = useMemo(() => {
    if (!sourceConfig) return undefined;
    const { egoVariable } = sourceConfig.config;
    return pedigreeNodes.find((n) => n.attributes[egoVariable] === true)?._uid;
  }, [pedigreeNodes, sourceConfig]);

  // When a disease is selected, show only that disease; otherwise show all.
  const shownDiseases = useMemo<Disease[]>(() => {
    if (selectedDiseaseId === null) return diseases;
    const found = diseases.find((d) => d.id === selectedDiseaseId);
    return found !== undefined ? [found] : diseases;
  }, [selectedDiseaseId, diseases]);

  // diseaseId → (nodeId → status) for every shown disease.
  const statusesByDisease = useMemo(() => {
    const map = new Map<string, Map<string, Status>>();
    if (!graph) return map;
    for (const disease of shownDiseases) {
      map.set(
        disease.id,
        computeStatuses(
          graph,
          affectedSet(pedigreeNodes, disease.variable),
          disease.inheritancePattern,
          resolveSexFn,
        ),
      );
    }
    return map;
  }, [graph, shownDiseases, pedigreeNodes, resolveSexFn]);

  // diseaseId → (nodeId → atRiskHomozygous) for every shown disease.
  const statusesByDiseaseHomozygous = useMemo(() => {
    const map = new Map<string, Map<string, boolean>>();
    if (!graph) return map;
    for (const disease of shownDiseases) {
      map.set(
        disease.id,
        computeAtRiskHomozygous(
          graph,
          statusesByDisease.get(disease.id) ?? new Map<string, Status>(),
          disease.inheritancePattern,
          resolveSexFn,
        ),
      );
    }
    return map;
  }, [graph, shownDiseases, resolveSexFn, statusesByDisease]);

  const highlight = useMemo(() => {
    if (!graph) return { nodes: new Set<string>(), edges: new Set<string>() };
    return computeContributors(focalId, graph, statusesByDisease);
  }, [graph, focalId, statusesByDisease]);

  const nodesMap = useMemo(
    () => new Map(pedigreeNodes.map((n) => [n._uid, n])),
    [pedigreeNodes],
  );
  const edgesMap = useMemo(
    () => new Map(pedigreeEdges.map((e) => [e._uid, e])),
    [pedigreeEdges],
  );

  const variableConfig = useMemo<VariableConfig | null>(() => {
    if (!sourceConfig) return null;
    return { ...sourceConfig.config };
  }, [sourceConfig]);

  const displayLabels = useMemo(() => {
    if (!variableConfig) return new Map<string, string>();
    return computeNodeDisplayLabels(
      nodesMap,
      edgesMap,
      variableConfig,
      'gamete',
      egoId,
    );
  }, [nodesMap, edgesMap, variableConfig, egoId]);

  const resolveShape = (node: NcNode): NodeShape => {
    if (!sourceConfig?.shapeDefinition) return 'square';
    return resolveNodeShape(sourceConfig.shapeDefinition, node.attributes);
  };

  const labelFor = (node: RenderableNode): string => {
    if (node.id === egoId) return 'You';
    return displayLabels.get(node.id) ?? '';
  };

  const handleSnapshot = () => {
    if (!viewRef.current) return;
    void exportSnapshot(viewRef.current, `${stage.label || 'pedigree'}.png`);
  };

  const renderNode = (node: RenderableNode): ReactNode => {
    const shape = resolveShape(node);
    const label = labelFor(node);
    const dimmed = !highlight.nodes.has(node.id);
    const isSelected = node.id === focalId;

    const singleDisease =
      shownDiseases.length === 1 ? shownDiseases[0] : undefined;
    const inner = singleDisease
      ? renderClassic(node, shape, label, singleDisease, isSelected)
      : renderSticker(node, shape, label, isSelected);

    const handleClick = () => {
      setFocalId(node.id);
    };

    // The focal affordance lives on the container, not a wrapping <button>:
    // the fresco-ui Node is itself a <button>, and a <button> inside a <button>
    // is invalid HTML. role="button" + key handling keeps it accessible while
    // the inner Node button stays tabIndex=-1.
    const focalProps: ComponentPropsWithoutRef<'div'> = {
      'role': 'button',
      'tabIndex': 0,
      'aria-label': `Focus on ${label || node.id}`,
      'onClick': handleClick,
      'onKeyDown': (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleClick();
        }
      },
    };

    return (
      <div
        data-pedigree-member="true"
        data-node-id={node.id}
        data-dimmed={dimmed ? 'true' : 'false'}
        className="cursor-pointer transition-opacity"
        style={{ opacity: dimmed ? 0.3 : 1 }}
        {...focalProps}
      >
        {inner}
      </div>
    );
  };

  const renderClassic = (
    node: RenderableNode,
    shape: NodeShape,
    label: string,
    disease: Disease,
    selected: boolean,
  ): ReactNode => {
    const status = statusesByDisease.get(disease.id)?.get(node.id) ?? 'unknown';
    const atRiskHomozygous =
      statusesByDiseaseHomozygous.get(disease.id)?.get(node.id) ?? false;
    const classicDisease: ClassicDisease = {
      color: disease.color,
      status,
      atRiskHomozygous,
    };
    return (
      <ClassicNotationNode
        node={node}
        disease={classicDisease}
        shape={shape}
        label={label}
        selected={selected}
      />
    );
  };

  const renderSticker = (
    node: RenderableNode,
    shape: NodeShape,
    label: string,
    selected: boolean,
  ): ReactNode => {
    const stickers: DiseaseSticker[] = shownDiseases.map((disease) => ({
      id: disease.id,
      color: disease.color,
      status: statusesByDisease.get(disease.id)?.get(node.id) ?? 'unknown',
      atRiskHomozygous:
        statusesByDiseaseHomozygous.get(disease.id)?.get(node.id) ?? false,
    }));
    return (
      <StickerNode
        label={label}
        shape={shape}
        diseases={stickers}
        selected={selected}
        onSelectDisease={setSelectedDiseaseId}
      />
    );
  };

  const selectedDiseaseLabel = useMemo(() => {
    if (selectedDiseaseId === null) return null;
    return diseases.find((d) => d.id === selectedDiseaseId)?.label ?? null;
  }, [selectedDiseaseId, diseases]);

  const focalLabel = useMemo(() => {
    if (focalId === null) return null;
    const node = pedigreeNodes.find((n) => n._uid === focalId);
    if (!node) return focalId;
    if (node._uid === egoId) return 'You';
    return displayLabels.get(node._uid) || focalId;
  }, [focalId, pedigreeNodes, displayLabels, egoId]);

  if (!sourceConfig || !variableConfig) {
    return (
      <div className="interface flex items-center justify-center p-8 text-center">
        <p>This stage references a family pedigree that could not be found.</p>
      </div>
    );
  }

  return (
    <div className="interface relative flex h-full w-full flex-col p-0">
      {measurementContainer}

      {/* Visually-hidden aria-live region for announcing state changes */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {selectedDiseaseId === null
          ? 'Showing all diseases'
          : `Showing ${selectedDiseaseLabel ?? selectedDiseaseId}`}
        {focalId !== null
          ? `. Focused on ${focalLabel ?? focalId}. Showing who contributes to their inheritance.`
          : ''}
      </div>

      <div
        ref={viewRef}
        data-narrative-pedigree-view
        className="relative flex min-h-0 w-full grow items-start justify-center overflow-auto pt-6"
      >
        <PedigreeLayout
          nodes={nodesMap}
          edges={edgesMap}
          variableConfig={variableConfig}
          nodeWidth={nodeWidth}
          nodeHeight={nodeHeight}
          renderNode={renderNode}
        />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-4 flex items-center justify-center gap-4">
        <div className="pointer-events-auto">
          <DiseaseLegend
            diseases={diseases}
            selectedDiseaseId={selectedDiseaseId}
            onSelect={setSelectedDiseaseId}
          />
        </div>
        {focalId !== null && (
          <Button
            size="sm"
            variant="outline"
            className="pointer-events-auto"
            onClick={() => setFocalId(null)}
          >
            Clear focus
          </Button>
        )}
        <ActionButton
          iconName="camera"
          aria-label="Save snapshot"
          onClick={handleSnapshot}
          className="pointer-events-auto"
        />
      </div>
    </div>
  );
}
