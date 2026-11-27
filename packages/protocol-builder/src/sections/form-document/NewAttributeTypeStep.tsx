import { ArrowLeft } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import { IconButton } from '@codaco/fresco-ui/Button';
import { dropdownItemVariants } from '@codaco/fresco-ui/styles/controlVariants';
import { cx } from '@codaco/fresco-ui/utils/cva';
import type { VariableType } from '@codaco/protocol-validation';

import { VariableKindMark } from '../../fields/VariablePill.tsx';
import {
  controlsForType,
  needsCodebookEditorToCreate,
  TYPE_OPTIONS,
} from '../collectableTypes.ts';
import { useCreateVariableEditor } from '../create-variable/useCreateVariableEditor.tsx';
import type { FieldCodebookWrites } from './fieldCodebookWrites.ts';
import { useFormStageEnvironment } from './formDocumentEnvironment.ts';
import { formDocumentMessages as messages } from './formDocumentMessages.ts';

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
 * Creates a field's new attribute once its type is chosen: at once, with
 * `createAttribute`, for a type that a name finishes, and through the
 * codebook's own editor (`editor`, to be drawn by the caller) for one that
 * needs options or a scale. `created` is told the new attribute's id.
 * Without `createAttribute` (outside a stage editor), nothing is created.
 */
export function useNewFieldAttribute(
  createAttribute: FieldCodebookWrites['createAttribute'] | undefined,
  created: (variableId: string) => void,
): Readonly<{
  createAs: (name: string, type: VariableType) => Promise<void>;
  refusal: string | undefined;
  editor: ReactNode;
}> {
  const [escalated, setEscalated] = useState<
    Readonly<{ name: string; type: VariableType }> | undefined
  >(undefined);
  const [refusal, setRefusal] = useState<string | undefined>(undefined);
  const createAs = async (name: string, type: VariableType) => {
    setRefusal(undefined);
    if (needsCodebookEditorToCreate(type)) {
      setEscalated({ name, type });
      return;
    }
    if (createAttribute === undefined) return;
    const outcome = await createAttribute(name, type);
    if (outcome.status === 'refused') {
      setRefusal(outcome.message);
      return;
    }
    created(outcome.variableId);
  };
  return {
    createAs,
    refusal,
    editor:
      escalated === undefined ? null : (
        <EditorCreate
          name={escalated.name}
          type={escalated.type}
          onDone={(variableId) => {
            setEscalated(undefined);
            if (variableId !== undefined) created(variableId);
          }}
        />
      ),
  };
}

/**
 * The step in which the type of a new attribute is chosen, after its name is
 * typed in the attribute list: a heading naming it, a button back to the
 * list, and a row for each type that a form can collect, which focus moves
 * to as the step opens. Shown by the list of a new field and by a field's
 * settings.
 */
export function NewAttributeTypeStep({
  name,
  onBack,
  onChoose,
  refusal,
}: Readonly<{
  name: string;
  onBack: () => void;
  onChoose: (type: VariableType) => void;
  refusal: string | undefined;
}>) {
  const intl = useAppIntl();
  const firstType = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    firstType.current?.focus();
  }, []);
  return (
    <div className="flex flex-col gap-2 p-2" data-type-step="">
      <div className="flex items-start gap-2">
        <IconButton
          size="sm"
          variant="text"
          aria-label="Back to the attributes"
          icon={<ArrowLeft aria-hidden className="rtl:-scale-x-100" />}
          onClick={onBack}
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
                  {name}
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
              onClick={() => onChoose(value)}
            >
              <VariableKindMark kind={value} className="mt-0.5" />
              <span className="flex flex-col">
                <span className="font-bold">{intl.formatMessage(label)}</span>
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
  );
}
