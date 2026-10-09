'use client';

import { RadioGroup } from '@base-ui/react/radio-group';
import { createSelector } from '@reduxjs/toolkit';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { type RefObject, useCallback, useMemo, useState } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from '@codaco/fresco-ui/Accordion';
import { RadioItem } from '@codaco/fresco-ui/form/fields/RadioGroup';
import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';
import {
  SegmentedToolbar,
  ToolbarButton,
  ToolbarGroup,
  ToolbarIconButton,
  ToolbarPopover,
} from '@codaco/fresco-ui/SegmentedToolbar';
import type {
  LocalizedString,
  Stage,
  VariableOption,
  VariableOptionValue,
} from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { useStageSelector } from '../../hooks/useStageSelector';
import { LocalizedText } from '../../localization/LocalizedText';
import { useResolveLocalizedString } from '../../localization/ProtocolLocalizationProvider';
import { useContentFormat } from '../../localization/useContentFormat';
import { getNetworkNodes, getSubjectType } from '../../selectors/session';
import { getCodebook } from '../../store/modules/protocol';
import { compareAsText } from '../../utils/compareCodeUnits';
import { interfaceMessages } from '../messages';

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
  resolveText: (label: LocalizedString) => string,
  collator: Intl.Collator,
): GroupLegendEntry[] {
  const known = categoricalOptions.map((option, index) => ({
    label: resolveText(option.label),
    colorIndex: index + 1,
  }));

  const knownValues = new Set(categoricalOptions.map((option) => option.value));
  // Colours are handed out in a language-independent order (the one the hulls
  // use), so a value keeps its colour when the participant changes language.
  // The legend itself is read, so it is listed in the reader's alphabetical
  // order.
  const extraValues = [
    ...new Set(groupValues.filter((value) => !knownValues.has(value))),
  ].toSorted(compareAsText);

  const extra = extraValues
    .map((value, index) => ({
      label: String(value),
      colorIndex: categoricalOptions.length + 1 + index,
    }))
    .toSorted((a, b) => collator.compare(a.label, b.label));

  return [...known, ...extra];
}

const SECTION_ATTRIBUTES = 'attributes';
const SECTION_LINKS = 'links';
const SECTION_GROUPS = 'groups';

type PresetSwitcherProps = {
  presets: Preset[];
  /** The stage's words for the headings of the panel's sections. */
  headings: Readonly<{
    attributes: string | undefined;
    links: string | undefined;
    groups: string | undefined;
  }>;
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
  headings,
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
  const intl = useAppIntl();
  const resolve = useResolveLocalizedString();
  const { collator } = useContentFormat();
  const currentPreset = presets[activePreset];

  const selector = useMemo(
    () =>
      createSelector(
        getCodebook,
        getSubjectType,
        getNetworkNodes,
        (codebook, subjectType, nodes) => {
          const edges = (currentPreset?.edges?.display ?? []).map(
            (type: string) => ({
              label: codebook?.edge?.[type]?.label,
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
              variable?.type === 'categorical' || variable?.type === 'ordinal'
                ? variable.options
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

          return { categoricalOptions, groupValues, edges };
        },
      ),
    [currentPreset],
  );

  const { categoricalOptions, groupValues, edges } = useStageSelector(selector);
  const highlights = currentPreset?.highlight ?? [];

  const groupLegend = useMemo(
    () =>
      buildGroupLegend(
        categoricalOptions ?? [],
        groupValues,
        (label) => resolve(label).text,
        collator,
      ),
    [categoricalOptions, groupValues, resolve, collator],
  );

  const hasHighlights = highlights.length > 0;
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

  return (
    <SegmentedToolbar
      aria-label={intl.formatMessage(interfaceMessages.presets)}
      size="lg"
      draggable
      dragConstraints={dragConstraints}
      dragHandleLabel={intl.formatMessage(interfaceMessages.dragToReposition)}
      className="absolute right-10 bottom-10 z-10"
    >
      <ToolbarGroup
        aria-label={intl.formatMessage(interfaceMessages.presetNavigation)}
      >
        <ToolbarIconButton
          aria-label={intl.formatMessage(interfaceMessages.previousPreset)}
          tooltip={false}
          icon={<ChevronLeft />}
          disabled={activePreset === 0}
          onClick={() => onChangePreset(activePreset - 1)}
        />
        <ToolbarPopover
          open={popoverOpen}
          onOpenChange={(open, event) => {
            if (!open && event.reason !== 'trigger-press') return;
            setPopoverOpen(open);
          }}
          trigger={
            // A deliberately quieter `aria-expanded` treatment than the one
            // `Button` gives every disclosure by default.
            //
            // That default — a solid `--selected` fill, which the interview
            // theme resolves to pure WHITE, with contrast-flipped text — is
            // sized for a TRANSIENT state: the brief moment a menu or popover
            // is open. This popover is different. It opens itself on mount
            // (`useState(true)` above) and a researcher normally leaves it
            // open for the whole stage, so `aria-expanded` here is the
            // RESTING state of the control, not a flash of one. At full
            // strength it reads as the loudest thing on the canvas and
            // competes with the network the participant is meant to be
            // looking at.
            //
            // So: keep the fill, drop it to a tint, and keep the toolbar's own
            // text colour instead of flipping to `--selected-contrast`. The
            // segment still reads as active and still looks pressable; it just
            // stops shouting. Scoped to this trigger on purpose — every other
            // disclosure in the app is transient and wants the default.
            <ToolbarButton className="aria-expanded:bg-selected/15 aria-expanded:text-(--component-text)">
              <LocalizedText value={currentPreset.label} render={<span />} />
            </ToolbarButton>
          }
          contentProps={{
            align: 'center',
            sideOffset: 14,
            className: 'min-w-2xs',
          }}
        >
          <Accordion
            multiple
            value={accordionValue}
            onValueChange={handleAccordionValueChange}
          >
            {hasHighlights && headings.attributes !== undefined && (
              <AccordionItem value={SECTION_ATTRIBUTES}>
                <AccordionHeader>
                  <AccordionTrigger>{headings.attributes}</AccordionTrigger>
                </AccordionHeader>
                <AccordionPanel>
                  <RadioGroup
                    value={String(highlightIndex)}
                    onValueChange={(v) => onChangeHighlightIndex(Number(v))}
                    className="flex flex-col gap-2"
                  >
                    {highlights.map((highlight, index) => {
                      const radioId = `highlight-radio-${index}`;
                      return (
                        <RadioItem
                          key={index}
                          id={radioId}
                          value={String(index)}
                          label={resolve(highlight.label).text}
                        />
                      );
                    })}
                  </RadioGroup>
                </AccordionPanel>
              </AccordionItem>
            )}

            {hasEdges && headings.links !== undefined && (
              <AccordionItem value={SECTION_LINKS}>
                <AccordionHeader>
                  <AccordionTrigger>{headings.links}</AccordionTrigger>
                </AccordionHeader>
                <AccordionPanel>
                  <div className="flex flex-col gap-2">
                    {edges.map((edge, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-4 text-base"
                      >
                        <EdgeSwatch color={edge.color} />
                        {edge.label && (
                          <LocalizedText value={edge.label} render={<span />} />
                        )}
                      </div>
                    ))}
                  </div>
                </AccordionPanel>
              </AccordionItem>
            )}

            {hasGroups && headings.groups !== undefined && (
              <AccordionItem value={SECTION_GROUPS}>
                <AccordionHeader>
                  <AccordionTrigger>{headings.groups}</AccordionTrigger>
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
        </ToolbarPopover>
        <ToolbarIconButton
          aria-label={intl.formatMessage(interfaceMessages.nextPreset)}
          tooltip={false}
          icon={<ChevronRight />}
          disabled={activePreset + 1 === presets.length}
          onClick={() => onChangePreset(activePreset + 1)}
        />
      </ToolbarGroup>
    </SegmentedToolbar>
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
