import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import { Popover, PopoverContent } from '@codaco/fresco-ui/Popover';

import type { CreateOptionOutcome } from '../../fields/VariablePickerField.tsx';
import VariablePickerList, {
  type VariablePickerGroup,
} from '../../fields/VariablePickerList.tsx';
import { useSubjectVariableScope } from '../canvas/codebookChoices.ts';
import type { FieldCodebookWrites } from './fieldCodebookWrites.ts';
import {
  type FieldBlockHandle,
  type FieldPickerTarget,
  fieldAttributeGroup,
  type FormDocumentStageEnvironment,
  formFieldsGroup,
  roleMapFor,
  useFormDocumentEnvironment,
} from './formDocumentEnvironment.ts';
import { fieldCollecting, variablesPlacedBy } from './formDocumentValue.ts';
import {
  NewAttributeTypeStep,
  useNewFieldAttribute,
} from './NewAttributeTypeStep.tsx';

type FieldInsertPickerProps = Readonly<{
  target: FieldPickerTarget;
  /** The block that the picker finishes, once its view has registered it. */
  block: () => FieldBlockHandle | undefined;
  /** The picker is done: an attribute was chosen, or it was dismissed. */
  onClose: (outcome: 'chosen' | 'dismissed') => void;
}>;

/**
 * The attribute list of a new field, which stands beside the Field button
 * (or, for a field put in with the keyboard, beside the new block): the
 * attributes of the form's subject, those that cannot be chosen dimmed in
 * place with the reason under them, and a row that creates an attribute from
 * the name typed in its search box, followed by a step that asks for the
 * type of the new attribute.
 *
 * Choosing an attribute that a field of this form collects in another
 * language's document makes the new block that field. Dismissing the list
 * takes away a block that is still empty; one with a question or a hint stays,
 * without an attribute, and its pill opens the list again.
 */
export function FieldInsertPicker(props: FieldInsertPickerProps) {
  const { editing } = useFormDocumentEnvironment();
  return editing.kind === 'stage' ? (
    <StagePickerList {...props} stage={editing} />
  ) : (
    <TranslationPickerList {...props} />
  );
}

/**
 * The list in a stage editor: the subject's attributes, and a create row
 * that names new attributes against the stage's codebook.
 */
function StagePickerList({
  stage,
  ...props
}: FieldInsertPickerProps & Readonly<{ stage: FormDocumentStageEnvironment }>) {
  const intl = useAppIntl();
  const environment = useFormDocumentEnvironment();
  const nameScope = useSubjectVariableScope(stage.subject);
  const message = environment.content[environment.locale];
  const roleMap = useMemo(
    () => roleMapFor(stage.protocolContext, stage.rules.answeredFor),
    [stage.protocolContext, stage.rules.answeredFor],
  );
  const group = useMemo(
    () =>
      fieldAttributeGroup({
        intl,
        subject: stage.subject,
        variables: environment.variables,
        roleMap,
        rules: stage.rules,
        taken: variablesPlacedBy(environment.fields, message),
        held: undefined,
      }),
    [
      environment.fields,
      environment.variables,
      intl,
      message,
      roleMap,
      stage.rules,
      stage.subject,
    ],
  );
  return (
    <PickerList
      {...props}
      group={group}
      creation={{ nameScope, createAttribute: stage.writes.createAttribute }}
      selectsChosenField={false}
    />
  );
}

/**
 * The list in the translation table: the form's own fields. New attributes
 * are made in the stage editor, and a chosen field is selected, since its
 * question is not typed in its block.
 */
function TranslationPickerList(props: FieldInsertPickerProps) {
  const intl = useAppIntl();
  const environment = useFormDocumentEnvironment();
  const message = environment.content[environment.locale];
  const group = useMemo(
    () =>
      formFieldsGroup({
        intl,
        variables: environment.variables,
        fields: environment.fields,
        placed: variablesPlacedBy(environment.fields, message),
      }),
    [environment.fields, environment.variables, intl, message],
  );
  return (
    <PickerList
      {...props}
      group={group}
      creation={undefined}
      selectsChosenField
    />
  );
}

function PickerList({
  target,
  block,
  onClose,
  group,
  creation,
  selectsChosenField,
}: FieldInsertPickerProps &
  Readonly<{
    group: VariablePickerGroup;
    /** How the list's create row names and makes a new attribute. */
    creation:
      | Readonly<{
          nameScope: ReturnType<typeof useSubjectVariableScope>;
          createAttribute: FieldCodebookWrites['createAttribute'];
        }>
      | undefined;
    /** Whether the chosen field is selected, rather than its question. */
    selectsChosenField: boolean;
  }>) {
  const environment = useFormDocumentEnvironment();
  const nameId = useId();
  const [creating, setCreating] = useState<string | undefined>(undefined);
  // Set as a create starts, before the list asks to close.
  const stepping = useRef(false);

  // Whether the picker has finished: a choice, a create or a dismissal. The
  // list asks to close after a choice as well as on Escape, in either order.
  const settled = useRef(false);

  const choose = (variableId: string) => {
    settled.current = true;
    const handle = block();
    if (handle === undefined) {
      onClose('dismissed');
      return;
    }
    const existing = fieldCollecting(environment.fields, variableId);
    if (existing === undefined || existing.id === target.fieldId) {
      handle.update({ variable: variableId });
    } else {
      // The new block is that field from now on, still being put in.
      if (target.repair !== true) environment.startField(existing.id);
      environment.takeField(handle, existing.id, variableId);
    }
    if (selectsChosenField) handle.select();
    onClose('chosen');
  };

  const dismiss = () => {
    if (settled.current) return;
    settled.current = true;
    const handle = block();
    if (target.repair !== true && handle?.isEmpty() === true) handle.remove();
    onClose('dismissed');
  };

  const newAttribute = useNewFieldAttribute(creation?.createAttribute, (id) =>
    choose(id),
  );

  const startCreate = (name: string): Promise<CreateOptionOutcome> => {
    stepping.current = true;
    setCreating(name);
    return Promise.resolve({ status: 'created' });
  };

  // While the codebook's own editor creates the attribute, the list is
  // closed: the editor is a dialog over it.
  const open = newAttribute.editor === null;

  // The keyboard goes back to the search box as the type step closes (the
  // step itself takes it as it opens).
  const popup = useRef<HTMLDivElement>(null);
  const backToSearch = useRef(false);
  useEffect(() => {
    if (creating !== undefined) return;
    if (backToSearch.current) {
      backToSearch.current = false;
      popup.current?.querySelector<HTMLElement>('input')?.focus();
    }
  }, [creating]);

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (!next) dismiss();
        }}
      >
        <PopoverContent
          anchor={target.anchor}
          side="bottom"
          align={target.origin === 'toolbar' ? 'center' : 'start'}
          aria-labelledby={nameId}
          finalFocus={false}
          spacing="xs"
          className="w-[28rem] max-w-full"
          data-field-insert-picker={target.fieldId}
          data-picker-origin={target.origin}
        >
          <span id={nameId} className="sr-only" lang="en">
            {target.repair === true
              ? 'Attribute of the field'
              : 'Attribute of the new field'}
          </span>
          <div ref={popup} className="contents">
            {creating === undefined ? (
              <VariablePickerList
                aria-labelledby={nameId}
                groups={[group]}
                onSelect={choose}
                {...(creation !== undefined && {
                  onCreateOption: startCreate,
                  ...(creation.nameScope !== undefined && {
                    nameScope: creation.nameScope,
                  }),
                })}
                onOpenChange={(next) => {
                  if (next) return;
                  // Asked after a choice or a create too: only a close that
                  // nothing else answers is a dismissal.
                  queueMicrotask(() => {
                    if (stepping.current) {
                      stepping.current = false;
                      return;
                    }
                    dismiss();
                  });
                }}
              />
            ) : (
              <NewAttributeTypeStep
                name={creating}
                refusal={newAttribute.refusal}
                onBack={() => {
                  backToSearch.current = true;
                  setCreating(undefined);
                }}
                onChoose={(type) => void newAttribute.createAs(creating, type)}
              />
            )}
          </div>
        </PopoverContent>
      </Popover>
      {newAttribute.editor}
    </>
  );
}
