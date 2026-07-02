'use client';

import { createSelector } from '@reduxjs/toolkit';
import {
  type ComponentPropsWithoutRef,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Button } from '@codaco/fresco-ui/Button';
import Icon from '@codaco/fresco-ui/Icon';
import Node from '@codaco/fresco-ui/Node';
import type { NodeShape } from '@codaco/fresco-ui/Node';
import { ResizableFlexPanel } from '@codaco/fresco-ui/ResizableFlexPanel';
import type { Codebook } from '@codaco/protocol-validation';
import type { NcEdge, NcNode } from '@codaco/shared-consts';
import { useNodeMeasurement } from '~/hooks/useNodeMeasurement';
import { useStageSelector } from '~/hooks/useStageSelector';
import PedigreeLayout from '~/interfaces/FamilyPedigree/pedigree-layout/components/PedigreeLayout';
import { computeNodeDisplayLabels } from '~/interfaces/FamilyPedigree/pedigree-layout/components/PedigreeNode';
import { dimColor } from '~/interfaces/FamilyPedigree/pedigree-layout/dimColor';
import type { VariableConfig } from '~/interfaces/FamilyPedigree/store';
import {
  getNetworkEdges,
  getNetworkNodes,
  resolveNodeShape,
} from '~/selectors/session';
import { getCodebook, getStages } from '~/store/modules/protocol';
import type { StageProps } from '~/types';

import { PedigreeSnapshotDocument } from '../export/PedigreeSnapshotDocument';
import { exportSnapshot } from '../export/snapshot';
import {
  computeAtRiskHomozygous,
  computeStatuses,
} from '../genetics/computeStatuses';
import { buildGeneticGraph } from '../genetics/geneticGraph';
import { resolveSex } from '../genetics/resolveSex';
import {
  affectedSet,
  AT_RISK_HOMOZYGOUS_LABEL,
  STATUS_LABELS,
  type Status,
} from '../genetics/status';
import { computeContributors } from '../highlight';
import ConditionPanel from './ConditionPanel';
import { Sticker } from './Sticker';

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
  // While true, the off-screen printable snapshot document is mounted so it can
  // be captured to a PNG (see the capture effect below).
  const [isCapturing, setIsCapturing] = useState(false);

  const viewRef = useRef<HTMLDivElement>(null);
  const snapshotRef = useRef<HTMLDivElement>(null);
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

  // Display gate for the at-risk (probabilistic) notation. The genetics engine
  // always emits the at-risk statuses + homozygous flag; this transform decides
  // whether they are shown. When the researcher leaves the option off (default),
  // the two at-risk statuses collapse to `unknown` and the homozygous flag is
  // forced false, so no "?" glyphs are drawn anywhere — and because every
  // downstream consumer (stickers, single-condition node, screen-reader summary,
  // aria-live) reads from these displayed maps, the spoken summary never
  // announces a status the participant cannot see. The engine output is left
  // untouched (it still feeds the inheritance-aware focal highlighting below).
  const showAtRiskStatuses = stage.showAtRiskStatuses ?? false;

  const displayedStatusesByDisease = useMemo(() => {
    if (showAtRiskStatuses) return statusesByDisease;
    const map = new Map<string, Map<string, Status>>();
    for (const [diseaseId, statuses] of statusesByDisease) {
      const displayed = new Map<string, Status>();
      for (const [nodeId, status] of statuses) {
        displayed.set(
          nodeId,
          status === 'atRiskAffected' || status === 'atRiskCarrier'
            ? 'unknown'
            : status,
        );
      }
      map.set(diseaseId, displayed);
    }
    return map;
  }, [showAtRiskStatuses, statusesByDisease]);

  const displayedHomozygousByDisease = useMemo(() => {
    if (showAtRiskStatuses) return statusesByDiseaseHomozygous;
    return new Map<string, Map<string, boolean>>();
  }, [showAtRiskStatuses, statusesByDiseaseHomozygous]);

  // Focal highlighting (which relatives contribute to a person's inheritance)
  // is an analytical relationship, not a displayed status — keep it driven by
  // the full engine output so it is unaffected by the display gate. The walk is
  // inheritance-pattern-aware, so it follows each shown disease's true source
  // line (e.g. a son's X-linked allele up the maternal line only).
  const highlight = useMemo(() => {
    if (!graph) return { nodes: new Set<string>(), edges: new Set<string>() };
    const diseaseContributors = shownDiseases.map((disease) => ({
      pattern: disease.inheritancePattern,
      statuses: statusesByDisease.get(disease.id) ?? new Map<string, Status>(),
    }));
    return computeContributors(
      focalId,
      graph,
      diseaseContributors,
      resolveSexFn,
    );
  }, [graph, focalId, shownDiseases, statusesByDisease, resolveSexFn]);

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
    // displayLabels already prefers the person's name (collected by the
    // FamilyPedigree) and falls back to a derived relationship label.
    return displayLabels.get(node.id) ?? '';
  };

  // Plain-text per-node disease-status summary for screen readers. The visual
  // status markers (stickers / classic notation) are aria-hidden, so this is the
  // only way a screen-reader user learns who is affected/carrier/at-risk. It
  // mirrors whatever is currently shown (all diseases, or a single selected one)
  // and is announced via aria-describedby on the focal container. Returns null
  // when there are no diseases to describe.
  const statusSummaryFor = (node: RenderableNode): string | null => {
    if (shownDiseases.length === 0) return null;
    const parts = shownDiseases.map((disease) => {
      const status =
        displayedStatusesByDisease.get(disease.id)?.get(node.id) ?? 'unknown';
      const atRiskHomozygous =
        displayedHomozygousByDisease.get(disease.id)?.get(node.id) ?? false;
      const statusText = STATUS_LABELS[status];
      // An affected recessive individual trivially has two carrier parents, so
      // the homozygous flag is set for them too — but announcing "Affected, at
      // risk of being affected" is contradictory. Drop the note once the person
      // is already affected so the spoken summary stays coherent.
      const alreadyAffected =
        status === 'affected' || status === 'obligateAffected';
      return atRiskHomozygous && !alreadyAffected
        ? `${disease.label}: ${statusText}, ${AT_RISK_HOMOZYGOUS_LABEL}`
        : `${disease.label}: ${statusText}`;
    });
    return parts.join('. ');
  };

  // Trigger a capture by mounting the off-screen snapshot document; the capture
  // effect below reads it once it has laid out.
  const handleSnapshot = () => setIsCapturing(true);

  const renderNode = (node: RenderableNode): ReactNode => {
    const shape = resolveShape(node);
    const label = labelFor(node);
    const dimmed = !highlight.nodes.has(node.id);
    const isSelected = node.id === focalId;

    // With no condition selected the pedigree shows plain nodes. Selecting a
    // condition (from the key) switches to that condition's notation view.
    const selectedDisease =
      selectedDiseaseId !== null
        ? shownDiseases.find((d) => d.id === selectedDiseaseId)
        : undefined;
    const inner = selectedDisease ? (
      renderSingleCondition(
        node,
        shape,
        label,
        selectedDisease,
        dimmed,
        isSelected,
      )
    ) : (
      <Node label={label} shape={shape} size="sm" selected={isSelected} />
    );

    const statusSummary = statusSummaryFor(node);
    const statusSummaryId = statusSummary ? `np-status-${node.id}` : undefined;

    // Focusing a person highlights who contributes to THEIR inheritance of the
    // SELECTED condition, so it is only meaningful once a condition is chosen
    // from the key. Until then the focal affordance is disabled.
    const focalEnabled = selectedDiseaseId !== null;

    const handleClick = (event: MouseEvent) => {
      if (!focalEnabled) return;
      event.stopPropagation();
      setFocalId(node.id);
    };

    // The focal affordance lives on the container, not a wrapping <button>:
    // the fresco-ui Node is itself a <button>, and a <button> inside a <button>
    // is invalid HTML. role="button" + key handling keeps it accessible while
    // the inner Node button stays tabIndex=-1.
    //
    // aria-describedby points at the visually-hidden status summary so the
    // person's disease status is announced after their name. The container's
    // aria-label provides the name, so the summary need not repeat it.
    //
    // stopPropagation in onClick prevents the background scroll-container
    // handler from also firing and immediately clearing the focal selection.
    const focalProps: ComponentPropsWithoutRef<'div'> = {
      'role': 'button',
      'tabIndex': 0,
      'aria-label': `Focus on ${label || node.id}`,
      'aria-describedby': statusSummaryId,
      // Disabled (but still announced, with its status) until a condition is
      // chosen — focusing only makes sense for a single shown condition.
      'aria-disabled': focalEnabled ? undefined : true,
      'onClick': handleClick,
      'onKeyDown': (event) => {
        if (focalEnabled && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          setFocalId(node.id);
        }
      },
    };

    return (
      <div
        data-pedigree-member="true"
        data-node-id={node.id}
        data-dimmed={dimmed ? 'true' : 'false'}
        className={focalEnabled ? 'cursor-pointer' : undefined}
        {...focalProps}
      >
        {statusSummary && (
          <span id={statusSummaryId} className="sr-only">
            {statusSummary}
          </span>
        )}
        {inner}
      </div>
    );
  };

  // Single-condition node: a large white-backed Sticker drawing the selected
  // disease's status in standard pedigree notation, with the participant label
  // absolutely positioned below so it overflows into the row gap without
  // shifting the symbol's centre within the layout cell (where connectors
  // attach). The symbol is aria-hidden; the focal container carries the name and
  // the per-node status summary.
  const renderSingleCondition = (
    node: RenderableNode,
    shape: NodeShape,
    label: string,
    disease: Disease,
    dimmed: boolean,
    selected: boolean,
  ): ReactNode => {
    const status =
      displayedStatusesByDisease.get(disease.id)?.get(node.id) ?? 'unknown';
    const atRiskHomozygous =
      displayedHomozygousByDisease.get(disease.id)?.get(node.id) ?? false;
    const color = dimmed ? dimColor(disease.color) : disease.color;
    // The symbol is drawn smaller than the layout cell (which is sized for a
    // plain node) so it reads in proportion with the plain-node view. It centres
    // in the cell, so connectors still meet the cell centre.
    return (
      <div className="relative inline-flex size-24 items-center justify-center">
        {/* The single-condition node is a bare notation symbol (no fresco-ui
            Node), so it has no built-in selected ring — a selection-coloured glow
            follows the symbol's silhouette for any shape when it is the focal. */}
        <span
          className="relative block size-16"
          style={
            selected
              ? {
                  filter:
                    'drop-shadow(0 0 0.5rem var(--selected)) drop-shadow(0 0 0.25rem var(--selected)) drop-shadow(0 0 0.15rem var(--selected))',
                }
              : undefined
          }
        >
          <Sticker
            status={status}
            color={color}
            shape={shape}
            size="100%"
            atRiskHomozygous={atRiskHomozygous}
            surfaceColor={dimmed ? dimColor('white') : undefined}
            nodeMode="single"
          />
          <span
            aria-hidden
            // Colour via a CSS variable so the printable snapshot document can
            // override it to a dark ink; on screen it falls back to white.
            className="absolute top-full left-1/2 mt-1 w-24 -translate-x-1/2 truncate text-center text-xs"
            style={{ color: 'var(--np-label-color, #fff)' }}
          >
            {label}
          </span>
        </span>
      </div>
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

  // Snapshot heading: the stage label, then the shown condition, then the focal
  // person when one is set — e.g. "Inheritance Pathways: Huntington's Disease —
  // inheritance for Leo".
  const snapshotTitle = useMemo(() => {
    const base = stage.label || 'Family pedigree';
    if (!selectedDiseaseLabel) return base;
    const withDisease = `${base}: ${selectedDiseaseLabel}`;
    return focalLabel
      ? `${withDisease} — inheritance for ${focalLabel}`
      : withDisease;
  }, [stage.label, selectedDiseaseLabel, focalLabel]);

  const snapshotFilename = useMemo(() => {
    const slug = snapshotTitle
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    return `${slug || 'pedigree'}.png`;
  }, [snapshotTitle]);

  // Colour the snapshot's notation key in the shown condition's colour (matching
  // the pedigree), falling back to a vivid node colour for the plain view.
  const snapshotGlyphColour = useMemo(() => {
    if (selectedDiseaseId === null) return 'var(--node-1)';
    return (
      diseases.find((d) => d.id === selectedDiseaseId)?.color ?? 'var(--node-1)'
    );
  }, [selectedDiseaseId, diseases]);

  // Capture the off-screen snapshot document once it has mounted and laid out.
  // PedigreeLayout lays out synchronously from measured dimensions, so a single
  // animation frame after the commit is enough for html-to-image to read it.
  useEffect(() => {
    if (!isCapturing) return;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      const element = snapshotRef.current;
      if (cancelled || !element) {
        setIsCapturing(false);
        return;
      }
      void exportSnapshot(element, snapshotFilename).finally(() => {
        if (!cancelled) setIsCapturing(false);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [isCapturing, snapshotFilename]);

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

      {/* Off-screen printable document, mounted only while a snapshot is being
          captured (light theme, whole pedigree at natural size, title + key). */}
      {isCapturing && (
        <PedigreeSnapshotDocument
          ref={snapshotRef}
          title={snapshotTitle}
          nodes={nodesMap}
          edges={edgesMap}
          variableConfig={variableConfig}
          nodeWidth={nodeWidth}
          nodeHeight={nodeHeight}
          renderNode={renderNode}
          highlightedNodeIds={highlight.nodes}
          highlightedEdgeKeys={highlight.edges}
          glyphColour={snapshotGlyphColour}
          keyShape="circle"
          showAtRiskStatuses={showAtRiskStatuses}
          showKey={selectedDiseaseId !== null}
        />
      )}

      {/* Visually-hidden aria-live region for announcing state changes */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {selectedDiseaseId === null
          ? 'Showing all conditions'
          : `Showing ${selectedDiseaseLabel ?? selectedDiseaseId}`}
        {focalId !== null
          ? `. Focused on ${
              focalLabel ?? focalId
            }. Showing who contributes to their inheritance.`
          : ''}
      </div>

      <ResizableFlexPanel
        reverse
        storageKey="np-key-panel"
        defaultBasis={26}
        min={16}
        max={45}
        minSizePx={300}
        className="min-h-0 w-full grow"
        aria-label="Resize the condition key panel"
      >
        {/* Key panel — the resized (first) pane. In `reverse` mode it renders on
            the right edge and holds a fixed pixel minimum (minSizePx), so it
            never collapses; when the viewport narrows the pedigree pane gives up
            space and scrolls instead. */}
        <ConditionPanel
          diseases={diseases}
          selectedDiseaseId={selectedDiseaseId}
          onSelect={(id) => {
            setSelectedDiseaseId(id);
            // Focusing requires a single shown condition; clear it on return to
            // "all conditions" so a stale focal highlight never lingers.
            if (id === null) {
              setFocalId(null);
            }
          }}
          showAtRiskStatuses={showAtRiskStatuses}
          onSnapshot={handleSnapshot}
        />

        {/* Pedigree pane — the flex (second) pane, rendered on the left. When the
            viewport is too narrow to fit the pedigree alongside the key's minimum
            width, the inner scroll container overflows horizontally and
            vertically instead of squashing the layout. `justify-center-safe`
            centres the pedigree while it fits but falls back to start alignment
            once it overflows, so the left/top edge stays scrollable. Background
            click / Escape clears the focal person; the Clear-focus control floats
            over it when one is set. */}
        <div className="relative flex min-h-0 min-w-0 grow flex-col overflow-hidden">
          <div
            ref={viewRef}
            data-narrative-pedigree-view
            role="presentation"
            className="relative flex min-h-0 w-full min-w-0 grow items-start justify-center-safe overflow-auto pt-6"
            onClick={() => setFocalId(null)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setFocalId(null);
              }
            }}
          >
            <PedigreeLayout
              nodes={nodesMap}
              edges={edgesMap}
              variableConfig={variableConfig}
              nodeWidth={nodeWidth}
              nodeHeight={nodeHeight}
              renderNode={renderNode}
              highlightedNodeIds={highlight.nodes}
              highlightedEdgeKeys={highlight.edges}
            />
          </div>
          {focalId !== null && (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
              <Button
                size="sm"
                variant="default"
                icon={
                  <Icon
                    name="RotateCcw"
                    aria-hidden="true"
                    className="size-[1em]"
                  />
                }
                className="pointer-events-auto"
                onClick={() => setFocalId(null)}
              >
                Clear focus
              </Button>
            </div>
          )}
        </div>
      </ResizableFlexPanel>
    </div>
  );
}
