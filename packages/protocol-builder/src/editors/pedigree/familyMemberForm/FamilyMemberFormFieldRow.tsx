import { useMemo } from 'react';

import { Badge } from '@codaco/fresco-ui/Badge';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';

import { VariablePickerControl } from '../../../fields/VariablePicker.tsx';
import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import { useStageValue } from '../../../form/stageFormHooks.ts';
import type { CodebookSubject } from '../../../protocol-context.ts';
import { variablesForSubject } from '../../../protocol-context.ts';
import { usePedigreeVariableIndexes } from '../../../sections/pedigree/entityTypeReset.ts';
import {
  slotPickerOptions,
  subjectVariableOptions,
} from '../../../sections/pedigree/slotWiring.ts';
import type {
  RowEditorProps,
  RowPreviewProps,
} from '../../../sections/rowRenderers.tsx';

/**
 * THE SEAM. What a form field can be — which attribute it collects, which
 * input control the participant answers it with, how the answer is validated —
 * is shared with every other form in the protocol, and belongs to the form
 * fields family rather than to the pedigree. That editor is being built with
 * the AlterForm/EgoForm editors and will be lifted to the shared branch.
 *
 * Until it lands, this composes `PedigreeNodeConfigurationSection`'s family
 * member form with the part the pedigree itself constrains: which attribute a
 * field writes, and the fact that a form field is a VALIDATED writer, so it
 * may not take an attribute the pedigree derives structurally. The picker is
 * built from the same two indexes the pedigree's own slots use, so the two
 * cannot disagree about which attributes are already claimed.
 *
 * Swapping it is a two-line change in `FamilyPedigreeStageEditor`: import the
 * shared form-field editor and preview, and drop this directory.
 */
const VARIABLE_FIELD = 'variable';
const PROMPT_FIELD = 'prompt';
const HINT_FIELD = 'hint';

const NODE_TYPE_FIELD = 'nodeConfig.type';

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

/**
 * The node type a family member form field's attribute belongs to.
 *
 * Read from the stage form rather than passed in: the row dialog mounts a form
 * store of its own, but the stage editor context is deliberately not
 * re-provided, so everything inside the dialog can still see the stage around
 * it.
 */
function useFamilyMemberSubject(): CodebookSubject | null {
  const nodeType = useStageValue(NODE_TYPE_FIELD);
  return useMemo(
    () =>
      typeof nodeType === 'string' ? { entity: 'node', type: nodeType } : null,
    [nodeType],
  );
}

/** One field of the form the participant answers about each family member. */
export function FamilyMemberFormFieldEditor({ item }: RowEditorProps) {
  const { protocolContext } = useStageEditorForm();
  const { roleMap, slotMap } = usePedigreeVariableIndexes();
  const subject = useFamilyMemberSubject();
  const { variable } = useFormValue([VARIABLE_FIELD] as const);
  const currentValue = asString(variable) ?? asString(item.variable);

  const options = useMemo(
    () =>
      slotPickerOptions({
        roleMap,
        slotMap,
        subject,
        options: subjectVariableOptions(protocolContext, subject),
        ...(currentValue === undefined ? {} : { currentValue }),
        // A form field collects an answer through a control that validates it,
        // so it is the validated writer of the pair — and may not take an
        // attribute the pedigree writes from the family tree instead.
        writerClass: 'validated',
      }),
    [currentValue, protocolContext, roleMap, slotMap, subject],
  );

  return (
    <>
      <Field
        name={PROMPT_FIELD}
        component={InputField}
        label="Question"
        hint="What the participant is asked about each family member."
        placeholder="Enter your question..."
        initialValue={asString(item.prompt)}
        required="Write the question this field asks."
      />
      <Field
        name={VARIABLE_FIELD}
        component={VariablePickerControl}
        label="Attribute"
        hint="The attribute each answer is recorded in."
        initialValue={asString(item.variable)}
        options={options}
        emptyMessage="No attributes of this node type can be collected by a form yet. Create one in the codebook to continue."
        required="Choose the attribute this field records."
      />
      <Field
        name={HINT_FIELD}
        component={InputField}
        label="Help text"
        hint="Shown under the question, for anything the participant might need explained. Optional."
        placeholder="Enter help text..."
        initialValue={asString(item.hint)}
      />
    </>
  );
}

/** How one form field reads in the list when its dialog is closed. */
export function FamilyMemberFormFieldPreview({ item }: RowPreviewProps) {
  const { protocolContext } = useStageEditorForm();
  const subject = useFamilyMemberSubject();
  const variableId = asString(item.variable);
  const attribute =
    subject === null || variableId === undefined
      ? undefined
      : variablesForSubject(protocolContext, subject)[variableId];

  return (
    <div className="flex flex-col gap-2.5">
      <span>{asString(item.prompt) ?? 'Empty field'}</span>
      {attribute !== undefined && (
        <div>
          {/* One whole sentence rather than assembled fragments: what reads
              naturally around an attribute's name is not the same in every
              language. */}
          <Badge>{`Records the attribute "${attribute.name}"`}</Badge>
        </div>
      )}
    </div>
  );
}
