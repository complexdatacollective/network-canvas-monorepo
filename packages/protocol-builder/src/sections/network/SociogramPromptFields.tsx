import { useEffect, useMemo, useState } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
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
import type { SortableProperty } from '../../fields/sortOrderOptions.ts';
import { VariablePickerControl } from '../../fields/VariablePicker.tsx';
import SortOrderRows from '../prompts/SortOrderRows.tsx';
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
import { networkCanvasMessages } from './networkCanvasMessages.ts';
import {
  asNestedBoolean,
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
  const intl = useAppIntl();
  const subject = useStageSubject();
  // Writes reach THIS dialog's form, not the stage's: the prompt is the
  // researcher's unsaved row until they save it.
  const setRowValue = useFormStore((store) => store.setFieldValue);
  const edgeOptions = useEdgeTypeOptions();
  // Everything a sort rule may order by: every attribute of the type this
  // stage collects, unfiltered by writer class — a rule reads an attribute
  // rather than writing one, so nothing is off limits.
  //
  // `undefined` until the stage has been told WHAT it collects, which is the
  // answer `SortOrderRows` reads as "this family does not know its properties
  // yet" and judges no rule against. An empty list is the other answer — a
  // node type whose attributes have all been deleted, where every rule this
  // prompt holds is certainly dangling and has to be shown and refused as
  // such — and the codebook read below means exactly that whenever there is a
  // subject to read it against. Saying `[]` for both would report every rule
  // of a subjectless sociogram as pointing at a deleted attribute.
  const subjectVariables = useSubjectVariables(subject);
  const sortableProperties = useMemo<SortableProperty[] | undefined>(
    () =>
      subject === undefined
        ? undefined
        : Object.entries(subjectVariables).map(([value, variable]) => ({
            value,
            label: variable.name,
            type: variable.type,
          })),
    [subject, subjectVariables],
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
  const committedAllowHighlighting =
    asNestedBoolean(item.highlight, 'allowHighlighting') === true;

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
   * is written on EVERY opening of a marked prompt, not only when the choice
   * changes, because a `variable` arriving without its flag is a prompt that
   * colours nodes rather than one that marks them.
   *
   * Turned OFF only for a prompt that had it on. Writing `false` for every
   * other prompt made opening a dialog and closing it again an answer: a
   * prompt that had never said anything about tapping acquired
   * `highlight.allowHighlighting: false` the first time anyone looked at it,
   * and an unanswered question saved as an answer is content in the
   * researcher's protocol that the researcher did not write. A committed `true`
   * still has to be written over, though, and `undefined` will not do it — the
   * row is rebuilt by laying the dialog's fields over the committed row, so a
   * field holding nothing lets the committed value through.
   */
  useEffect(() => {
    if (tapBehaviour === TAP_HIGHLIGHT) {
      setRowValue(ALLOW_HIGHLIGHTING_FIELD, true);
      return;
    }
    if (!committedAllowHighlighting) return;
    setRowValue(ALLOW_HIGHLIGHTING_FIELD, false);
  }, [committedAllowHighlighting, setRowValue, tapBehaviour]);

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

  // Held for as long as the reader's language does not change: the control's
  // options are part of what it registers with, and a fresh array every render
  // re-registers it.
  const tapOptions = useMemo<RichSelectOption[]>(
    () => [
      {
        value: TAP_NOTHING,
        label: intl.formatMessage(networkCanvasMessages.tapNothingLabel),
        description: intl.formatMessage(
          networkCanvasMessages.tapNothingDescription,
        ),
      },
      {
        value: TAP_CREATE_EDGE,
        label: intl.formatMessage(networkCanvasMessages.tapCreateEdgeLabel),
        description: intl.formatMessage(
          networkCanvasMessages.tapCreateEdgeDescription,
        ),
      },
      {
        value: TAP_HIGHLIGHT,
        label: intl.formatMessage(networkCanvasMessages.tapHighlightLabel),
        description: intl.formatMessage(
          networkCanvasMessages.tapHighlightDescription,
        ),
      },
    ],
    [intl],
  );

  return (
    <>
      <Section
        title={intl.formatMessage(networkCanvasMessages.promptTextTitle)}
        description={intl.formatMessage(
          networkCanvasMessages.promptTextSectionDescription,
        )}
      >
        <Field
          name={TEXT_FIELD}
          label={intl.formatMessage(networkCanvasMessages.promptTextLabel)}
          component={RichTextField}
          singleLine
          placeholder={intl.formatMessage(
            networkCanvasMessages.promptTextPlaceholder,
          )}
          initialValue={asText(item[TEXT_FIELD]) ?? ''}
          required={intl.formatMessage(
            networkCanvasMessages.promptTextRequired,
          )}
        />
      </Section>

      <Section
        title={intl.formatMessage(networkCanvasMessages.promptPositionsTitle)}
        description={intl.formatMessage(
          networkCanvasMessages.promptPositionsDescription,
        )}
      >
        <Field
          name={LAYOUT_VARIABLE_FIELD}
          label={intl.formatMessage(networkCanvasMessages.promptLayoutLabel)}
          hint={intl.formatMessage(networkCanvasMessages.promptLayoutHint)}
          component={VariablePickerControl}
          options={layoutOptions}
          emptyMessage={intl.formatMessage(
            networkCanvasMessages.promptLayoutEmpty,
          )}
          initialValue={committedLayout}
          required={intl.formatMessage(
            networkCanvasMessages.promptLayoutRequired,
          )}
        />
        <CreateVariableAction
          subject={subject}
          variableType="layout"
          label={intl.formatMessage(
            networkCanvasMessages.promptCreateLayoutLabel,
          )}
          description={intl.formatMessage(
            networkCanvasMessages.promptCreateLayoutDescription,
          )}
          onCreated={(variableId) =>
            setRowValue(LAYOUT_VARIABLE_FIELD, variableId)
          }
        />
        {/*
          The package's shared sort-order group, told which key this prompt
          keeps its rules at. What a sort order IS — an ordered list of
          property-and-direction rules, one rule per property, cleared
          altogether by closing the group, and refused while a rule still
          names an attribute the codebook has lost — is the same question a
          bin or a census prompt asks, so the sociogram does not answer it
          again. What it owns is the key (`sortOrder`), the attributes on
          offer, and the words: these rules decide the order the participant
          is handed the nodes they have not placed yet.

          `properties` is therefore the LIVE codebook and nothing else. Folding
          a deleted attribute into it would read as a fix and be a regression:
          the shared helper judges "no longer in the codebook" against exactly
          this list, so an orphan added here is an orphan it can no longer see,
          and the save it should refuse goes through.
        */}
        <SortOrderRows
          name={SORT_ORDER_FIELD}
          title={intl.formatMessage(networkCanvasMessages.promptSortTitle)}
          description={intl.formatMessage(
            networkCanvasMessages.promptSortDescription,
          )}
          label={intl.formatMessage(networkCanvasMessages.promptSortLabel)}
          hint={intl.formatMessage(networkCanvasMessages.promptSortHint)}
          addButtonLabel={intl.formatMessage(
            networkCanvasMessages.promptSortAddLabel,
          )}
          emptyStateMessage={intl.formatMessage(
            networkCanvasMessages.promptSortEmptyState,
          )}
          properties={sortableProperties}
          committedRules={item[SORT_ORDER_FIELD]}
        />
      </Section>

      <Section
        title={intl.formatMessage(networkCanvasMessages.tapTitle)}
        description={intl.formatMessage(networkCanvasMessages.tapDescription)}
      >
        <UnconnectedField
          name="tap-behaviour"
          label={intl.formatMessage(networkCanvasMessages.tapBehaviourLabel)}
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
          <Field
            name={CREATE_EDGE_FIELD}
            label={intl.formatMessage(
              networkCanvasMessages.promptCreateEdgeLabel,
            )}
            hint={intl.formatMessage(
              networkCanvasMessages.promptCreateEdgeHint,
            )}
            component={EntitySelectControl}
            entityType="edge"
            initialValue={committedCreate}
            required={intl.formatMessage(
              networkCanvasMessages.promptCreateEdgeRequired,
            )}
          />
        )}
        {tapBehaviour === TAP_HIGHLIGHT && (
          <>
            <Field
              name={HIGHLIGHT_VARIABLE_FIELD}
              label={intl.formatMessage(
                networkCanvasMessages.promptHighlightLabel,
              )}
              hint={intl.formatMessage(
                networkCanvasMessages.promptHighlightHint,
              )}
              component={VariablePickerControl}
              options={highlightOptions}
              emptyMessage={intl.formatMessage(
                networkCanvasMessages.promptHighlightEmpty,
              )}
              initialValue={committedHighlight}
              required={intl.formatMessage(
                networkCanvasMessages.promptHighlightRequired,
              )}
            />
            <CreateVariableAction
              subject={subject}
              variableType="boolean"
              label={intl.formatMessage(
                networkCanvasMessages.promptCreateHighlightLabel,
              )}
              description={intl.formatMessage(
                networkCanvasMessages.promptCreateHighlightDescription,
              )}
              onCreated={(variableId) =>
                setRowValue(HIGHLIGHT_VARIABLE_FIELD, variableId)
              }
            />
          </>
        )}
      </Section>

      <Section
        title={intl.formatMessage(networkCanvasMessages.promptEdgesTitle)}
        description={intl.formatMessage(
          networkCanvasMessages.promptEdgesDescription,
        )}
      >
        {createdEdge !== undefined && (
          <Alert variant="info" className="my-7">
            <AlertDescription>
              {intl.formatMessage(
                networkCanvasMessages.promptCreatedEdgeAlwaysShown,
              )}
            </AlertDescription>
          </Alert>
        )}
        <Field
          name={DISPLAY_EDGES_FIELD}
          label={intl.formatMessage(
            networkCanvasMessages.promptDisplayEdgesLabel,
          )}
          hint={intl.formatMessage(
            networkCanvasMessages.promptDisplayEdgesHint,
          )}
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
  const intl = useAppIntl();
  const text = asText(item[TEXT_FIELD]);
  return (
    <span className="py-2">
      {text ?? intl.formatMessage(networkCanvasMessages.promptEmptyPreview)}
    </span>
  );
}
