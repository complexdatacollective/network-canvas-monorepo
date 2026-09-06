import { useMemo } from 'react';

import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import StyledSelectField from '@codaco/fresco-ui/form/fields/Select/Styled';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import {
  INHERITANCE_PATTERNS,
  type InheritancePattern,
  NodeColorSequence,
} from '@codaco/protocol-validation';

import {
  buildExclusiveVariableSlotMap,
  excludeInterfaceOwned,
} from '../../codebook/variableRoles.ts';
import { VariablePickerControl } from '../../fields/VariablePicker.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import { useStageValue } from '../../form/stageFormHooks.ts';
import type { CodebookSubject } from '../../protocol-context.ts';
import { variablesForSubject } from '../../protocol-context.ts';
import { protocolColor } from '../../protocolColor.ts';
import CreateVariableButton from '../pedigree/CreateVariableButton.tsx';
import type { RowEditorProps, RowPreviewProps } from '../rowRenderers.tsx';
import { narrativePedigreeMessages } from './narrativePedigreeMessages.ts';
import { sourceStageNodeType } from './sourceStage.ts';

const LABEL_FIELD = 'label';
const COLOR_FIELD = 'color';
const VARIABLE_FIELD = 'variable';
const INHERITANCE_FIELD = 'inheritancePattern';

/**
 * Author-facing names for each inheritance pattern. The pattern ids are schema
 * contract; these are editor copy, written out whole rather than derived from
 * the id, so a translator moves a phrase rather than reassembling one.
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
 * two diseases. Read from the LIVE rows rather than the saved stage: a disease
 * added in this session is not saved yet, and one just deleted must free its
 * attribute at once.
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
function useDiseaseSubject(): CodebookSubject | null {
  const { protocolContext } = useStageEditorForm();
  const sourceStageId = useStageValue('sourceStageId');
  return useMemo(() => {
    const nodeType = sourceStageNodeType(protocolContext, sourceStageId);
    return nodeType === undefined ? null : { entity: 'node', type: nodeType };
  }, [protocolContext, sourceStageId]);
}

/**
 * One disease: what it is called, how it is drawn, which attribute says who
 * has it, and how it travels through a family.
 *
 * The attribute pool is the source pedigree's boolean node attributes, minus
 * the ones the pedigree derives structurally. Mapping the participant marker
 * as a disease would paint the participant as affected in every interview,
 * which is why the schema refuses it and why the picker never offers it.
 *
 * A researcher describing a condition the codebook does not record yet creates
 * the attribute here rather than leaving the stage for the codebook and coming
 * back: it goes onto the source pedigree's own node type, through the session's
 * compound-edit path.
 */
export function DiseaseEditor({ item, editIndex }: RowEditorProps) {
  const intl = useAppIntl();
  const { protocolContext } = useStageEditorForm();
  const subject = useDiseaseSubject();
  const rows = useStageValue('diseases');
  const setFieldValue = useFormStore((state) => state.setFieldValue);
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

  const colorOptions = useMemo(
    () =>
      NodeColorSequence.map((value, index) => ({
        value,
        label: intl.formatMessage(
          narrativePedigreeMessages.diseaseColorOption,
          { position: index + 1 },
        ),
      })),
    [intl],
  );

  const options = useMemo(() => {
    if (subject === null) return [];
    const used = siblingVariables(rows, editIndex);
    const booleans = Object.entries(
      variablesForSubject(protocolContext, subject),
    )
      .filter(([, variable]) => variable.type === 'boolean')
      .map(([variableId, variable]) => ({
        value: variableId,
        label: variable.name,
        type: variable.type,
      }))
      .filter(
        (option) => option.value === currentVariable || !used.has(option.value),
      );
    return excludeInterfaceOwned(
      buildExclusiveVariableSlotMap(protocolContext),
      subject,
      booleans,
      currentVariable,
    );
  }, [currentVariable, editIndex, protocolContext, rows, subject]);

  return (
    <>
      <Field
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
      <Field
        name={COLOR_FIELD}
        component={NativeSelectField}
        label={intl.formatMessage(narrativePedigreeMessages.diseaseColorLabel)}
        hint={intl.formatMessage(narrativePedigreeMessages.diseaseColorHint)}
        options={colorOptions}
        placeholder={intl.formatMessage(
          narrativePedigreeMessages.diseaseColorPlaceholder,
        )}
        initialValue={asString(item.color)}
        required={intl.formatMessage(
          narrativePedigreeMessages.diseaseColorRequired,
        )}
      />
      <Field
        name={VARIABLE_FIELD}
        component={VariablePickerControl}
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
      <CreateVariableButton
        subject={subject}
        variableType="boolean"
        label={intl.formatMessage(
          narrativePedigreeMessages.diseaseCreateVariableLabel,
        )}
        description={intl.formatMessage(
          narrativePedigreeMessages.diseaseCreateVariableDescription,
        )}
        onCreated={(variableId) => setFieldValue(VARIABLE_FIELD, variableId)}
      />
      <Field
        name={INHERITANCE_FIELD}
        component={StyledSelectField}
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

/** How one disease reads in the list when its dialog is closed. */
export function DiseasePreview({ item }: RowPreviewProps) {
  const intl = useAppIntl();
  // Narrowed against the palette rather than cast: a stored colour the theme
  // no longer defines loses its swatch, and the row still reads.
  const color = NodeColorSequence.find((candidate) => candidate === item.color);
  return (
    <div className="flex items-center gap-2.5 py-2.5">
      {color !== undefined && (
        <span
          className="inline-block size-4 shrink-0 rounded-full"
          style={{ background: protocolColor(color) }}
          aria-hidden="true"
        />
      )}
      <span>
        {asString(item.label) ??
          intl.formatMessage(narrativePedigreeMessages.diseaseUnnamed)}
      </span>
    </div>
  );
}
