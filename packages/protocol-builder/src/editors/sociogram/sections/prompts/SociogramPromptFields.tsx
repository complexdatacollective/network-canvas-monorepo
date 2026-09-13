import {
  type ComponentType,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Field from '@codaco/fresco-ui/form/Field/Field';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import RichSelectGroupField, {
  type RichSelectOption,
} from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';
import Section from '@codaco/fresco-ui/Section';

import EntityTypePickerField from '../../../../fields/EntityTypePickerField.tsx';
import RichTextField from '../../../../fields/RichTextField.tsx';
import type { SortableProperty } from '../../../../fields/sortOrderOptions.ts';
import VariablePickerField from '../../../../fields/VariablePickerField.tsx';
import type {
  RowEditorProps,
  RowPreviewProps,
} from '../../../../form/rowDialog.tsx';
import { variablesForSubject } from '../../../../protocol-context.ts';
import { canvasMessages } from '../../../../sections/canvas/canvasMessages.ts';
import {
  BOOLEAN_TYPE,
  BOOLEAN_TYPES,
  LAYOUT_TYPE,
  LAYOUT_TYPES,
  useEdgeTypeChoices,
  useVariableChoices,
} from '../../../../sections/canvas/codebookChoices.ts';
import OptionalTickList from '../../../../sections/canvas/OptionalTickList.tsx';
import {
  asNestedBoolean,
  asNestedIdList,
  asNestedText,
  asText,
  useStableIdList,
} from '../../../../sections/canvas/rowValues.ts';
import { useLostReferences } from '../../../../sections/canvas/useLostReferences.ts';
import { useCreateAttributeForSlot } from '../../../../sections/create-variable/useCreateAttributeForSlot.ts';
import SortOrderRows from '../../../../sections/prompts/SortOrderRows.tsx';
import { useStageSubject } from '../../../../sections/useStageSubject.ts';
import { useProtocolContext } from '../../../../state/protocolContext.ts';
import { sociogramPromptMessages as messages } from './sociogramPromptMessages.ts';

const TEXT_FIELD = 'text';
const LAYOUT_VARIABLE_FIELD = 'layout.layoutVariable';
const SORT_ORDER_FIELD = 'sortOrder';
const DISPLAY_EDGES_FIELD = 'edges.display';
const CREATE_EDGE_FIELD = 'edges.create';
/**
 * Where a prompt keeps the attribute a tap marks, exported so the list around
 * this dialog can refuse a pick against the same path the control writes.
 */
export const HIGHLIGHT_VARIABLE_FIELD = 'highlight.variable';
const ALLOW_HIGHLIGHTING_FIELD = 'highlight.allowHighlighting';

/** Both pickers take an open prop bag from the field wrapper. */
const VariablePicker = VariablePickerField as ComponentType<
  Record<string, unknown>
>;
const EntityTypePicker = EntityTypePickerField as ComponentType<
  Record<string, unknown>
>;

/**
 * What tapping a node does.
 *
 * One choice rather than two independent switches, because the two are
 * mutually exclusive: a prompt that both creates edges and toggles an
 * attribute is refused by the stage schema, and the interview would silently
 * let edge creation win.
 */
const TAP_NOTHING = 'nothing';
const TAP_CREATE_EDGE = 'create-edge';
const TAP_HIGHLIGHT = 'highlight';

type TapBehaviour =
  | typeof TAP_NOTHING
  | typeof TAP_CREATE_EDGE
  | typeof TAP_HIGHLIGHT;

/**
 * `allowHighlighting`, not `variable`, is what says a tap marks the node.
 *
 * The two are different configurations, and the schema says so: the attribute
 * site carries `usageRequiresSibling: 'allowHighlighting'`, and the interview
 * shows a node HIGHLIGHTED wherever `variable` says it is, whatever the flag
 * holds, while gating the tap-to-toggle branch on the flag alone. A prompt
 * naming an attribute with the flag off therefore highlights the nodes
 * something else already recorded that attribute for, and the participant
 * cannot change it — a reading of an attribute a form may well validate
 * elsewhere.
 */
const tapBehaviourOf = (item: Record<string, unknown>): TapBehaviour => {
  if (asNestedText(item.edges, 'create') !== undefined) return TAP_CREATE_EDGE;
  if (asNestedBoolean(item.highlight, 'allowHighlighting') === true) {
    return TAP_HIGHLIGHT;
  }
  return TAP_NOTHING;
};

/**
 * One task this sociogram sets, and everything the canvas does while it is on
 * screen.
 *
 * A sociogram prompt is not only its text: it decides where the nodes are
 * remembered, which connections are drawn, and what tapping a node does. All
 * of it names codebook attributes and edge types, which are read from the
 * protocol here rather than from anything the stage carries — so a
 * collaborator's change to the codebook changes what this dialog offers
 * without the dialog asking for it.
 */
export function SociogramPromptFields({ item }: RowEditorProps) {
  const intl = useAppIntl();
  const subject = useStageSubject('node');
  const protocolContext = useProtocolContext();
  // Writes reach THIS dialog's form, not the stage's: the prompt is the
  // researcher's unsaved row until they save it.
  const setRowValue = useFormStore((store) => store.setFieldValue);
  const layoutCreate = useCreateAttributeForSlot({
    subject,
    variableType: LAYOUT_TYPE,
    title: intl.formatMessage(messages.promptCreateLayoutLabel),
    onCreated: (variableId) => setRowValue(LAYOUT_VARIABLE_FIELD, variableId),
  });
  const highlightCreate = useCreateAttributeForSlot({
    subject,
    variableType: BOOLEAN_TYPE,
    title: intl.formatMessage(messages.promptCreateHighlightLabel),
    onCreated: (variableId) =>
      setRowValue(HIGHLIGHT_VARIABLE_FIELD, variableId),
  });
  const edgeChoicesOffered = useEdgeTypeChoices();

  /**
   * Everything a sort rule may order by: every attribute of the type this
   * stage collects, unfiltered by writer class — a rule reads an attribute
   * rather than writing one, so nothing is off limits.
   *
   * `undefined` until the stage has been told WHAT it collects, which is the
   * answer `SortOrderRows` reads as "this family does not know its properties
   * yet" and judges no rule against. An empty list is the other answer — a
   * node type whose attributes have all been deleted, where every rule this
   * prompt holds is certainly dangling.
   */
  const sortableProperties = useMemo<SortableProperty[] | undefined>(
    () =>
      subject === undefined
        ? undefined
        : Object.entries(variablesForSubject(protocolContext, subject)).map(
            ([value, variable]) => ({
              value,
              label: variable.name,
              type: variable.type,
            }),
          ),
    [protocolContext, subject],
  );

  const committedLayout = asNestedText(item.layout, 'layoutVariable');
  // Held as the same array while its contents do not change: a field's
  // starting value is part of its registration, and a new array every render
  // re-registers the field — which supersedes the validation a submit is
  // running and silently refuses the save.
  const committedDisplay = useStableIdList(
    asNestedIdList(item.edges, 'display'),
  );
  const committedCreate = asNestedText(item.edges, 'create');
  const committedHighlight = asNestedText(item.highlight, 'variable');
  // The flag as the row HOLDS it — `false` and absent are different answers,
  // and putting one back in place of the other rewrites the prompt.
  const committedAllowHighlightingValue = asNestedBoolean(
    item.highlight,
    'allowHighlighting',
  );
  const committedAllowHighlighting = committedAllowHighlightingValue === true;

  const [tapBehaviour, setTapBehaviour] = useState<TapBehaviour>(() =>
    tapBehaviourOf(item),
  );

  // Both name an attribute the interview writes around the codebook's rules —
  // a position the participant drags a node to, a mark a tap toggles — so
  // neither may take one a form field collects.
  const layoutOptions = useVariableChoices({
    subject,
    types: LAYOUT_TYPES,
    writerClass: 'unvalidated',
    ...(committedLayout === undefined ? {} : { currentValue: committedLayout }),
  });
  const highlightOptions = useVariableChoices({
    subject,
    types: BOOLEAN_TYPES,
    writerClass: 'unvalidated',
    ...(committedHighlight === undefined
      ? {}
      : { currentValue: committedHighlight }),
  });

  const live = useFormValue([CREATE_EDGE_FIELD, DISPLAY_EDGES_FIELD] as const);
  const createdEdge = asText(live[CREATE_EDGE_FIELD]);
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
   * The flag the interview gates tap-to-mark on, kept in step with the choice
   * above it.
   *
   * Written rather than rendered because there is no second decision to make:
   * the schema pairs `allowHighlighting` with `highlight.variable`, and a
   * control for it could only contradict the behaviour chooser. It is written
   * on EVERY opening of a marked prompt, not only when the choice changes,
   * because a `variable` arriving without its flag is a prompt that HIGHLIGHTS
   * nodes rather than one that marks them.
   *
   * Turned OFF for a prompt that had it on, and CLEARED for one this dialog
   * turned it on for. Writing `false` for every other prompt made opening a
   * dialog and closing it again an answer: a prompt that had never said
   * anything about tapping acquired `highlight.allowHighlighting: false` the
   * first time anyone looked at it, and an unanswered question saved as an
   * answer is content in the protocol the researcher did not write.
   */
  const markedHere = useRef(false);
  useEffect(() => {
    if (tapBehaviour === TAP_HIGHLIGHT) {
      markedHere.current = true;
      setRowValue(ALLOW_HIGHLIGHTING_FIELD, true);
      return;
    }
    if (committedAllowHighlighting) {
      setRowValue(ALLOW_HIGHLIGHTING_FIELD, false);
      return;
    }
    if (!markedHere.current) return;
    // Put back, not cleared. A prompt that arrived saying `false` said it, and
    // visiting the marking option and leaving again is not the researcher
    // unsaying it — while one that arrived saying nothing goes on saying
    // nothing, which is the reason this branch exists.
    setRowValue(ALLOW_HIGHLIGHTING_FIELD, committedAllowHighlightingValue);
  }, [
    committedAllowHighlighting,
    committedAllowHighlightingValue,
    setRowValue,
    tapBehaviour,
  ]);

  /**
   * Whether the connection this prompt draws was chosen HERE, in this dialog.
   *
   * The two rules below hang on it, and both are about a choice the researcher
   * has just made rather than about the prompt they opened. Held as state
   * rather than a ref because it is rendered: the notice and the locked tick
   * box are what the rule looks like on screen.
   */
  const [drawChosenHere, setDrawChosenHere] = useState(false);
  useEffect(() => {
    if (createdEdge === undefined || createdEdge === committedCreate) return;
    setDrawChosenHere(true);
  }, [committedCreate, createdEdge]);

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

  const chooseTapBehaviour = (next: TapBehaviour) => {
    if (next === tapBehaviour) return;
    const left = tapBehaviour;
    setTapBehaviour(next);
    // The side being LEFT is written rather than left to unmount: a value the
    // researcher entered and then moved away from is parked by the store, and
    // parked values are replayed into the saved prompt.
    //
    // Only that side, and only what the side OWNS. A connection type is a tap
    // target and nothing else — a prompt that draws nothing has no use for
    // one — so leaving takes it. The attribute is not: `highlight.variable`
    // with the flag off is a prompt that HIGHLIGHTS its nodes by an attribute
    // the participant cannot toggle, which is a configuration of its own, and
    // the marking picker mounts already showing that very attribute. Cleared
    // on the way out, visiting "mark the node" and changing your mind deleted
    // the highlighting — with the picker unmounted by then and nothing on
    // screen to say it had gone. So the pick goes back to what the row opened
    // with, and a visit that changed nothing changes nothing.
    if (left === TAP_CREATE_EDGE) setRowValue(CREATE_EDGE_FIELD, undefined);
    if (left === TAP_HIGHLIGHT) {
      // Unless the prompt arrived MARKING, where the attribute is the tap's
      // own target rather than something the prompt was told to highlight by:
      // switching the tap off takes it, which is what turning marking off has
      // always saved.
      setRowValue(
        HIGHLIGHT_VARIABLE_FIELD,
        committedAllowHighlighting ? undefined : committedHighlight,
      );
    }
  };

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
  const tapOptions = useMemo<RichSelectOption[]>(
    () => [
      {
        value: TAP_NOTHING,
        label: intl.formatMessage(messages.tapNothingLabel),
        description: intl.formatMessage(messages.tapNothingDescription),
      },
      {
        value: TAP_CREATE_EDGE,
        label: intl.formatMessage(messages.tapCreateEdgeLabel),
        description: intl.formatMessage(messages.tapCreateEdgeDescription),
      },
      {
        value: TAP_HIGHLIGHT,
        label: intl.formatMessage(messages.tapHighlightLabel),
        description: intl.formatMessage(messages.tapHighlightDescription),
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
        <Field<typeof RichTextField>
          name={TEXT_FIELD}
          label={intl.formatMessage(messages.promptTextLabel)}
          component={RichTextField}
          singleLine
          placeholder={intl.formatMessage(messages.promptTextPlaceholder)}
          initialValue={asText(item[TEXT_FIELD]) ?? ''}
          required={intl.formatMessage(messages.promptTextRequired)}
        />
      </Section>

      <Section
        title={intl.formatMessage(messages.promptPositionsTitle)}
        description={intl.formatMessage(messages.promptPositionsDescription)}
      >
        <Field<typeof VariablePicker>
          name={LAYOUT_VARIABLE_FIELD}
          label={intl.formatMessage(messages.promptLayoutLabel)}
          hint={intl.formatMessage(messages.promptLayoutHint)}
          component={VariablePicker}
          options={layoutOptions}
          emptyMessage={intl.formatMessage(messages.promptLayoutEmpty)}
          initialValue={committedLayout}
          required={intl.formatMessage(messages.promptLayoutRequired)}
          {...layoutCreate.createProps}
        />
        {layoutCreate.editor}
        {/*
          The package's shared sort-order group, told which key this prompt
          keeps its rules at. What a sort order IS — an ordered list of
          property-and-direction rules, cleared altogether by closing the
          group, and refused while a rule still names an attribute the codebook
          has lost — is the same question a bin or a census prompt asks. What
          the sociogram owns is the key, the attributes on offer and the words.

          `properties` is therefore the LIVE codebook and nothing else. Folding
          a deleted attribute into it would read as a fix and be a regression:
          the shared helper judges "no longer in the codebook" against exactly
          this list.
        */}
        <SortOrderRows
          name={SORT_ORDER_FIELD}
          title={intl.formatMessage(messages.promptSortTitle)}
          description={intl.formatMessage(messages.promptSortDescription)}
          label={intl.formatMessage(messages.promptSortLabel)}
          addButtonLabel={intl.formatMessage(messages.promptSortAddLabel)}
          emptyStateMessage={intl.formatMessage(messages.promptSortEmptyState)}
          properties={sortableProperties}
          committedRules={item[SORT_ORDER_FIELD]}
        />
      </Section>

      <Section
        title={intl.formatMessage(messages.tapTitle)}
        description={intl.formatMessage(messages.tapDescription)}
      >
        <UnconnectedField
          name="tap-behaviour"
          label={intl.formatMessage(messages.tapBehaviourLabel)}
          component={RichSelectGroupField}
          value={tapBehaviour}
          onChange={(next) =>
            chooseTapBehaviour(
              next === TAP_CREATE_EDGE || next === TAP_HIGHLIGHT
                ? next
                : TAP_NOTHING,
            )
          }
          options={tapOptions}
        />
        {tapBehaviour === TAP_CREATE_EDGE && (
          <Field<typeof EntityTypePicker>
            name={CREATE_EDGE_FIELD}
            label={intl.formatMessage(messages.promptCreateEdgeLabel)}
            component={EntityTypePicker}
            entityType="edge"
            initialValue={committedCreate}
            required={intl.formatMessage(messages.promptCreateEdgeRequired)}
          />
        )}
        {tapBehaviour === TAP_HIGHLIGHT && (
          <>
            <Field<typeof VariablePicker>
              name={HIGHLIGHT_VARIABLE_FIELD}
              label={intl.formatMessage(messages.promptHighlightLabel)}
              hint={intl.formatMessage(messages.promptHighlightHint)}
              component={VariablePicker}
              options={highlightOptions}
              emptyMessage={intl.formatMessage(messages.promptHighlightEmpty)}
              initialValue={committedHighlight}
              required={intl.formatMessage(messages.promptHighlightRequired)}
              {...highlightCreate.createProps}
            />
            {highlightCreate.editor}
          </>
        )}
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
  const text = asText(item[TEXT_FIELD]);
  return (
    <RenderMarkdown render={<div />}>
      {text ?? intl.formatMessage(messages.promptEmptyPreview)}
    </RenderMarkdown>
  );
}
