import { useMemo } from 'react';

import { Badge } from '@codaco/fresco-ui/Badge';
import Field from '@codaco/fresco-ui/form/Field/Field';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';

import RichTextField from '../../fields/RichTextField.tsx';
import { VariablePickerControl } from '../../fields/VariablePicker.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import { useStageValue } from '../../form/stageFormHooks.ts';
import type { CodebookSubject } from '../../protocol-context.ts';
import { variablesForSubject } from '../../protocol-context.ts';
import type { RowEditorProps, RowPreviewProps } from '../rowRenderers.tsx';
import CreateVariableButton from './CreateVariableButton.tsx';
import { usePedigreeVariableIndexes } from './entityTypeReset.ts';
import { slotPickerOptions, subjectVariableOptions } from './slotWiring.ts';

const TEXT_FIELD = 'text';
const VARIABLE_FIELD = 'variable';

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
 */
export function NominationPromptEditor({ item }: RowEditorProps) {
  const { protocolContext } = useStageEditorForm();
  const { roleMap, slotMap } = usePedigreeVariableIndexes();
  const subject = useNominationSubject();
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const { variable } = useFormValue([VARIABLE_FIELD] as const);
  const currentValue = asString(variable) ?? asString(item.variable);

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
        // so every attribute another slot owns is out of bounds.
        writerClass: 'unvalidated',
      }),
    [currentValue, protocolContext, roleMap, slotMap, subject],
  );

  return (
    <>
      <Field
        name={TEXT_FIELD}
        component={RichTextField}
        singleLine
        label="Prompt text"
        hint="The question the participant answers for each family member."
        placeholder="Enter your prompt..."
        initialValue={asString(item.text)}
        required="Enter the question this prompt asks."
      />
      <Field
        name={VARIABLE_FIELD}
        component={VariablePickerControl}
        label="Attribute"
        hint="The boolean attribute each answer is recorded in."
        initialValue={asString(item.variable)}
        options={options}
        emptyMessage="No boolean attributes of this node type can be nominated yet. Create one to continue."
        required="Choose the attribute this prompt records."
      />
      <CreateVariableButton
        subject={subject}
        variableType="boolean"
        label="Create a new nomination attribute"
        description="Create a boolean attribute for this nomination prompt"
        onCreated={(variableId) => setFieldValue(VARIABLE_FIELD, variableId)}
      />
    </>
  );
}

/** How one nomination prompt reads in the list when its dialog is closed. */
export function NominationPromptPreview({ item }: RowPreviewProps) {
  const { protocolContext } = useStageEditorForm();
  const subject = useNominationSubject();
  const variableId = asString(item.variable);
  const attribute =
    subject === null || variableId === undefined
      ? undefined
      : variablesForSubject(protocolContext, subject)[variableId];

  return (
    <div className="flex flex-col gap-2.5">
      <RenderMarkdown>{asString(item.text) ?? 'Empty prompt'}</RenderMarkdown>
      {attribute !== undefined && (
        <div>
          {/* One whole sentence rather than assembled fragments: what reads
              naturally around an attribute's name is not the same in every
              language. */}
          <Badge>{`Records the boolean attribute "${attribute.name}"`}</Badge>
        </div>
      )}
    </div>
  );
}
