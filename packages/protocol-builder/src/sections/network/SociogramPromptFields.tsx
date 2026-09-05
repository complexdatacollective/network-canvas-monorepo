import { useEffect, useMemo, useState } from 'react';

import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Field from '@codaco/fresco-ui/form/Field/Field';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import RichSelectGroupField, {
  type RichSelectOption,
} from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Section from '@codaco/fresco-ui/Section';

import { EntitySelectControl } from '../../fields/EntitySelectField.tsx';
import RichTextField from '../../fields/RichTextField.tsx';
import {
  getSortOrderOptionGetter,
  type SortableProperty,
} from '../../fields/sortOrderOptions.ts';
import { VariablePickerControl } from '../../fields/VariablePicker.tsx';
import MultiSelect, {
  makeMultiSelectValidation,
  type PropertyField,
} from '../../form/arrayFields/MultiSelect.tsx';
import { DialogFormField } from '../../form/DialogForm.tsx';
import type { CodebookSubject } from '../../protocol-context.ts';
import type { RowEditorProps, RowPreviewProps } from '../rowRenderers.tsx';
import { OptionalCheckboxGroupField } from './canvasFields.tsx';
import {
  BOOLEAN_TYPES,
  LAYOUT_TYPES,
  useEdgeTypeOptions,
  useStageSubject,
  useSubjectVariables,
  useVariableOptions,
} from './codebookOptions.ts';
import CreateVariableAction from './CreateVariableAction.tsx';
import {
  asNestedIdList,
  asNestedText,
  asText,
  checkboxOptions,
  useStableIdList,
} from './rowValues.ts';

const TEXT_FIELD = 'text';
const LAYOUT_VARIABLE_FIELD = 'layout.layoutVariable';
const SORT_ORDER_FIELD = 'sortOrder';
const DISPLAY_EDGES_FIELD = 'edges.display';
const CREATE_EDGE_FIELD = 'edges.create';
const HIGHLIGHT_VARIABLE_FIELD = 'highlight.variable';
const ALLOW_HIGHLIGHTING_FIELD = 'highlight.allowHighlighting';

/** A sort rule is one property and one direction, in that order. */
const SORT_RULE_PROPERTIES: PropertyField[] = [
  { fieldName: 'property' },
  { fieldName: 'direction' },
];

/**
 * The rule that can actually refuse the save. A row's own cells only display
 * their errors (see `RowField`), and a rule missing its direction fails the
 * protocol's `SortRuleSchema` against a path rather than against the control
 * the researcher left half-filled.
 */
const SORT_RULE_VALIDATION = makeMultiSelectValidation(SORT_RULE_PROPERTIES);

/**
 * The order the nodes the participant has not placed yet are handed to them
 * in — `sociogramPromptSchema.sortOrder`.
 *
 * An optional group rather than a plain list: a prompt with no rules hands the
 * nodes over in the order they were added, which is a real answer, and closing
 * the group is how the researcher says so — Fresco's `Section` clears the
 * fields inside it, so the key leaves the saved prompt entirely rather than
 * staying behind as an empty list. A prompt that ALREADY has rules therefore
 * has to open switched on, or saving it from a closed group would throw them
 * away without saying anything.
 *
 * Written here rather than shared because the sociogram is this branch's only
 * interface with a prompt-level sort order; the bin and census prompts bring a
 * `SortOrderRows` of the same shape, and this should become a call to that one
 * when the two meet.
 */
function SortUnplacedNodes({
  subject,
  committedRules,
}: Readonly<{
  subject: CodebookSubject | undefined;
  /**
   * The rules this prompt already has, which decide whether the group starts
   * open. Read from the row rather than from form state: the field is inside
   * the group, so a reactive read could never see a value until the group was
   * already open.
   */
  committedRules: unknown;
}>) {
  const variables = useSubjectVariables(subject);
  const properties = useMemo<SortableProperty[]>(
    () =>
      Object.entries(variables).map(([value, variable]) => ({
        value,
        label: variable.name,
        type: variable.type,
      })),
    [variables],
  );
  const options = useMemo(
    () => getSortOrderOptionGetter(properties),
    [properties],
  );
  // One rule per property at most: every rule after that could only repeat a
  // property the getter has already disabled.
  const maxItems = options('property', undefined, []).length;
  const configured = Array.isArray(committedRules) && committedRules.length > 0;

  return (
    <Section
      title="Sort unplaced nodes"
      description="Choose the order the nodes the participant has not placed yet are handed to them in."
      toggleable
      defaultOpen={configured}
    >
      <DialogFormField<typeof MultiSelect>
        name={SORT_ORDER_FIELD}
        label="Sort rules"
        hint="Rules are applied in order. Use the asterisk to keep the order the nodes were added in."
        component={MultiSelect}
        addButtonLabel="Add a rule for the order unplaced nodes are handed over in"
        emptyStateMessage="No rules yet, so nodes are handed over in the order they were added."
        properties={SORT_RULE_PROPERTIES}
        options={options}
        maxItems={maxItems}
        {...SORT_RULE_VALIDATION}
      />
    </Section>
  );
}

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

const TAP_OPTIONS: RichSelectOption[] = [
  {
    value: TAP_NOTHING,
    label: 'Nothing',
    description:
      'Tapping a node does nothing on this prompt. The participant only moves nodes around.',
  },
  {
    value: TAP_CREATE_EDGE,
    label: 'Create a connection',
    description:
      'Tapping one node and then another draws a connection between them.',
  },
  {
    value: TAP_HIGHLIGHT,
    label: 'Mark the node',
    description:
      'Tapping a node turns an attribute on, and tapping it again turns it off.',
  },
];

const tapBehaviourOf = (item: Record<string, unknown>): TapBehaviour => {
  if (asNestedText(item.edges, 'create') !== undefined) return TAP_CREATE_EDGE;
  if (asNestedText(item.highlight, 'variable') !== undefined) {
    return TAP_HIGHLIGHT;
  }
  return TAP_NOTHING;
};

/**
 * One question this sociogram asks, and everything the canvas does while it is
 * on screen.
 *
 * A sociogram prompt is not only its text: it decides where the nodes are
 * remembered, which connections are drawn, and what tapping a node does. All
 * of it names codebook attributes and edge types, which reach this editor
 * through the package's protocol context rather than through anything the
 * stage carries — so a collaborator's change to the codebook changes what this
 * dialog offers without the dialog asking for it.
 */
export function SociogramPromptFields({ item }: RowEditorProps) {
  const subject = useStageSubject();
  // Writes reach THIS dialog's form, not the stage's: the prompt is the
  // researcher's unsaved row until they save it.
  const setRowValue = useFormStore((store) => store.setFieldValue);
  const edgeOptions = useEdgeTypeOptions();

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

  const [tapBehaviour, setTapBehaviour] = useState<TapBehaviour>(() =>
    tapBehaviourOf(item),
  );

  const layoutOptions = useVariableOptions({
    subject,
    types: LAYOUT_TYPES,
    writerClass: 'unvalidated',
    ...(committedLayout === undefined ? {} : { currentValue: committedLayout }),
  });
  const highlightOptions = useVariableOptions({
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
   * control for it would only be able to contradict the behaviour chooser. It
   * has to be written on EVERY opening of a marked prompt, not only when the
   * choice changes — the dialog submits the `highlight` object it rendered,
   * which replaces the committed one wholesale, and a `variable` arriving
   * without its flag is a prompt that colours nodes rather than one that marks
   * them.
   */
  useEffect(() => {
    setRowValue(ALLOW_HIGHLIGHTING_FIELD, tapBehaviour === TAP_HIGHLIGHT);
  }, [setRowValue, tapBehaviour]);

  /**
   * The connection being drawn is always among the connections shown.
   *
   * Drawing a connection the participant cannot see is not something a
   * researcher can have meant, and the interview draws it regardless.
   */
  useEffect(() => {
    if (createdEdge === undefined) return;
    if (displayedEdges.includes(createdEdge)) return;
    setRowValue(DISPLAY_EDGES_FIELD, [...displayedEdges, createdEdge]);
  }, [createdEdge, displayedEdges, setRowValue]);

  const chooseTapBehaviour = (next: TapBehaviour) => {
    if (next === tapBehaviour) return;
    setTapBehaviour(next);
    // The abandoned side is cleared rather than left to unmount: a value the
    // researcher entered and then moved away from is parked by the store, and
    // parked values are replayed into the saved prompt.
    if (next !== TAP_CREATE_EDGE) setRowValue(CREATE_EDGE_FIELD, undefined);
    if (next !== TAP_HIGHLIGHT)
      setRowValue(HIGHLIGHT_VARIABLE_FIELD, undefined);
  };

  const edgeChoices = useMemo(
    () =>
      checkboxOptions(edgeOptions).map((option) =>
        option.value === createdEdge ? { ...option, disabled: true } : option,
      ),
    [createdEdge, edgeOptions],
  );

  return (
    <>
      <Section
        title="Participant prompt"
        description="Write the question or instruction the participant sees for this task."
      >
        <Field
          name={TEXT_FIELD}
          label="Prompt text"
          component={RichTextField}
          singleLine
          placeholder="Enter your prompt..."
          initialValue={asText(item[TEXT_FIELD]) ?? ''}
          required="Write the question this prompt asks."
        />
      </Section>

      <Section
        title="Node positions"
        description="Where the participant's placements are remembered."
      >
        <Field
          name={LAYOUT_VARIABLE_FIELD}
          label="Position attribute"
          hint="The attribute that stores each node's position. Prompts sharing an attribute carry the participant's placements between them."
          component={VariablePickerControl}
          options={layoutOptions}
          emptyMessage="This type has no position attributes yet. Create one to store what the participant places."
          initialValue={committedLayout}
          required="Choose the attribute this prompt stores positions in."
        />
        <CreateVariableAction
          subject={subject}
          variableType="layout"
          label="Create a new position attribute"
          description="Create an attribute to store node positions, and use it for this prompt"
          onCreated={(variableId) =>
            setRowValue(LAYOUT_VARIABLE_FIELD, variableId)
          }
        />
        <SortUnplacedNodes
          subject={subject}
          committedRules={item[SORT_ORDER_FIELD]}
        />
      </Section>

      <Section
        title="Tapping a node"
        description="What happens when the participant taps a node on this prompt."
      >
        <UnconnectedField
          name="tap-behaviour"
          label="Tap behaviour"
          component={RichSelectGroupField}
          value={tapBehaviour}
          onChange={(next) =>
            chooseTapBehaviour(
              next === TAP_CREATE_EDGE || next === TAP_HIGHLIGHT
                ? next
                : TAP_NOTHING,
            )
          }
          options={TAP_OPTIONS}
        />
        {tapBehaviour === TAP_CREATE_EDGE && (
          <Field
            name={CREATE_EDGE_FIELD}
            label="Connection type created"
            hint="The kind of connection tapping two nodes draws between them."
            component={EntitySelectControl}
            entityType="edge"
            initialValue={committedCreate}
            required="Choose the kind of connection this prompt creates."
          />
        )}
        {tapBehaviour === TAP_HIGHLIGHT && (
          <>
            <Field
              name={HIGHLIGHT_VARIABLE_FIELD}
              label="Attribute marked"
              hint="Tapping a node turns this attribute on, and tapping it again turns it off."
              component={VariablePickerControl}
              options={highlightOptions}
              emptyMessage="This type has no true-or-false attributes available, so there is nothing to mark."
              initialValue={committedHighlight}
              required="Choose the attribute tapping a node turns on and off."
            />
            <CreateVariableAction
              subject={subject}
              variableType="boolean"
              label="Create a new true-or-false attribute"
              description="Create a true-or-false attribute, and mark nodes with it on this prompt"
              onCreated={(variableId) =>
                setRowValue(HIGHLIGHT_VARIABLE_FIELD, variableId)
              }
            />
          </>
        )}
      </Section>

      <Section
        title="Connections shown"
        description="The kinds of connection drawn between nodes on this prompt."
      >
        {createdEdge !== undefined && (
          <Alert variant="info" className="my-7">
            <AlertDescription>
              The kind of connection this prompt creates is always shown, so it
              cannot be unticked.
            </AlertDescription>
          </Alert>
        )}
        <Field
          name={DISPLAY_EDGES_FIELD}
          label="Connection types shown"
          hint="Leave every type unticked to draw no connections at all."
          component={OptionalCheckboxGroupField}
          options={edgeChoices}
          initialValue={committedDisplay}
        />
      </Section>
    </>
  );
}

/** How one prompt reads in the list when its editor is closed. */
export function SociogramPromptPreview({ item }: RowPreviewProps) {
  const text = asText(item[TEXT_FIELD]);
  return <span className="py-2">{text ?? 'Empty prompt'}</span>;
}
