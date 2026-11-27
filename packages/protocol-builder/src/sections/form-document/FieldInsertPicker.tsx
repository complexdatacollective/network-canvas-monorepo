import { ArrowLeft } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import { IconButton } from '@codaco/fresco-ui/Button';
import { Popover, PopoverContent } from '@codaco/fresco-ui/Popover';
import { dropdownItemVariants } from '@codaco/fresco-ui/styles/controlVariants';
import { cx } from '@codaco/fresco-ui/utils/cva';
import type { VariableType } from '@codaco/protocol-validation';

import type { CreateOptionOutcome } from '../../fields/VariablePickerField.tsx';
import VariablePickerList, {
  type VariablePickerGroup,
} from '../../fields/VariablePickerList.tsx';
import { VariableKindMark } from '../../fields/VariablePill.tsx';
import { useSubjectVariableScope } from '../canvas/codebookChoices.ts';
import {
  controlsForType,
  needsCodebookEditorToCreate,
  TYPE_OPTIONS,
} from '../collectableTypes.ts';
import { useCreateVariableEditor } from '../create-variable/useCreateVariableEditor.tsx';
import type { FieldCodebookWrites } from './fieldCodebookWrites.ts';
import {
  type FieldBlockHandle,
  type FieldPickerTarget,
  fieldAttributeGroup,
  type FormDocumentStageEnvironment,
  formFieldsGroup,
  roleMapFor,
  useFormDocumentEnvironment,
  useFormStageEnvironment,
} from './formDocumentEnvironment.ts';
import { formDocumentMessages as messages } from './formDocumentMessages.ts';
import { fieldCollecting, variablesPlacedBy } from './formDocumentValue.ts';

/** What each type of attribute is, as the type step explains it. */
const TYPE_DESCRIPTIONS = {
  text: messages.textType,
  number: messages.numberType,
  datetime: messages.datetimeType,
  boolean: messages.booleanType,
  categorical: messages.categoricalType,
  ordinal: messages.ordinalType,
  scalar: messages.scalarType,
} as const;

/** The types a form can collect, in the order the type step lists them. */
const TYPE_ORDER = [
  'text',
  'number',
  'datetime',
  'boolean',
  'categorical',
  'ordinal',
  'scalar',
] as const;

const COLLECTABLE_TYPES = TYPE_ORDER.flatMap((type) => {
  const option = TYPE_OPTIONS.find(({ value }) => value === type);
  return option === undefined ? [] : [{ value: type, label: option.label }];
});

type FieldInsertPickerProps = Readonly<{
  target: FieldPickerTarget;
  /** The block that the picker finishes, once its view has registered it. */
  block: () => FieldBlockHandle | undefined;
  /** The picker is done: an attribute was chosen, or it was dismissed. */
  onClose: (outcome: 'chosen' | 'dismissed') => void;
}>;

/**
 * Creates an attribute through the codebook's own editor, for a type that a
 * name cannot finish (a list of options, a scale), as soon as it is drawn.
 */
function EditorCreate({
  name,
  type,
  onDone,
}: Readonly<{
  name: string;
  type: VariableType;
  onDone: (variableId: string | undefined) => void;
}>) {
  const intl = useAppIntl();
  const { subject } = useFormStageEnvironment();
  const created = useRef<string | undefined>(undefined);
  const firstControl = controlsForType(type)[0]?.value;
  const editorPath = useCreateVariableEditor({
    subject: subject ?? null,
    variableTypes: [type],
    // A form collects the attribute: it is made with the first control its
    // type offers, as an attribute that a name finishes is.
    ...(firstControl !== undefined && { seedComponent: firstControl }),
    title: intl.formatMessage(messages.newAttributeTitle, { name }),
    onCreated: (variableId) => {
      created.current = variableId;
    },
  });
  const { createOption } = editorPath;
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    void (async () => {
      const outcome = await createOption(name);
      done.current(outcome.status === 'created' ? created.current : undefined);
    })();
  }, [createOption, name]);
  return editorPath.editor;
}

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
  const intl = useAppIntl();
  const environment = useFormDocumentEnvironment();
  const nameId = useId();
  const [creating, setCreating] = useState<string | undefined>(undefined);
  const [escalated, setEscalated] = useState<
    Readonly<{ name: string; type: VariableType }> | undefined
  >(undefined);
  const [refusal, setRefusal] = useState<string | undefined>(undefined);
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

  const createAs = async (name: string, type: VariableType) => {
    setRefusal(undefined);
    if (needsCodebookEditorToCreate(type)) {
      setEscalated({ name, type });
      return;
    }
    if (creation === undefined) return;
    const outcome = await creation.createAttribute(name, type);
    if (outcome.status === 'refused') {
      setRefusal(outcome.message);
      return;
    }
    choose(outcome.variableId);
  };

  const startCreate = (name: string): Promise<CreateOptionOutcome> => {
    stepping.current = true;
    setCreating(name);
    return Promise.resolve({ status: 'created' });
  };

  const open = escalated === undefined;

  // The keyboard moves with the list's two steps: to the first type when
  // the type step opens, and back to the search box when it closes.
  const popup = useRef<HTMLDivElement>(null);
  const firstType = useRef<HTMLButtonElement>(null);
  const backToSearch = useRef(false);
  useEffect(() => {
    if (creating !== undefined) {
      firstType.current?.focus();
      return;
    }
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
              <div className="flex flex-col gap-2 p-2" data-type-step="">
                <div className="flex items-start gap-2">
                  <IconButton
                    size="sm"
                    variant="text"
                    aria-label="Back to the attributes"
                    icon={
                      <ArrowLeft aria-hidden className="rtl:-scale-x-100" />
                    }
                    onClick={() => {
                      backToSearch.current = true;
                      setCreating(undefined);
                    }}
                  />
                  <div>
                    <p className="font-heading font-bold">
                      {intl.formatMessage(messages.newAttributeTitle, {
                        name: (
                          <span
                            key="name"
                            dir="auto"
                            className="text-match-parent font-mono"
                          >
                            {creating}
                          </span>
                        ),
                      })}
                    </p>
                    <p className="text-sm text-current/70">
                      {intl.formatMessage(messages.newAttributeDescription)}
                    </p>
                  </div>
                </div>
                <ul className="flex flex-col">
                  {COLLECTABLE_TYPES.map(({ value, label }, index) => (
                    <li key={value}>
                      <button
                        ref={index === 0 ? firstType : undefined}
                        type="button"
                        className={cx(
                          dropdownItemVariants(),
                          'flex w-full items-start gap-3 text-start',
                        )}
                        onClick={() => void createAs(creating, value)}
                      >
                        <VariableKindMark kind={value} className="mt-0.5" />
                        <span className="flex flex-col">
                          <span className="font-bold">
                            {intl.formatMessage(label)}
                          </span>
                          <span className="text-sm text-current/70">
                            {intl.formatMessage(TYPE_DESCRIPTIONS[value])}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {refusal !== undefined && (
                  <p role="alert" className="text-destructive text-sm">
                    {refusal}
                  </p>
                )}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {escalated !== undefined && (
        <EditorCreate
          name={escalated.name}
          type={escalated.type}
          onDone={(variableId) => {
            setEscalated(undefined);
            if (variableId === undefined) return;
            choose(variableId);
          }}
        />
      )}
    </>
  );
}
