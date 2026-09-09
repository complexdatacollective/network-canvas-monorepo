import { useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import { Badge } from '@codaco/fresco-ui/Badge';
import Field from '@codaco/fresco-ui/form/Field/Field';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';

import RichTextField from '../../../fields/RichTextField.tsx';
import VariablePickerField from '../../../fields/VariablePickerField.tsx';
import type {
  RowEditorProps,
  RowPreviewProps,
} from '../../../form/rowDialog.tsx';
import { useStageValue } from '../../../form/stageFormHooks.ts';
import type { CodebookSubject } from '../../../protocol-context.ts';
import { variablesForSubject } from '../../../protocol-context.ts';
import CreateVariableButton from '../../../sections/create-variable/CreateVariableButton.tsx';
import { useProtocolContext } from '../../../state/protocolContext.ts';
import { usePedigreeVariableIndexes } from './entityTypeReset.ts';
import { pedigreeMessages } from './pedigreeMessages.ts';
import {
  draftRowVariables,
  slotPickerOptions,
  subjectVariableOptions,
} from './slotWiring.ts';

const TEXT_FIELD = 'text';
const VARIABLE_FIELD = 'variable';
const FORM_FIELD_PATH = 'nodeConfig.form';

/**
 * The node type a nomination prompt's attribute belongs to.
 *
 * Read from the stage form rather than passed in: the row dialog mounts a form
 * store of its own, but the stage editor context is deliberately not
 * re-provided, so everything inside the dialog can still see the stage around
 * it.
 */
function useNominationSubject(): CodebookSubject | null {
  const nodeType = useStageValue('nodeConfig.type');
  return useMemo(
    () =>
      typeof nodeType === 'string' ? { entity: 'node', type: nodeType } : null,
    [nodeType],
  );
}

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

/**
 * One nomination prompt: a question, and the boolean attribute the
 * participant's answer is written into.
 *
 * The picker offers only boolean attributes of the pedigree's node type that
 * nothing else already writes — a form elsewhere would have its validation
 * bypassed, and an attribute the pedigree derives structurally (the
 * participant marker above all) would be overwritten every time the
 * participant answered.
 *
 * "Nothing else" includes the stage the researcher has open. The family member
 * form is one section above this dialog, and a field added there in this
 * session is in no saved protocol yet: read from the committed protocol alone,
 * the picker offered the very attribute that field collects, and the refusal
 * arrived at the save.
 */
export function NominationPromptEditor({ item }: RowEditorProps) {
  const intl = useAppIntl();
  const protocolContext = useProtocolContext();
  const { roleMap, slotMap, draftSlotMap } = usePedigreeVariableIndexes();
  const subject = useNominationSubject();
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const { variable } = useFormValue([VARIABLE_FIELD] as const);
  const currentValue = asString(variable) ?? asString(item.variable);
  // The stage form behind this dialog, which the dialog's own form store does
  // not hide: see `useNominationSubject`.
  const formRows = useStageValue(FORM_FIELD_PATH);
  const draftConflicting = useMemo(
    () => draftRowVariables(formRows),
    [formRows],
  );

  const options = useMemo(
    () =>
      slotPickerOptions({
        roleMap,
        slotMap,
        subject,
        options: subjectVariableOptions(protocolContext, subject).filter(
          (option) => option.type === 'boolean',
        ),
        ...(currentValue === undefined ? {} : { currentValue }),
        // No `ownSlot`: a nomination toggle fills no interface slot of its own,
        // so every attribute another slot owns is out of bounds — including
        // one a slot in this stage has only just been bound to.
        writerClass: 'unvalidated',
        draftConflicting,
        draftSlotMap,
      }),
    [
      currentValue,
      draftConflicting,
      draftSlotMap,
      protocolContext,
      roleMap,
      slotMap,
      subject,
    ],
  );

  return (
    <>
      <Field
        name={TEXT_FIELD}
        component={RichTextField}
        singleLine
        label={intl.formatMessage(pedigreeMessages.nominationTextLabel)}
        hint={intl.formatMessage(pedigreeMessages.nominationTextHint)}
        placeholder={intl.formatMessage(
          pedigreeMessages.nominationTextPlaceholder,
        )}
        initialValue={asString(item.text)}
        required={intl.formatMessage(pedigreeMessages.nominationTextRequired)}
      />
      <Field
        name={VARIABLE_FIELD}
        component={VariablePickerField}
        label={intl.formatMessage(pedigreeMessages.nominationVariableLabel)}
        hint={intl.formatMessage(pedigreeMessages.nominationVariableHint)}
        initialValue={asString(item.variable)}
        options={options}
        emptyMessage={intl.formatMessage(
          pedigreeMessages.nominationVariableEmpty,
        )}
        required={intl.formatMessage(
          pedigreeMessages.nominationVariableRequired,
        )}
      />
      <CreateVariableButton
        subject={subject}
        variableType="boolean"
        label={intl.formatMessage(pedigreeMessages.nominationCreateLabel)}
        onCreated={(variableId) => setFieldValue(VARIABLE_FIELD, variableId)}
      />
    </>
  );
}

/** How one nomination prompt reads in the list when its dialog is closed. */
export function NominationPromptPreview({ item }: RowPreviewProps) {
  const intl = useAppIntl();
  const protocolContext = useProtocolContext();
  const subject = useNominationSubject();
  const variableId = asString(item.variable);
  const attribute =
    subject === null || variableId === undefined
      ? undefined
      : variablesForSubject(protocolContext, subject)[variableId];

  return (
    <div className="flex flex-col gap-2.5">
      <RenderMarkdown>
        {asString(item.text) ??
          intl.formatMessage(pedigreeMessages.nominationPreviewEmptyText)}
      </RenderMarkdown>
      {attribute !== undefined && (
        <div>
          {/* One whole sentence rather than assembled fragments: what reads
              naturally around an attribute's name is not the same in every
              language. */}
          <Badge>
            {intl.formatMessage(pedigreeMessages.nominationPreviewRecords, {
              attributeName: attribute.name,
            })}
          </Badge>
        </div>
      )}
    </div>
  );
}
