import { type ReactNode, useEffect } from 'react';

import Field from '@codaco/fresco-ui/form/Field/Field';
import type {
  FieldProps,
  ValidFieldComponent,
} from '@codaco/fresco-ui/form/Field/types';

import { useSectionScope, useStageEditorForm } from './stageEditorContext.ts';
import { useStageInitialValue } from './stageFormHooks.ts';

/**
 * Props the form store owns. `Field` spreads caller props last, so a
 * caller-supplied `value` or `onChange` would REPLACE the store-connected
 * pair and quietly detach the field from form state. They are excluded from
 * the type and stripped at runtime so a spread props object cannot smuggle
 * one through; a side effect on change belongs in an effect reading the
 * field's value, not in a handler that displaces the store's.
 */
const STORE_OWNED_PROPS = ['value', 'onChange'] as const;

/**
 * Fresco's built-in required copy addresses a participant mid-interview. A
 * protocol is authored by a researcher, so the rule is stated instead.
 */
const REQUIRED_MESSAGE = 'This field is required.';

function stripStoreOwnedProps<T extends object>(props: T): T {
  const stripped = { ...props };
  for (const key of STORE_OWNED_PROPS) {
    Reflect.deleteProperty(stripped, key);
  }
  return stripped;
}

/**
 * A hidden label and a visible hint cannot coexist: the hint would be prose
 * with nothing naming it on screen, and a hint is never appropriate as
 * screen-reader-only text. A field is either naked — named by its
 * surroundings, saying nothing more — or it shows both.
 */
type LabellingProps =
  | { labelHidden: true; hint?: never }
  | { labelHidden?: false; hint?: ReactNode };

export type ProtocolFieldProps<C extends ValidFieldComponent> = Omit<
  FieldProps<C>,
  'labelHidden' | 'hint'
> &
  LabellingProps;

/**
 * The protocol builder's field primitive: a Fresco `Field` that also tells the
 * section around it that it exists.
 *
 * That registration is what the section outline is built from — a section's
 * error, incomplete and complete states are read off the fields currently
 * mounted inside it — and it is why `label` is required here even though
 * Fresco would accept a field without one: the label is the name the outline
 * and a host's problem panel give the field, so the researcher reads the same
 * words above the control and in the list of problems.
 *
 * A field's `name` is also its path into the stage document, so its committed
 * value is seeded from there rather than being wired up again by every section
 * that renders a field. A section meaning something else can still pass its
 * own `initialValue`.
 */
export default function ProtocolField<C extends ValidFieldComponent>(
  props: ProtocolFieldProps<C>,
) {
  const { outline, readOnly } = useStageEditorForm();
  const sectionId = useSectionScope();
  const { name, label, required } = props;
  const isRequired = required === true || typeof required === 'string';
  const committedValue = useStageInitialValue(name);

  useEffect(() => {
    if (sectionId === null) return;
    return outline.registerField(sectionId, {
      name,
      label,
      required: isRequired,
    });
  }, [isRequired, label, name, outline, sectionId]);

  const fieldProps = {
    ...stripStoreOwnedProps(props),
    initialValue: props.initialValue ?? committedValue,
    // Read-only is a property of the session, not of any one control, so no
    // section has to remember to pass it down.
    disabled: props.disabled === true || readOnly,
    // A section says a field is required; what that reads like when it is
    // empty is the package's business, and the same everywhere.
    ...(required === true ? { required: REQUIRED_MESSAGE } : {}),
  } as FieldProps<C>;

  return <Field<C> {...fieldProps} />;
}
