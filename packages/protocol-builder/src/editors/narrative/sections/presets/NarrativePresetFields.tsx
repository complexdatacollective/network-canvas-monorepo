import { Plus, X } from 'lucide-react';
import { type ComponentType, type ReactNode, useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import Field from '@codaco/fresco-ui/form/Field/Field';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import { formatObjectPath } from '@codaco/fresco-ui/form/utils/objectPath';
import Section from '@codaco/fresco-ui/Section';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  createProtocolObjectId,
  isProtocolObjectId,
  type LocalizedString,
  type Stage,
} from '@codaco/protocol-validation';

import LayoutPickerField from '../../../../fields/LayoutPickerField.tsx';
import { LocalizedInputField } from '../../../../fields/LocalizedStringField.tsx';
import { FilterRuleSetField } from '../../../../fields/RuleSetField.tsx';
import UnreachableLayoutAlert, {
  useUnreachableLayoutTypes,
} from '../../../../fields/UnreachableLayoutAlert.tsx';
import VariablePickerField from '../../../../fields/VariablePickerField.tsx';
import type {
  RowEditorProps,
  RowPreviewProps,
  RowValues,
} from '../../../../form/rowDialog.tsx';
import { useStageEditorForm } from '../../../../form/stageEditorContext.ts';
import {
  asLocalizedString,
  localizedFromText,
} from '../../../../localization/localizedText.ts';
import {
  useLocalizedText,
  useProtocolLocalization,
} from '../../../../localization/ProtocolLocalization.tsx';
import type { CodebookSubject } from '../../../../protocol-context.ts';
import {
  type RowFilterClearWords,
  useRowFilterCapability,
  useRowFilterValidation,
} from '../../../../rules/rowFilter.ts';
import { isRuleSetValue } from '../../../../rules/ruleSet.ts';
import { canvasMessages } from '../../../../sections/canvas/canvasMessages.ts';
import {
  BOOLEAN_TYPES,
  CATEGORICAL_TYPES,
  useEdgeTypeChoices,
  useVariableChoices,
} from '../../../../sections/canvas/codebookChoices.ts';
import OptionalTickList from '../../../../sections/canvas/OptionalTickList.tsx';
import {
  asIdList,
  asNestedIdList,
  asText,
  useStableIdList,
} from '../../../../sections/canvas/rowValues.ts';
import { useLostReferences } from '../../../../sections/canvas/useLostReferences.ts';
import { useStageNodeTypes } from '../../../../sections/useStageSubject.ts';
import { useProtocolContext } from '../../../../state/protocolContext.ts';
import { narrativePresetMessages as messages } from './narrativePresetMessages.ts';

const LABEL_FIELD = 'label';
const LAYOUT_FIELD = 'layout';
const GROUP_VARIABLE_FIELD = 'groupVariable';
const DISPLAY_EDGES_FIELD = 'edges.display';
const HIGHLIGHT_FIELD = 'highlight';
const FILTER_FIELD = 'filter';
const HIGHLIGHT_LABELS_FIELD = 'highlightLabels';
const HIGHLIGHT_ATTRIBUTES_FIELD = 'highlightAttributes';
const HIGHLIGHT_ATTRIBUTE_IDS_FIELD = 'highlightAttributeIds';
const DISPLAY_LABELS_FIELD = 'displayLabels';
const DISPLAY_IDS_FIELD = 'displayIds';

type HighlightAttribute = Readonly<{
  id: unknown;
  type: string;
  variable: string;
}>;
type HighlightEntry = Readonly<{
  id: string;
  label: unknown;
  attributes: HighlightAttribute[];
}>;
type DisplayedEdge = Readonly<{ id: unknown; type: string; label: unknown }>;

const displayedEdgesOf = (edges: unknown): DisplayedEdge[] => {
  if (typeof edges !== 'object' || edges === null) return [];
  const display: unknown = Reflect.get(edges, 'display');
  return Array.isArray(display)
    ? display.flatMap((entry: unknown) => {
        if (typeof entry !== 'object' || entry === null) return [];
        const type = asText(Reflect.get(entry, 'type'));
        return type === undefined
          ? []
          : [
              {
                id: Reflect.get(entry, 'id'),
                type,
                label: Reflect.get(entry, 'label'),
              },
            ];
      })
    : [];
};

const highlightAttributesOf = (value: unknown): HighlightAttribute[] =>
  Array.isArray(value)
    ? value.flatMap((attribute: unknown) => {
        if (typeof attribute !== 'object' || attribute === null) return [];
        const type = asText(Reflect.get(attribute, 'type'));
        const variable = asText(Reflect.get(attribute, 'variable'));
        return type === undefined || variable === undefined
          ? []
          : [{ id: Reflect.get(attribute, 'id'), type, variable }];
      })
    : [];

const highlightEntriesOf = (value: unknown): HighlightEntry[] =>
  Array.isArray(value)
    ? value.flatMap((entry: unknown) => {
        if (typeof entry !== 'object' || entry === null) return [];
        const id: unknown = Reflect.get(entry, 'id');
        return typeof id === 'string' && id !== ''
          ? [
              {
                id,
                label: Reflect.get(entry, 'label'),
                attributes: highlightAttributesOf(
                  Reflect.get(entry, 'attributes'),
                ),
              },
            ]
          : [];
      })
    : [];

const labelIn = (labels: unknown, key: string): unknown =>
  typeof labels === 'object' && labels !== null && Object.hasOwn(labels, key)
    ? Reflect.get(labels, key)
    : undefined;

/** The id a ticked entry was opened with, or a new one for a fresh tick. */
const idIn = (ids: unknown, key: string): string => {
  const id = labelIn(ids, key);
  return isProtocolObjectId(id) ? id : createProtocolObjectId();
};

/** The dialog field holding one highlight entry's attribute for one type. */
export const highlightAttributeName = (entryId: string, type: string): string =>
  formatObjectPath([HIGHLIGHT_ATTRIBUTES_FIELD, entryId, type]);

/** The dialog field holding one highlight entry's label. */
const highlightLabelName = (entryId: string): string =>
  formatObjectPath([HIGHLIGHT_LABELS_FIELD, entryId]);

/** The attribute one highlight entry of the expanded row names for `type`. */
export const highlightAttributeIn = (
  row: RowValues,
  entryId: string,
  type: string,
): string | undefined =>
  asText(labelIn(labelIn(row[HIGHLIGHT_ATTRIBUTES_FIELD], entryId), type));

/** The highlight entry ids of the expanded row, in order. */
export const highlightEntryIdsIn = (row: RowValues): string[] =>
  asIdList(row[HIGHLIGHT_FIELD]) ?? [];

/**
 * Opens a preset with its highlight entries and its drawn edge types spread
 * over slots of their own.
 *
 * The highlight list holds the entry ids. Each entry's label sits under its
 * id, and its attribute for each node type sits under its id and the type, so
 * every node type has a picker of its own. The ids of the attribute rows are
 * kept the same way, so an attribute that stays chosen keeps its id.
 *
 * The drawn edge types are held in two slots: the tick list holds the type
 * ids, and each one's legend label sits under its id. A label field then
 * comes and goes with its tick, and keeps what was typed into it while the box
 * is unticked. Keyed by id rather than by position, because a tick anywhere in
 * the list would otherwise move every label after it.
 */
export function expandNarrativePreset(row: RowValues): RowValues {
  let expanded = row;
  if (Object.hasOwn(row, HIGHLIGHT_FIELD)) {
    const entries = highlightEntriesOf(row[HIGHLIGHT_FIELD]);
    expanded = {
      ...expanded,
      [HIGHLIGHT_FIELD]: entries.map(({ id }) => id),
      [HIGHLIGHT_LABELS_FIELD]: Object.fromEntries(
        entries.map(({ id, label }) => [id, label]),
      ),
      [HIGHLIGHT_ATTRIBUTES_FIELD]: Object.fromEntries(
        entries.map(({ id, attributes }) => [
          id,
          Object.fromEntries(
            attributes.map(({ type, variable }) => [type, variable]),
          ),
        ]),
      ),
      [HIGHLIGHT_ATTRIBUTE_IDS_FIELD]: Object.fromEntries(
        entries.map(({ id, attributes }) => [
          id,
          Object.fromEntries(
            attributes.map(({ type, id: attributeId }) => [type, attributeId]),
          ),
        ]),
      ),
    };
  }
  if (typeof row.edges === 'object' && row.edges !== null) {
    const displayed = displayedEdgesOf(row.edges);
    expanded = {
      ...expanded,
      edges: { ...row.edges, display: displayed.map(({ type }) => type) },
      [DISPLAY_LABELS_FIELD]: Object.fromEntries(
        displayed.map(({ type, label }) => [type, label]),
      ),
      [DISPLAY_IDS_FIELD]: Object.fromEntries(
        displayed.map(({ type, id }) => [type, id]),
      ),
    };
  }
  return expanded;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The preset as the protocol stores it, for a stage that shows `types`: one
 * highlight entry per entry in the list, each with its label and one attribute
 * for each type that has one chosen, in the stage's type order; and one drawn
 * edge type per ticked type, in tick order, with its legend label. An entry
 * with no attribute chosen is dropped, and so is a label left behind by an id
 * that was unticked. A new entry or attribute gets an id of its own.
 */
export const collapseNarrativePresetFor =
  (types: readonly string[]) =>
  (row: RowValues): RowValues => {
    const {
      [HIGHLIGHT_FIELD]: entryIds,
      [HIGHLIGHT_LABELS_FIELD]: labels,
      [HIGHLIGHT_ATTRIBUTES_FIELD]: attributes,
      [HIGHLIGHT_ATTRIBUTE_IDS_FIELD]: attributeIds,
      [DISPLAY_LABELS_FIELD]: edgeLabels,
      [DISPLAY_IDS_FIELD]: displayIds,
      ...preset
    } = row;
    const highlight = (asIdList(entryIds) ?? []).flatMap((entryId) => {
      const chosen = types.flatMap((type) => {
        const variable = asText(labelIn(labelIn(attributes, entryId), type));
        return variable === undefined
          ? []
          : [
              {
                id: idIn(labelIn(attributeIds, entryId), type),
                type,
                variable,
              },
            ];
      });
      return chosen.length === 0
        ? []
        : [
            {
              id: entryId,
              label: labelIn(labels, entryId),
              attributes: chosen,
            },
          ];
    });
    const withHighlight =
      highlight.length === 0
        ? preset
        : { ...preset, [HIGHLIGHT_FIELD]: highlight };
    const edges = preset.edges;
    if (!isRecord(edges)) return withHighlight;
    const display = (asNestedIdList(edges, 'display') ?? []).map((type) => ({
      id: idIn(displayIds, type),
      type,
      label: labelIn(edgeLabels, type),
    }));
    const { display: _display, ...otherEdges } = edges;
    const nextEdges =
      display.length === 0 ? otherEdges : { ...otherEdges, display };
    const { edges: _edges, ...withoutEdges } = withHighlight;
    return Object.keys(nextEdges).length === 0
      ? withoutEdges
      : { ...withoutEdges, edges: nextEdges };
  };

/** What switching a preset's filter off destroys, in its own words. */
const PRESET_FILTER_CLEAR_WORDS: RowFilterClearWords = {
  title: messages.presetFilterClearTitle,
  description: messages.presetFilterClearDescription,
  confirmLabel: messages.presetFilterClearConfirm,
};

/** The picker takes an open prop bag from the field wrapper. */
const VariablePicker = VariablePickerField as ComponentType<
  Record<string, unknown>
>;

/** A tick list's choices, in the shape the control registers with. */
type TickChoice = Readonly<{ value: string; label: string }>;

type NodeTypeChoice = Readonly<{ id: string; label: string }>;

/**
 * What the interview's legend calls one drawn edge type or one highlight.
 * Codebook names are the researcher's and are never shown to participants, so
 * the preset carries translatable words; a new edge type tick starts them at
 * the codebook name, as text in the protocol's default language.
 */
function LegendLabelField({
  name,
  codebookName,
  label,
  hint,
  required,
  committed,
}: Readonly<{
  name: string;
  codebookName: string | undefined;
  label: string;
  hint: string;
  required: string;
  committed: LocalizedString | undefined;
}>) {
  const localization = useProtocolLocalization();
  // Memoized: a field's starting value is part of its registration, and a new
  // object every render would re-register it.
  const initialValue = useMemo(
    () =>
      committed ??
      (localization === undefined || codebookName === undefined
        ? undefined
        : localizedFromText(localization, codebookName)),
    [codebookName, committed, localization],
  );
  return (
    <Field<typeof LocalizedInputField>
      name={name}
      nameMode="path"
      label={label}
      hint={hint}
      component={LocalizedInputField}
      initialValue={initialValue}
      required={required}
    />
  );
}

/**
 * The attribute one highlight entry reads on nodes of one of the stage's node
 * types. On a stage that shows several types each is optional, and the
 * presets section refuses an entry that names no attribute at all.
 */
function HighlightAttributeField({
  item,
  entryId,
  nodeType,
  several,
}: Readonly<{
  item: RowValues;
  entryId: string;
  nodeType: NodeTypeChoice;
  several: boolean;
}>) {
  const intl = useAppIntl();
  const name = highlightAttributeName(entryId, nodeType.id);
  const setRowValue = useFormStore((store) => store.setFieldValue);
  const subject = useMemo<CodebookSubject>(
    () => ({ entity: 'node', type: nodeType.id }),
    [nodeType.id],
  );
  const committed = highlightAttributeIn(item, entryId, nodeType.id);
  const chosen = asText(useFormValue([name])[name]);
  const options = useVariableChoices({
    subject,
    types: BOOLEAN_TYPES,
    ...(committed === undefined ? {} : { currentValue: committed }),
  });

  return (
    <>
      <Field<typeof VariablePicker>
        name={name}
        nameMode="path"
        label={
          several
            ? intl.formatMessage(messages.presetHighlightAttributeForType, {
                nodeType: nodeType.label,
              })
            : intl.formatMessage(messages.presetHighlightAttribute)
        }
        {...(several
          ? {
              hint: intl.formatMessage(
                messages.presetHighlightAttributeHintSeveral,
              ),
            }
          : {
              required: intl.formatMessage(
                messages.presetHighlightAttributeRequired,
              ),
            })}
        component={VariablePicker}
        options={options}
        emptyMessage={intl.formatMessage(
          messages.presetHighlightAttributeEmpty,
        )}
        initialValue={committed}
      />
      {/*
        The picker cannot be emptied once an attribute is chosen, and on a
        stage that shows several types an empty picker is how a type is left
        out of the highlight.
      */}
      {several && chosen !== undefined && (
        <Button
          type="button"
          size="sm"
          variant="text"
          icon={<X aria-hidden="true" />}
          className="-mt-4 mb-8"
          onClick={() => setRowValue(name, undefined)}
        >
          {intl.formatMessage(messages.presetHighlightAttributeClear, {
            nodeType: nodeType.label,
          })}
        </Button>
      )}
    </>
  );
}

/**
 * The list of a preset's highlight entries: the entries the parent draws, and
 * a button that adds one. Its value is the entries' ids in order.
 */
function HighlightEntryList({
  value,
  onChange,
  renderEntry,
  addLabel,
  emptyMessage,
}: Readonly<{
  value?: string[];
  onChange?: (value: string[] | undefined) => void;
  renderEntry: (entryId: string, index: number) => ReactNode;
  addLabel: string;
  emptyMessage: string;
}>) {
  const ids = value ?? [];
  return (
    <div className="flex w-full flex-col items-start gap-4">
      {ids.length === 0 ? (
        <Paragraph className="text-current/70 italic">{emptyMessage}</Paragraph>
      ) : (
        ids.map((entryId, index) => renderEntry(entryId, index))
      )}
      <Button
        type="button"
        size="sm"
        icon={<Plus aria-hidden="true" />}
        onClick={() => onChange?.([...ids, createProtocolObjectId()])}
      >
        {addLabel}
      </Button>
    </div>
  );
}

/**
 * One highlight entry: its legend label, an attribute picker for each of the
 * stage's node types, and a button that removes it.
 */
function HighlightEntryFields({
  item,
  entryId,
  number,
  nodeTypes,
  onRemove,
}: Readonly<{
  item: RowValues;
  entryId: string;
  number: number;
  nodeTypes: readonly NodeTypeChoice[];
  onRemove: () => void;
}>) {
  const intl = useAppIntl();
  const several = nodeTypes.length > 1;
  const legend = intl.formatMessage(messages.presetHighlightEntryLegend, {
    number,
  });
  return (
    <fieldset className="w-full rounded border-2 p-4">
      <legend className="px-2 font-semibold">{legend}</legend>
      <LegendLabelField
        name={highlightLabelName(entryId)}
        codebookName={undefined}
        label={intl.formatMessage(messages.presetHighlightLegendLabel)}
        hint={intl.formatMessage(messages.presetHighlightLegendHint)}
        required={intl.formatMessage(messages.presetHighlightLegendRequired)}
        committed={asLocalizedString(
          labelIn(item[HIGHLIGHT_LABELS_FIELD], entryId),
        )}
      />
      {nodeTypes.map((nodeType) => (
        <HighlightAttributeField
          key={nodeType.id}
          item={item}
          entryId={entryId}
          nodeType={nodeType}
          several={several}
        />
      ))}
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="text"
          icon={<X aria-hidden="true" />}
          onClick={onRemove}
        >
          {intl.formatMessage(messages.presetHighlightEntryRemove, { number })}
        </Button>
      </div>
    </fieldset>
  );
}

/**
 * Warns when the preset's layout has no positions for some of the stage's
 * node types. Judged on the preset as it is being edited: the stage is
 * replaced, for the check, by one that reads only this preset's layout.
 */
function PresetLayoutAdvisory({ presetId }: Readonly<{ presetId: unknown }>) {
  const { identity } = useStageEditorForm();
  const nodeTypes = useStageNodeTypes();
  const layout = asText(useFormValue([LAYOUT_FIELD] as const)[LAYOUT_FIELD]);
  const draft = useMemo((): Stage | undefined => {
    const [first, ...rest] = nodeTypes;
    if (
      layout === undefined ||
      first === undefined ||
      !isProtocolObjectId(identity.id) ||
      !isProtocolObjectId(presetId)
    ) {
      return undefined;
    }
    return {
      id: identity.id,
      type: 'Narrative',
      label: {},
      subject: { entity: 'node', types: [first, ...rest] },
      background: { concentricCircles: 0 },
      presets: [{ id: presetId, label: {}, layout }],
    };
  }, [identity.id, layout, nodeTypes, presetId]);
  const unreachable = useUnreachableLayoutTypes(
    draft,
    isProtocolObjectId(presetId) ? presetId : undefined,
  );
  return layout === undefined ? null : (
    <UnreachableLayoutAlert layoutId={layout} nodeTypes={unreachable} />
  );
}

/**
 * One saved way of looking at the network.
 *
 * A preset is a whole picture the researcher switches to while the participant
 * talks: where the nodes sit, which part of the network is shown, which nodes
 * are outlined together, which connections are drawn, and which stand out.
 * The filter is the preset's own — a narrative stage has none — so two
 * presets can show different parts of the network. Every other part names a
 * codebook layout, attribute or edge type, all read live from the protocol
 * here, so a collaborator's change to the codebook changes what this dialog
 * offers without the dialog asking for it.
 *
 * On a stage that shows several node types, each highlight entry names an
 * attribute of each type, so one switch in the interview lights nodes of every
 * type; and nodes are not grouped, because groups are drawn from one type's
 * attribute.
 *
 * No writer class is claimed on either attribute control, and that is what a
 * preset IS. The narrative runtime restores positions from the preset's
 * layout with `persist: false` and passes no drag handler, reads the
 * grouping attribute to draw hulls, and reads the highlight attributes to
 * highlight nodes; there is no path on which it stores a value under any of
 * them.
 * Classed as a writer, the exclusivity rule would drop exactly the attributes
 * a narrative stage exists to look at — the boolean an alter form collects,
 * the categorical a form asks about.
 */
export function NarrativePresetFields({ item }: RowEditorProps) {
  const intl = useAppIntl();
  const nodeTypeIds = useStageNodeTypes();
  const protocolContext = useProtocolContext();
  const setRowValue = useFormStore((store) => store.setFieldValue);
  const edgeChoicesOffered = useEdgeTypeChoices();
  // The same rules a stage's own filter may hold, judged the same way: a
  // preset's filter narrows the nodes and edges it shows.
  const filterValidation = useRowFilterValidation('filter');
  const { hasRules, requestFilterOpenChange } = useRowFilterCapability(
    item[FILTER_FIELD],
    PRESET_FILTER_CLEAR_WORDS,
  );

  const nodeTypes = useMemo<NodeTypeChoice[]>(
    () =>
      nodeTypeIds.map((id) => ({
        id,
        label: protocolContext.codebook.node?.[id]?.name ?? id,
      })),
    [nodeTypeIds, protocolContext],
  );
  const [onlyType] = nodeTypeIds;
  const groupSubject = useMemo<CodebookSubject | undefined>(
    () =>
      nodeTypeIds.length === 1 && onlyType !== undefined
        ? { entity: 'node', type: onlyType }
        : undefined,
    [nodeTypeIds.length, onlyType],
  );

  const committedLayout = asText(item[LAYOUT_FIELD]);
  const committedGroup = asText(item[GROUP_VARIABLE_FIELD]);
  // Held as the same arrays while their contents do not change: a field's
  // starting value is part of its registration, and a new array every render
  // re-registers the field — which supersedes the validation a submit is
  // running and silently refuses the save.
  const committedDisplay = useStableIdList(
    asNestedIdList(item.edges, 'display'),
  );
  const committedEntries = useStableIdList(asIdList(item[HIGHLIGHT_FIELD]));

  const groupOptions = useVariableChoices({
    subject: groupSubject,
    types: CATEGORICAL_TYPES,
    ...(committedGroup === undefined ? {} : { currentValue: committedGroup }),
  });

  /**
   * The edge types this preset NAMES on its tick list, read from the field
   * rather than from the committed row.
   *
   * The list renders its boxes from the codebook, so a reference a
   * collaborator deletes simply stops being a box while its id stays in the
   * value: the control writes the whole list back on any tick, so the dangling
   * id survives every gesture and the only way out is deleting the preset. The
   * field starts from the committed value and carries every tick since, so an
   * id ticked here a moment before the deletion is covered by the same read.
   * See `useLostReferences`.
   */
  const live = useFormValue([DISPLAY_EDGES_FIELD, HIGHLIGHT_FIELD] as const);
  const displayedEdges = useMemo(
    () => asIdList(live[DISPLAY_EDGES_FIELD]) ?? [],
    [live],
  );
  const entryIds = useMemo(() => asIdList(live[HIGHLIGHT_FIELD]) ?? [], [live]);

  const knownEdgeTypes = useMemo(
    () => new Set(edgeChoicesOffered.map((option) => option.value)),
    [edgeChoicesOffered],
  );
  const lostEdgeTypes = useLostReferences(displayedEdges, knownEdgeTypes);
  const edgeTypeNames = useMemo(
    () => new Map(edgeChoicesOffered.map(({ value, label }) => [value, label])),
    [edgeChoicesOffered],
  );

  const edgeChoices = useMemo<TickChoice[]>(
    () => [
      ...edgeChoicesOffered.map(({ value, label }) => ({ value, label })),
      ...lostEdgeTypes.map((id) => ({
        value: id,
        label: intl.formatMessage(canvasMessages.missingEdgeType, {
          edgeTypeId: id,
        }),
      })),
    ],
    [edgeChoicesOffered, intl, lostEdgeTypes],
  );

  return (
    <>
      <Section title={intl.formatMessage(messages.presetIdentityTitle)}>
        <Field<typeof LocalizedInputField>
          name={LABEL_FIELD}
          label={intl.formatMessage(messages.presetNameLabel)}
          hint={intl.formatMessage(messages.presetNameHint)}
          component={LocalizedInputField}
          placeholder={intl.formatMessage(messages.presetNamePlaceholder)}
          initialValue={asLocalizedString(item[LABEL_FIELD])}
          required={intl.formatMessage(messages.presetNameRequired)}
        />
      </Section>

      <Section title={intl.formatMessage(messages.presetPositionsTitle)}>
        <Field<typeof LayoutPickerField>
          name={LAYOUT_FIELD}
          label={intl.formatMessage(messages.presetLayoutLabel)}
          hint={intl.formatMessage(messages.presetLayoutHint)}
          component={LayoutPickerField}
          initialValue={committedLayout}
          required={intl.formatMessage(messages.presetLayoutRequired)}
        />
        <PresetLayoutAdvisory presetId={item.id} />
      </Section>

      <Section
        title={intl.formatMessage(messages.presetFilterTitle)}
        description={intl.formatMessage(messages.presetFilterDescription)}
        // Optional, and most presets have none — an unfiltered preset shows
        // the whole network, which is what its absence means — so it is a
        // switch like a side panel's filter rather than an empty rule builder
        // every preset opens on.
        toggleable
        defaultOpen={hasRules}
        onOpenChange={requestFilterOpenChange}
      >
        <Field<typeof FilterRuleSetField>
          name={FILTER_FIELD}
          component={FilterRuleSetField}
          label={intl.formatMessage(messages.presetFilterRulesLabel)}
          hint={intl.formatMessage(messages.presetFilterRulesHint)}
          initialValue={
            isRuleSetValue(item[FILTER_FIELD]) ? item[FILTER_FIELD] : undefined
          }
          {...filterValidation}
        />
      </Section>

      <Section
        title={intl.formatMessage(messages.presetGroupingTitle)}
        description={intl.formatMessage(messages.presetGroupingDescription)}
      >
        {nodeTypes.length > 1 ? (
          <Paragraph>
            {intl.formatMessage(messages.presetGroupNeedsOneType)}
          </Paragraph>
        ) : (
          <Field<typeof VariablePicker>
            name={GROUP_VARIABLE_FIELD}
            label={intl.formatMessage(messages.presetGroupLabel)}
            hint={intl.formatMessage(messages.presetGroupHint)}
            component={VariablePicker}
            options={groupOptions}
            emptyMessage={intl.formatMessage(messages.presetGroupEmpty)}
            initialValue={committedGroup}
          />
        )}
      </Section>

      <Section
        title={intl.formatMessage(messages.presetConnectionsTitle)}
        description={intl.formatMessage(messages.presetConnectionsDescription)}
      >
        <Field<typeof OptionalTickList>
          name={DISPLAY_EDGES_FIELD}
          label={intl.formatMessage(messages.presetDisplayEdgesLabel)}
          hint={intl.formatMessage(messages.presetDisplayEdgesHint)}
          component={OptionalTickList}
          options={edgeChoices}
          initialValue={committedDisplay}
        />
        {displayedEdges.map((type) => {
          const typeName = edgeTypeNames.get(type) ?? type;
          return (
            <LegendLabelField
              key={type}
              name={formatObjectPath([DISPLAY_LABELS_FIELD, type])}
              codebookName={typeName}
              label={intl.formatMessage(messages.presetEdgeLegendLabel, {
                edgeType: typeName,
              })}
              hint={intl.formatMessage(messages.presetEdgeLegendHint)}
              required={intl.formatMessage(messages.presetEdgeLegendRequired)}
              committed={asLocalizedString(
                labelIn(item[DISPLAY_LABELS_FIELD], type),
              )}
            />
          );
        })}
      </Section>

      <Section
        title={intl.formatMessage(messages.presetHighlightTitle)}
        description={intl.formatMessage(
          nodeTypes.length > 1
            ? messages.presetHighlightDescriptionSeveral
            : messages.presetHighlightDescription,
        )}
      >
        <Field<typeof HighlightEntryList>
          name={HIGHLIGHT_FIELD}
          label={intl.formatMessage(messages.presetHighlightLabel)}
          component={HighlightEntryList}
          initialValue={committedEntries}
          addLabel={intl.formatMessage(messages.presetHighlightAdd)}
          emptyMessage={intl.formatMessage(messages.presetHighlightEmptyState)}
          renderEntry={(entryId: string, index: number) => (
            <HighlightEntryFields
              key={entryId}
              item={item}
              entryId={entryId}
              number={index + 1}
              nodeTypes={nodeTypes}
              onRemove={() =>
                setRowValue(
                  HIGHLIGHT_FIELD,
                  entryIds.filter((id) => id !== entryId),
                )
              }
            />
          )}
        />
      </Section>
    </>
  );
}

/** How one preset reads in the list when its dialog is closed. */
export function NarrativePresetPreview({ item }: RowPreviewProps) {
  const intl = useAppIntl();
  const localize = useLocalizedText();
  const label = localize(item[LABEL_FIELD]);
  return label.text === '' ? (
    <span className="py-2">
      {intl.formatMessage(messages.presetUnnamedPreview)}
    </span>
  ) : (
    <span className="py-2" lang={label.lang} dir={label.dir}>
      {label.text}
    </span>
  );
}
