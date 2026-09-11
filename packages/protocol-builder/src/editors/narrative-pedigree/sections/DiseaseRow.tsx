import { useMemo } from 'react';

import {
  formatMessageError,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Badge } from '@codaco/fresco-ui/Badge';
import Field from '@codaco/fresco-ui/form/Field/Field';
import ColorPickerField, {
  resolveSwatchColor,
} from '@codaco/fresco-ui/form/fields/ColorPicker';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import {
  INHERITANCE_PATTERNS,
  type InheritancePattern,
  NodeColorSequence,
} from '@codaco/protocol-validation';

import VariablePickerField from '../../../fields/VariablePickerField.tsx';
import type {
  RowEditorProps,
  RowPreviewProps,
} from '../../../form/rowDialog.tsx';
import { useStageValue } from '../../../form/stageFormHooks.ts';
import type { CodebookSubject } from '../../../protocol-context.ts';
import { useProtocolContext } from '../../../state/protocolContext.ts';
import { diseaseColorOptions } from './diseaseColors.ts';
import {
  diseaseRowIssue,
  diseaseVariableOptions,
  useDiseaseVariableIndexes,
} from './diseaseVariables.ts';
import { narrativePedigreeMessages } from './narrativePedigreeMessages.ts';
import {
  diseaseMarksNobody,
  sourceStageNodeType,
  sourceStageRecordedVariables,
} from './sourceStage.ts';

const LABEL_FIELD = 'label';
const COLOR_FIELD = 'color';
const VARIABLE_FIELD = 'variable';
const INHERITANCE_FIELD = 'inheritancePattern';
const SOURCE_FIELD = 'sourceStageId';
const DISEASES_FIELD = 'diseases';

/**
 * Author-facing names for each inheritance pattern.
 *
 * The pattern ids are schema contract; these are editor copy, written out
 * whole rather than derived from the id, so a translator moves a phrase rather
 * than reassembling one.
 *
 * Keyed on the schema's own token, so a pattern added to the protocol is one
 * this record does not compile without.
 */
const INHERITANCE_LABELS: Readonly<
  Record<InheritancePattern, MessageDescriptor>
> = Object.freeze({
  autosomalDominant: narrativePedigreeMessages.inheritanceAutosomalDominant,
  autosomalRecessive: narrativePedigreeMessages.inheritanceAutosomalRecessive,
  xLinkedDominant: narrativePedigreeMessages.inheritanceXLinkedDominant,
  xLinkedRecessive: narrativePedigreeMessages.inheritanceXLinkedRecessive,
  yLinked: narrativePedigreeMessages.inheritanceYLinked,
  mitochondrial: narrativePedigreeMessages.inheritanceMitochondrial,
  multifactorial: narrativePedigreeMessages.inheritanceMultifactorial,
  unknown: narrativePedigreeMessages.inheritanceUnknown,
});

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The attributes a sibling row already maps, so one attribute never describes
 * two diseases.
 *
 * Read from the LIVE rows rather than the saved stage: a disease added in this
 * session is not saved yet, and one just deleted must free its attribute at
 * once.
 */
const siblingVariables = (
  rows: unknown,
  editIndex: number | undefined,
): ReadonlySet<string> => {
  if (!Array.isArray(rows)) return new Set();
  const used = new Set<string>();
  rows.forEach((row, index) => {
    if (index === editIndex || !isRecord(row)) return;
    if (typeof row.variable === 'string') used.add(row.variable);
  });
  return used;
};

/**
 * The node type whose attributes a disease may map, read from the source
 * pedigree.
 *
 * Taken from the stage form rather than passed in: the row dialog mounts a
 * form store of its own, but the stage editor context is deliberately not
 * re-provided, so everything in the dialog can still see the stage around it.
 */
export function useDiseaseSubject(): CodebookSubject | null {
  const protocolContext = useProtocolContext();
  const sourceStageId = useStageValue(SOURCE_FIELD);
  return useMemo(() => {
    const nodeType = sourceStageNodeType(protocolContext, sourceStageId);
    return nodeType === undefined ? null : { entity: 'node', type: nodeType };
  }, [protocolContext, sourceStageId]);
}

/**
 * One disease: what it is called, how it is drawn, which attribute says who
 * has it, and how it travels through a family.
 *
 * There is deliberately no create-an-attribute affordance here. A disease only
 * READS its attribute, so a bare new one is an attribute nothing ever writes
 * and the row would mark nobody; the condition a study does not record yet is
 * added where it IS recorded — as a nomination prompt of the source pedigree,
 * which has a create button of its own — and the picker's empty message says
 * so.
 */
export function DiseaseEditor({ item, editIndex }: RowEditorProps) {
  const intl = useAppIntl();
  const protocolContext = useProtocolContext();
  const { roleMap, slotMap } = useDiseaseVariableIndexes();
  const subject = useDiseaseSubject();
  const sourceStageId = useStageValue(SOURCE_FIELD);
  const rows = useStageValue(DISEASES_FIELD);
  const currentVariable = asString(item.variable);

  // Both lists are the same every render, and both are a control's `options`:
  // a fresh array each time re-registers the control on every keystroke.
  const inheritanceOptions = useMemo(
    () =>
      INHERITANCE_PATTERNS.map((value) => ({
        value,
        label: intl.formatMessage(INHERITANCE_LABELS[value]),
      })),
    [intl],
  );

  /**
   * The palette, named rather than only shown.
   *
   * The swatches are what the researcher chooses from — a colour named "Color
   * 3" and not shown is a shade they meet for the first time in an interview —
   * so each is announced by the hue the theme gives it, as Architect announced
   * them.
   */
  const colorOptions = useMemo(() => diseaseColorOptions(intl), [intl]);

  const options = useMemo(
    () =>
      diseaseVariableOptions({
        context: protocolContext,
        roleMap,
        slotMap,
        subject,
        sourceStageId,
        ...(currentVariable === undefined ? {} : { currentVariable }),
        used: siblingVariables(rows, editIndex),
      }),
    [
      currentVariable,
      editIndex,
      protocolContext,
      roleMap,
      rows,
      slotMap,
      sourceStageId,
      subject,
    ],
  );

  return (
    <>
      <Field<typeof InputField>
        name={LABEL_FIELD}
        component={InputField}
        label={intl.formatMessage(narrativePedigreeMessages.diseaseNameLabel)}
        hint={intl.formatMessage(narrativePedigreeMessages.diseaseNameHint)}
        placeholder={intl.formatMessage(
          narrativePedigreeMessages.diseaseNamePlaceholder,
        )}
        initialValue={asString(item.label)}
        required={intl.formatMessage(
          narrativePedigreeMessages.diseaseNameRequired,
        )}
      />
      <Field<typeof ColorPickerField>
        name={COLOR_FIELD}
        component={ColorPickerField}
        label={intl.formatMessage(narrativePedigreeMessages.diseaseColorLabel)}
        hint={intl.formatMessage(narrativePedigreeMessages.diseaseColorHint)}
        options={colorOptions}
        initialValue={asString(item.color)}
        required={intl.formatMessage(
          narrativePedigreeMessages.diseaseColorRequired,
        )}
      />
      <Field<typeof VariablePickerField>
        name={VARIABLE_FIELD}
        component={VariablePickerField}
        label={intl.formatMessage(
          narrativePedigreeMessages.diseaseVariableLabel,
        )}
        hint={intl.formatMessage(narrativePedigreeMessages.diseaseVariableHint)}
        options={options}
        emptyMessage={intl.formatMessage(
          narrativePedigreeMessages.diseaseVariableEmpty,
        )}
        initialValue={currentVariable}
        required={intl.formatMessage(
          narrativePedigreeMessages.diseaseVariableRequired,
        )}
      />
      <Field<typeof NativeSelectField>
        name={INHERITANCE_FIELD}
        component={NativeSelectField}
        label={intl.formatMessage(
          narrativePedigreeMessages.diseaseInheritanceLabel,
        )}
        hint={intl.formatMessage(
          narrativePedigreeMessages.diseaseInheritanceHint,
        )}
        options={inheritanceOptions}
        placeholder={intl.formatMessage(
          narrativePedigreeMessages.diseaseInheritancePlaceholder,
        )}
        initialValue={asString(item.inheritancePattern)}
        required={intl.formatMessage(
          narrativePedigreeMessages.diseaseInheritanceRequired,
        )}
      />
    </>
  );
}

/**
 * How one disease reads in the list when its dialog is closed.
 *
 * Two things can be wrong with a row that nobody is currently editing, and the
 * row is where both are said.
 *
 * The source pedigree no longer recording the attribute is a badge beside the
 * name: the list's own validation REFUSES that save and names the diseases, so
 * what the row adds is which one to act on, the moment a collaborator removes
 * the nomination prompt rather than at the next submit.
 *
 * The attribute being GONE, re-typed, or claimed by one of the pedigree's own
 * slots is reported in full here and nowhere else. Those are the codebook's
 * facts rather than this stage's, so they are reported and the stage still
 * saves — see {@link diseaseRowIssue}. The row is marked invalid as well as
 * described, so it does not read as an acceptable mapping while carrying the
 * sentence that says it is not.
 */
export function DiseasePreview({ item }: RowPreviewProps) {
  const intl = useAppIntl();
  const protocolContext = useProtocolContext();
  const { roleMap, slotMap } = useDiseaseVariableIndexes();
  const subject = useDiseaseSubject();
  const sourceStageId = useStageValue(SOURCE_FIELD);
  const marksNobody = diseaseMarksNobody(
    item,
    sourceStageRecordedVariables(protocolContext, sourceStageId),
  );
  // Encoded where it is decided and decoded where it is read, like every other
  // message error: the rule is shared with the dialog, which states it outside
  // React where there is no formatter to reach.
  const issue = diseaseRowIssue({
    context: protocolContext,
    roleMap,
    slotMap,
    subject,
    sourceStageId,
    variableId: item.variable,
  });
  // Narrowed against the palette rather than cast: a stored colour the theme
  // no longer defines loses its swatch, and the row still reads.
  const color = NodeColorSequence.find((candidate) => candidate === item.color);

  return (
    <div
      className="flex flex-col gap-1 py-2.5"
      aria-invalid={issue === undefined ? undefined : true}
    >
      <div className="flex items-center gap-2.5">
        {color !== undefined && (
          <span
            className="inline-block size-4 shrink-0 rounded-full"
            style={{ background: resolveSwatchColor(color) }}
            aria-hidden="true"
          />
        )}
        <span>
          {asString(item.label) ??
            intl.formatMessage(narrativePedigreeMessages.diseaseUnnamed)}
        </span>
        {marksNobody && (
          <Badge variant="destructive">
            {intl.formatMessage(narrativePedigreeMessages.diseaseMarksNobody)}
          </Badge>
        )}
      </div>
      {issue !== undefined && (
        <p className="text-destructive text-sm">
          {formatMessageError(issue, intl) ?? issue}
        </p>
      )}
    </div>
  );
}
