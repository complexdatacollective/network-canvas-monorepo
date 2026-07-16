import { RadioGroup } from '@base-ui/react/radio-group';
import { createSelector } from '@reduxjs/toolkit';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { type RefObject, useCallback, useMemo, useState } from 'react';

import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from '@codaco/fresco-ui/Accordion';
import { RadioItem } from '@codaco/fresco-ui/form/fields/RadioGroup';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@codaco/fresco-ui/Popover';
import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';
import {
  SegmentedToolbar,
  type ToolbarSegment,
} from '@codaco/fresco-ui/SegmentedToolbar';
import type {
  Stage,
  VariableOption,
  VariableOptionValue,
} from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { useStageSelector } from '../../hooks/useStageSelector';
import { getNetworkNodes, getSubjectType } from '../../selectors/session';
import { getCodebook } from '../../store/modules/protocol';

type NarrativeStage = Extract<Stage, { type: 'Narrative' }>;
type Preset = NarrativeStage['presets'][number];

type GroupLegendEntry = {
  label: string;
  colorIndex: number;
};

/**
 * Builds the convex-hull group legend. Known codebook options keep their
 * stable, 1-based colour index. Group values present on nodes but absent from
 * the option set (e.g. from external import) are appended after the known
 * options with distinct colours, so every rendered hull has a matching legend
 * entry instead of an uncoloured/unlabelled one. Out-of-codebook values are
 * sorted for a deterministic colour assignment that matches
 * `groupNodesByVariable` in ConvexHullLayer.
 */
export function buildGroupLegend(
  categoricalOptions: VariableOption[],
  groupValues: VariableOptionValue[],
): GroupLegendEntry[] {
  const known = categoricalOptions.map((option, index) => ({
    label: option.label,
    colorIndex: index + 1,
  }));

  const knownValues = new Set(categoricalOptions.map((option) => option.value));
  const extraValues = [
    ...new Set(groupValues.filter((value) => !knownValues.has(value))),
  ].toSorted((a, b) => String(a).localeCompare(String(b)));

  const extra = extraValues.map((value, index) => ({
    label: String(value),
    colorIndex: categoricalOptions.length + 1 + index,
  }));

  return [...known, ...extra];
}

const SECTION_ATTRIBUTES = 'attributes';
const SECTION_LINKS = 'links';
const SECTION_GROUPS = 'groups';

type PresetSwitcherProps = {
  presets: Preset[];
  activePreset: number;
  highlightIndex: number;
  showHighlighting: boolean;
  showEdges: boolean;
  showHulls: boolean;
  onChangePreset: (index: number) => void;
  onToggleHulls: () => void;
  onToggleEdges: () => void;
  onChangeHighlightIndex: (index: number) => void;
  onToggleHighlighting: () => void;
  dragConstraints: RefObject<HTMLElement | null>;
};

export default function PresetSwitcher({
  presets,
  activePreset,
  highlightIndex,
  showHighlighting,
  showEdges,
  showHulls,
  onChangePreset,
  onToggleHulls,
  onToggleEdges,
  onChangeHighlightIndex,
  onToggleHighlighting,
  dragConstraints,
}: PresetSwitcherProps) {
  const currentPreset = presets[activePreset];

  const selector = useMemo(
    () =>
      createSelector(
        getCodebook,
        getSubjectType,
        getNetworkNodes,
        (codebook, subjectType, nodes) => {
          const highlightLabels = (currentPreset?.highlight ?? []).map(
            (variableId: string) =>
              (subjectType &&
                codebook?.node?.[subjectType]?.variables?.[variableId]?.name) ??
              '',
          );

          const edges = (currentPreset?.edges?.display ?? []).map(
            (type: string) => ({
              label: codebook?.edge?.[type]?.name ?? '',
              color: codebook?.edge?.[type]?.color ?? 'edge-color-seq-1',
            }),
          );

          const groupVariable = currentPreset?.groupVariable;
          let categoricalOptions: VariableOption[] | undefined;
          const groupValues: VariableOptionValue[] = [];
          if (subjectType && groupVariable) {
            const variable =
              codebook?.node?.[subjectType]?.variables?.[groupVariable];
            categoricalOptions =
              variable && 'options' in variable && variable.options
                ? variable.options.filter(
                    (option): option is VariableOption =>
                      typeof option.value !== 'boolean',
                  )
                : undefined;

            for (const node of nodes) {
              const raw = node[entityAttributesProperty][groupVariable];
              if (raw == null) continue;
              for (const value of Array.isArray(raw) ? raw : [raw]) {
                if (typeof value === 'string' || typeof value === 'number') {
                  groupValues.push(value);
                }
              }
            }
          }

          return { categoricalOptions, groupValues, edges, highlightLabels };
        },
      ),
    [currentPreset],
  );

  const { categoricalOptions, groupValues, edges, highlightLabels } =
    useStageSelector(selector);

  const groupLegend = useMemo(
    () => buildGroupLegend(categoricalOptions ?? [], groupValues),
    [categoricalOptions, groupValues],
  );

  const hasHighlights = highlightLabels.length > 0;
  const hasEdges = edges.length > 0;
  const hasGroups = groupLegend.length > 0;

  // Controlled accordion: open sections correspond to enabled features
  const accordionValue = useMemo(() => {
    const value: string[] = [];
    if (showHighlighting) value.push(SECTION_ATTRIBUTES);
    if (showEdges) value.push(SECTION_LINKS);
    if (showHulls) value.push(SECTION_GROUPS);
    return value;
  }, [showHighlighting, showEdges, showHulls]);

  const handleAccordionValueChange = useCallback(
    (newValue: unknown[]) => {
      const next = new Set(newValue);
      const prev = new Set(accordionValue);

      // Toggle whichever section changed
      if (prev.has(SECTION_ATTRIBUTES) !== next.has(SECTION_ATTRIBUTES)) {
        onToggleHighlighting();
      }
      if (prev.has(SECTION_LINKS) !== next.has(SECTION_LINKS)) {
        onToggleEdges();
      }
      if (prev.has(SECTION_GROUPS) !== next.has(SECTION_GROUPS)) {
        onToggleHulls();
      }
    },
    [accordionValue, onToggleHighlighting, onToggleEdges, onToggleHulls],
  );

  const [popoverOpen, setPopoverOpen] = useState(true);

  if (!currentPreset) return null;

  // The centre label is the Popover trigger that opens the legend: it is hosted
  // inside the toolbar via the segment `render` escape hatch so its trigger
  // wiring composes with the toolbar's roving focus. Prev/next are icon-only
  // buttons (tooltip + aria-label).
  const items: ToolbarSegment[] = [
    {
      type: 'button',
      id: 'previous',
      label: 'Previous preset',
      icon: <ChevronLeft />,
      disabled: activePreset === 0,
      onClick: () => onChangePreset(activePreset - 1),
    },
    {
      type: 'button',
      id: 'label',
      label: currentPreset.label,
      showLabel: true,
      render: <PopoverTrigger />,
    },
    {
      type: 'button',
      id: 'next',
      label: 'Next preset',
      icon: <ChevronRight />,
      disabled: activePreset + 1 === presets.length,
      onClick: () => onChangePreset(activePreset + 1),
    },
  ];

  return (
    <Popover
      open={popoverOpen}
      onOpenChange={(open, event) => {
        if (!open && event.reason !== 'trigger-press') return;
        setPopoverOpen(open);
      }}
    >
      <SegmentedToolbar
        label="Presets"
        items={items}
        size="lg"
        draggable
        dragConstraints={dragConstraints}
        dragHandleLabel="Drag to reposition"
        className="absolute right-10 bottom-10 z-10"
      />
      <PopoverContent align="center" sideOffset={14} className="min-w-2xs">
        <Accordion
          multiple
          value={accordionValue}
          onValueChange={handleAccordionValueChange}
        >
          {hasHighlights && (
            <AccordionItem value={SECTION_ATTRIBUTES}>
              <AccordionHeader>
                <AccordionTrigger>Attributes</AccordionTrigger>
              </AccordionHeader>
              <AccordionPanel>
                <RadioGroup
                  value={String(highlightIndex)}
                  onValueChange={(v) => onChangeHighlightIndex(Number(v))}
                  className="flex flex-col gap-2"
                >
                  {highlightLabels.map((label, index) => {
                    const radioId = `highlight-radio-${index}`;
                    return (
                      <RadioItem
                        key={index}
                        id={radioId}
                        value={String(index)}
                        label={label}
                      />
                    );
                  })}
                </RadioGroup>
              </AccordionPanel>
            </AccordionItem>
          )}

          {hasEdges && (
            <AccordionItem value={SECTION_LINKS}>
              <AccordionHeader>
                <AccordionTrigger>Links</AccordionTrigger>
              </AccordionHeader>
              <AccordionPanel>
                <div className="flex flex-col gap-2">
                  {edges.map((edge, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-4 text-base"
                    >
                      <EdgeSwatch color={edge.color} />
                      {edge.label}
                    </div>
                  ))}
                </div>
              </AccordionPanel>
            </AccordionItem>
          )}

          {hasGroups && (
            <AccordionItem value={SECTION_GROUPS}>
              <AccordionHeader>
                <AccordionTrigger>Groups</AccordionTrigger>
              </AccordionHeader>
              <AccordionPanel>
                <div className="flex flex-col gap-2">
                  {groupLegend.map((entry, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-4 text-base"
                    >
                      <span
                        className="inline-block size-3 rounded-full"
                        style={{
                          backgroundColor: `var(--cat-${entry.colorIndex})`,
                        }}
                      />
                      <RenderMarkdown>{entry.label}</RenderMarkdown>
                    </div>
                  ))}
                </div>
              </AccordionPanel>
            </AccordionItem>
          )}
        </Accordion>
      </PopoverContent>
    </Popover>
  );
}

function EdgeSwatch({ color }: { color: string }) {
  // Codebook stores 'edge-color-seq-N', CSS variable is '--edge-N'
  const n = /\d+$/.exec(color)?.[0] ?? '1';
  return (
    <span
      className="inline-block h-0.5 w-4 rounded-full"
      style={{ backgroundColor: `var(--edge-${n})` }}
    />
  );
}
