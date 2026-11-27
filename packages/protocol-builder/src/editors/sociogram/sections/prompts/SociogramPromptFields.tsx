import { type ComponentType, useEffect, useMemo, useState } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Field from '@codaco/fresco-ui/form/Field/Field';
import RichSelectGroupField, {
  type RichSelectOption,
} from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';
import Section from '@codaco/fresco-ui/Section';
import { sociogramStage } from '@codaco/protocol-validation';
import { edgeTypeAllowsAnyPair } from '@codaco/protocol-validation/edge-type-rules';

import { DynamicTextPreview } from '../../../../fields/DynamicTextPreview.tsx';
import EntityTypePickerField from '../../../../fields/EntityTypePickerField.tsx';
import { LocalizedRichTextField } from '../../../../fields/LocalizedStringField.tsx';
import NodeTypeOrderField from '../../../../fields/NodeTypeOrderField.tsx';
import type { SortableProperty } from '../../../../fields/sortOrderOptions.ts';
import VariablePickerField from '../../../../fields/VariablePickerField.tsx';
import type {
  RowEditorProps,
  RowPreviewProps,
} from '../../../../form/rowDialog.tsx';
import { asLocalizedString } from '../../../../localization/localizedText.ts';
import { useLocalizedText } from '../../../../localization/ProtocolLocalization.tsx';
import { markdownTextShapeAt } from '../../../../localization/textShape.ts';
import {
  type CodebookSubject,
  variablesForSubject,
} from '../../../../protocol-context.ts';
import { canvasMessages } from '../../../../sections/canvas/canvasMessages.ts';
import {
  BOOLEAN_TYPE,
  BOOLEAN_TYPES,
  useEdgeTypeChoices,
  useVariableChoices,
} from '../../../../sections/canvas/codebookChoices.ts';
import OptionalTickList from '../../../../sections/canvas/OptionalTickList.tsx';
import {
  asIdList,
  asNestedIdList,
  asNestedText,
  asText,
  useStableIdList,
} from '../../../../sections/canvas/rowValues.ts';
import { useLostReferences } from '../../../../sections/canvas/useLostReferences.ts';
import { useCreateAttributeForSlot } from '../../../../sections/create-variable/useCreateAttributeForSlot.ts';
import SortOrderRows from '../../../../sections/prompts/SortOrderRows.tsx';
import { useStageNodeTypes } from '../../../../sections/useStageSubject.ts';
import { useProtocolContext } from '../../../../state/protocolContext.ts';
import { sociogramPromptMessages as messages } from './sociogramPromptMessages.ts';

const PROMPT_TEXT_SHAPE = markdownTextShapeAt(sociogramStage, [
  'prompts',
  0,
  'text',
]);

const TEXT_FIELD = 'text';
export const NODE_TYPE_ORDER_FIELD = 'nodeTypeOrder';
const DISPLAY_EDGES_FIELD = 'edges.display';
const CREATE_EDGE_FIELD = 'edges.create';
export const TASK_FIELD = 'task';
/**
 * The attribute a highlight task marks, held in the dialog under its own name.
 * The saved prompt keeps it in a highlight entry, which
 * `SociogramPromptsSection` builds from this value when the row is saved.
 */
const HIGHLIGHT_VARIABLE_FIELD = 'highlightVariable';

/**
 * The dialog field holding the highlight attribute for the stage's node type
 * at `index`. A stage that shows several node types marks an attribute of
 * each, so each type has a field of its own; the first keeps the name a
 * single-type stage uses.
 */
export const highlightFieldName = (index: number): string =>
  index === 0
    ? HIGHLIGHT_VARIABLE_FIELD
    : `${HIGHLIGHT_VARIABLE_FIELD}${index + 1}`;

/**
 * The dialog field holding the sort rules for the stage's node type at
 * `index`. The saved prompt keeps every type's rules in one `sortOrder` list,
 * each rule naming its type; `SociogramPromptsSection` splits and joins them.
 */
export const sortFieldName = (
  index: number,
): 'sortOrder' | `sortOrder${number}` =>
  index === 0 ? 'sortOrder' : `sortOrder${index + 1}`;

/** Both pickers take an open prop bag from the field wrapper. */
const VariablePicker = VariablePickerField as ComponentType<
  Record<string, unknown>
>;
const EntityTypePicker = EntityTypePickerField;

const TASK_LAYOUT = 'layout';
const TASK_HIGHLIGHT = 'highlight';
const TASK_CONNECT = 'connect';

type SociogramTask =
  | typeof TASK_LAYOUT
  | typeof TASK_HIGHLIGHT
  | typeof TASK_CONNECT;

const asTask = (value: unknown): SociogramTask | undefined =>
  value === TASK_LAYOUT || value === TASK_HIGHLIGHT || value === TASK_CONNECT
    ? value
    : undefined;

/**
 * One task this sociogram sets, and everything the canvas does while it is on
 * screen.
 *
 * A prompt is one of three tasks: the participant places nodes (layout), taps
 * nodes to mark them (highlight), or taps two nodes to connect them (connect).
 * The attributes and edge types the task names are read from the protocol
 * here, so a collaborator's change to the codebook changes what this dialog
 * offers.
 */
type NodeTypeChoice = Readonly<{ id: string; label: string }>;

type PerTypeProps = Readonly<{
  item: RowEditorProps['item'];
  index: number;
  /** Undefined while the stage has no node type yet. */
  nodeType: NodeTypeChoice | undefined;
  /** Whether the stage shows several node types. */
  several: boolean;
}>;

const subjectOf = (
  nodeType: NodeTypeChoice | undefined,
): CodebookSubject | undefined =>
  nodeType === undefined ? undefined : { entity: 'node', type: nodeType.id };

/**
 * The attribute a highlight task toggles on nodes of one of the stage's node
 * types. On a stage that shows several types each one is optional, because a
 * type the prompt does not highlight is one whose nodes cannot be tapped;
 * `SociogramPromptsSection` refuses a prompt that highlights no type at all.
 */
function HighlightField({ item, index, nodeType, several }: PerTypeProps) {
  const intl = useAppIntl();
  const name = highlightFieldName(index);
  const subject = useMemo(() => subjectOf(nodeType), [nodeType]);
  // Writes reach THIS dialog's form, not the stage's: the prompt is the
  // researcher's unsaved row until they save it.
  const setRowValue = useFormStore((store) => store.setFieldValue);
  const highlightCreate = useCreateAttributeForSlot({
    subject,
    variableType: BOOLEAN_TYPE,
    title: intl.formatMessage(messages.promptCreateHighlightLabel),
    onCreated: (variableId) => setRowValue(name, variableId),
  });
  const committed = asText(item[name]);

  // The interview writes a mark around the codebook's rules as a tap toggles
  // it, so the attribute may not be one a form field collects.
  const options = useVariableChoices({
    subject,
    types: BOOLEAN_TYPES,
    writerClass: 'unvalidated',
    ...(committed === undefined ? {} : { currentValue: committed }),
  });

  return (
    <>
      <Field<typeof VariablePicker>
        name={name}
        label={
          several && nodeType !== undefined
            ? intl.formatMessage(messages.promptHighlightLabelForType, {
                nodeType: nodeType.label,
              })
            : intl.formatMessage(messages.promptHighlightLabel)
        }
        hint={intl.formatMessage(
          several
            ? messages.promptHighlightHintSeveral
            : messages.promptHighlightHint,
        )}
        component={VariablePicker}
        options={options}
        emptyMessage={intl.formatMessage(messages.promptHighlightEmpty)}
        initialValue={committed}
        {...(several
          ? {}
          : { required: intl.formatMessage(messages.promptHighlightRequired) })}
        {...highlightCreate.createProps}
      />
      {highlightCreate.editor}
    </>
  );
}

/**
 * The rules that order the unplaced nodes of one of the stage's node types.
 *
 * The package's shared sort-order group, told which key this type's rules
 * are kept at. What a sort order IS — an ordered list of property-and-direction
 * rules, cleared altogether by closing the group, and refused while a rule
 * still names an attribute the codebook has lost — is the same question a bin
 * or a census prompt asks. What the sociogram owns is the key, the attributes
 * on offer and the words.
 *
 * `properties` is therefore the LIVE codebook and nothing else. Folding a
 * deleted attribute into it would read as a fix and be a regression: the
 * shared helper judges "no longer in the codebook" against exactly this list.
 * It is `undefined` until the stage has been told WHAT it collects, which
 * `SortOrderRows` reads as "this family does not know its properties yet".
 */
function TypeSortRows({ item, index, nodeType, several }: PerTypeProps) {
  const intl = useAppIntl();
  const protocolContext = useProtocolContext();
  const name = sortFieldName(index);
  const sortableProperties = useMemo<SortableProperty[] | undefined>(() => {
    const subject = subjectOf(nodeType);
    return subject === undefined
      ? undefined
      : Object.entries(variablesForSubject(protocolContext, subject)).map(
          ([value, variable]) => ({ value, label: variable.name }),
        );
  }, [nodeType, protocolContext]);

  return (
    <SortOrderRows
      name={name}
      title={
        several && nodeType !== undefined
          ? intl.formatMessage(messages.promptSortTitleForType, {
              nodeType: nodeType.label,
            })
          : intl.formatMessage(messages.promptSortTitle)
      }
      description={intl.formatMessage(messages.promptSortDescription)}
      label={intl.formatMessage(messages.promptSortLabel)}
      addButtonLabel={intl.formatMessage(messages.promptSortAddLabel)}
      emptyStateMessage={intl.formatMessage(messages.promptSortEmptyState)}
      properties={sortableProperties}
      committedRules={item[name]}
    />
  );
}

/**
 * One task this sociogram sets, and everything the canvas does while it is on
 * screen.
 *
 * A prompt is one of three tasks: the participant places nodes (layout), taps
 * nodes to mark them (highlight), or taps two nodes to connect them (connect).
 * The attributes and edge types the task names are read from the protocol
 * here, so a collaborator's change to the codebook changes what this dialog
 * offers. On a stage that shows several node types, the highlight attribute
 * and the sort rules are set for each type, and the order the types are
 * handed over in is set too.
 */
export function SociogramPromptFields({ item }: RowEditorProps) {
  const intl = useAppIntl();
  const nodeTypeIds = useStageNodeTypes();
  const protocolContext = useProtocolContext();
  const setRowValue = useFormStore((store) => store.setFieldValue);
  const edgeChoicesOffered = useEdgeTypeChoices();

  const nodeTypes = useMemo<NodeTypeChoice[]>(
    () =>
      nodeTypeIds.map((id) => ({
        id,
        label: protocolContext.codebook.node?.[id]?.name ?? id,
      })),
    [nodeTypeIds, protocolContext],
  );
  const several = nodeTypes.length > 1;
  // A stage with no node type yet still shows one picker and one sort group,
  // which wait for it.
  const perType: (NodeTypeChoice | undefined)[] =
    nodeTypes.length === 0 ? [undefined] : nodeTypes;

  // An edge type whose endpoint rules allow no pair of the stage's node types
  // could never be drawn here, so it is not offered.
  const offerEdgeType = useMemo(
    () =>
      nodeTypeIds.length === 0
        ? undefined
        : (edgeType: string) =>
            edgeTypeAllowsAnyPair(
              protocolContext.codebook,
              edgeType,
              nodeTypeIds,
            ),
    [nodeTypeIds, protocolContext],
  );
  const committedNodeTypeOrder = useStableIdList(
    asIdList(item[NODE_TYPE_ORDER_FIELD]),
  );

  // Held as the same array while its contents do not change: a field's
  // starting value is part of its registration, and a new array every render
  // re-registers the field — which supersedes the validation a submit is
  // running and silently refuses the save.
  const committedDisplay = useStableIdList(
    asNestedIdList(item.edges, 'display'),
  );
  const committedCreate = asNestedText(item.edges, 'create');
  const committedTask = asTask(item[TASK_FIELD]) ?? TASK_LAYOUT;

  const live = useFormValue([
    TASK_FIELD,
    CREATE_EDGE_FIELD,
    DISPLAY_EDGES_FIELD,
  ] as const);
  const task = asTask(live[TASK_FIELD]) ?? committedTask;
  const createdEdge =
    task === TASK_CONNECT ? asText(live[CREATE_EDGE_FIELD]) : undefined;
  const displayedEdges = useMemo(
    () =>
      Array.isArray(live[DISPLAY_EDGES_FIELD])
        ? live[DISPLAY_EDGES_FIELD].filter(
            (entry): entry is string => typeof entry === 'string',
          )
        : [],
    [live],
  );

  /**
   * Whether the connection this prompt draws was chosen HERE, in this dialog.
   *
   * The two rules below hang on it, and both are about a choice the researcher
   * has just made rather than about the prompt they opened. Held as state
   * rather than a ref because it is rendered: the notice and the locked tick
   * box are what the rule looks like on screen.
   */
  const [drawChosenHere, setDrawChosenHere] = useState(false);
  // Latched as soon as a connection other than the stored one is chosen, and
  // adjusted during render rather than in an effect: the notice and the locked
  // tick box it shows must not trail the choice by a frame.
  if (
    !drawChosenHere &&
    createdEdge !== undefined &&
    createdEdge !== committedCreate
  ) {
    setDrawChosenHere(true);
  }

  /**
   * A connection the researcher has just said this prompt draws is shown too.
   *
   * Drawing a connection the participant cannot see is not what somebody
   * picking a connection type here can have meant, and the interview draws it
   * regardless of the tick list.
   *
   * Only that choice, though. A prompt STORED as `create` with an empty
   * `display` is a real and deliberate configuration — the interview filters
   * the ties it renders strictly by `edges.display`, and the
   * `edges-full-matrix` end-to-end scenario collects a tie without showing it
   * on exactly that shape — so an effect that ran on mount would make merely
   * opening a prompt and saving it change what the participant sees.
   */
  useEffect(() => {
    if (!drawChosenHere) return;
    if (createdEdge === undefined) return;
    if (displayedEdges.includes(createdEdge)) return;
    setRowValue(DISPLAY_EDGES_FIELD, [...displayedEdges, createdEdge]);
  }, [createdEdge, displayedEdges, drawChosenHere, setRowValue]);

  /**
   * The connection types on offer, plus the ones this prompt names and the
   * codebook has lost.
   *
   * Named is read from the field, which starts at the committed value and
   * carries every tick since, so a type ticked in this dialog and deleted by a
   * collaborator a moment later is lost the same way as one the prompt arrived
   * with — see `useLostReferences`.
   */
  const knownEdgeTypes = useMemo(
    () => new Set(edgeChoicesOffered.map((option) => option.value)),
    [edgeChoicesOffered],
  );
  const lostEdgeTypes = useLostReferences(displayedEdges, knownEdgeTypes);

  const edgeChoices = useMemo(() => {
    const offered = edgeChoicesOffered.map((option) =>
      drawChosenHere && option.value === createdEdge
        ? { value: option.value, label: option.label, disabled: true }
        : { value: option.value, label: option.label },
    );
    if (lostEdgeTypes.length === 0) return offered;
    return [
      ...offered,
      ...lostEdgeTypes.map((id) => ({
        value: id,
        label: intl.formatMessage(canvasMessages.missingEdgeType, {
          edgeTypeId: id,
        }),
      })),
    ];
  }, [createdEdge, drawChosenHere, edgeChoicesOffered, intl, lostEdgeTypes]);

  // Held for as long as the reader's language does not change: the control's
  // options are part of what it registers with, and a fresh array every render
  // re-registers it.
  const taskOptions = useMemo<RichSelectOption[]>(
    () => [
      {
        value: TASK_LAYOUT,
        label: intl.formatMessage(messages.taskLayoutLabel),
        description: intl.formatMessage(messages.taskLayoutDescription),
      },
      {
        value: TASK_HIGHLIGHT,
        label: intl.formatMessage(messages.taskHighlightLabel),
        description: intl.formatMessage(messages.taskHighlightDescription),
      },
      {
        value: TASK_CONNECT,
        label: intl.formatMessage(messages.taskConnectLabel),
        description: intl.formatMessage(messages.taskConnectDescription),
      },
    ],
    [intl],
  );

  return (
    <>
      <Section
        title={intl.formatMessage(messages.promptTextTitle)}
        description={intl.formatMessage(messages.promptTextSectionDescription)}
      >
        <Field<typeof LocalizedRichTextField>
          name={TEXT_FIELD}
          label={intl.formatMessage(messages.promptTextLabel)}
          component={LocalizedRichTextField}
          shape={PROMPT_TEXT_SHAPE}
          dynamicValues="prompt"
          placeholder={intl.formatMessage(messages.promptTextPlaceholder)}
          initialValue={asLocalizedString(item[TEXT_FIELD])}
          required={intl.formatMessage(messages.promptTextRequired)}
        />
      </Section>

      <Section
        title={intl.formatMessage(messages.taskTitle)}
        description={intl.formatMessage(messages.taskDescription)}
      >
        <Field<typeof RichSelectGroupField>
          name={TASK_FIELD}
          label={intl.formatMessage(messages.taskLabel)}
          component={RichSelectGroupField}
          options={taskOptions}
          initialValue={committedTask}
          required={intl.formatMessage(messages.taskRequired)}
        />
        {task === TASK_CONNECT && (
          <Field<typeof EntityTypePicker>
            name={CREATE_EDGE_FIELD}
            label={intl.formatMessage(messages.promptCreateEdgeLabel)}
            component={EntityTypePicker}
            entityType="edge"
            {...(offerEdgeType === undefined
              ? {}
              : { offerType: offerEdgeType })}
            initialValue={committedCreate}
            required={intl.formatMessage(messages.promptCreateEdgeRequired)}
          />
        )}
        {task === TASK_HIGHLIGHT &&
          perType.map((nodeType, index) => (
            <HighlightField
              key={nodeType?.id ?? index}
              item={item}
              index={index}
              nodeType={nodeType}
              several={several}
            />
          ))}
      </Section>

      <Section
        title={intl.formatMessage(messages.promptPositionsTitle)}
        description={intl.formatMessage(messages.promptPositionsDescription)}
      >
        {several && (
          <Field<typeof NodeTypeOrderField>
            name={NODE_TYPE_ORDER_FIELD}
            label={intl.formatMessage(messages.promptNodeTypeOrderLabel)}
            hint={intl.formatMessage(messages.promptNodeTypeOrderHint)}
            component={NodeTypeOrderField}
            types={nodeTypes}
            initialValue={committedNodeTypeOrder}
          />
        )}
        {perType.map((nodeType, index) => (
          <TypeSortRows
            key={nodeType?.id ?? index}
            item={item}
            index={index}
            nodeType={nodeType}
            several={several}
          />
        ))}
      </Section>

      <Section
        title={intl.formatMessage(messages.promptEdgesTitle)}
        description={intl.formatMessage(messages.promptEdgesDescription)}
      >
        {/*
          Said only where it is TRUE: this prompt's connection type is locked
          into the list because the researcher chose it a moment ago and the
          effect above put it there. A prompt that arrived drawing a connection
          it does not show is not locked and is not claimed to be.
        */}
        {drawChosenHere && createdEdge !== undefined && (
          <Alert variant="info" className="my-7">
            <AlertDescription>
              {intl.formatMessage(messages.promptCreatedEdgeAlwaysShown)}
            </AlertDescription>
          </Alert>
        )}
        <Field<typeof OptionalTickList>
          name={DISPLAY_EDGES_FIELD}
          label={intl.formatMessage(messages.promptDisplayEdgesLabel)}
          component={OptionalTickList}
          options={edgeChoices}
          initialValue={committedDisplay}
        />
      </Section>
    </>
  );
}

/**
 * How one prompt reads in the list when its dialog is closed.
 *
 * Through the markdown renderer, because the text was WRITTEN through the
 * markdown editor: a researcher who emphasised a word in the dialog would
 * otherwise meet their own asterisks in the list, and the prompt lists of
 * every other interface render the same text the same way.
 */
export function SociogramPromptPreview({ item }: RowPreviewProps) {
  const intl = useAppIntl();
  const localize = useLocalizedText();
  const text = localize(item[TEXT_FIELD]);
  if (text.text === '') {
    return (
      <RenderMarkdown render={<div />}>
        {intl.formatMessage(messages.promptEmptyPreview)}
      </RenderMarkdown>
    );
  }
  return <DynamicTextPreview value={item[TEXT_FIELD]} />;
}
