import { useMemo } from 'react';

import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import { useField } from '@codaco/fresco-ui/form/hooks/useField';
import { useStageInitialValue } from '~/components/StageEditor/stageFormHooks';

/**
 * A stand-in for `EditableAttributesList` that connects to the stage form the
 * same way the real one does (its own controls pull in the whole composer
 * attribute editor — dialog, codebook selectors, contradiction checks — which
 * the tests using this have no use for).
 *
 * Connecting it for real is the point: what reaches the saved stage is
 * `getFormValues()`, which reports REGISTERED fields only, so a stub that just
 * renders a div could not show the defect these tests cover. It therefore
 * mirrors BOTH of the real component's modes, and picks between them exactly
 * as the real one does:
 *
 * - given an `onChange`, it is a controlled list and registers nothing — the
 *   owning container field is the only field in the store;
 * - otherwise it registers `fieldName` itself with the committed value as its
 *   `initialValue`, which is what `ArchitectArrayField` does.
 */
export type Attribute = { variable: string };

/** Stable empty array: `initialValue` is a register-effect dependency. */
const NO_FIELDS: Attribute[] = [];

const asAttributes = (value: unknown): Attribute[] =>
  Array.isArray(value) ? (value as Attribute[]) : NO_FIELDS;

type ListViewProps = {
  fieldName: string;
  type: string | null;
  value: Attribute[];
  onChange: (fields: Attribute[]) => void;
};

const ListView = ({ fieldName, type, value, onChange }: ListViewProps) => (
  <div
    data-testid="attributes-list"
    data-fieldname={fieldName}
    data-type={type ?? ''}
  >
    <span data-testid={`attributes-${type ?? 'none'}`}>
      {value.map((field) => field.variable).join(',')}
    </span>
    <button
      type="button"
      onClick={() => onChange([...value, { variable: `${type}-added` }])}
    >
      Add attribute to {type}
    </button>
  </div>
);

/** The uncontrolled mode: one registered field holding the whole array. */
const RegisteredList = ({
  fieldName,
  type,
}: {
  fieldName: string;
  type: string | null;
}) => {
  const committed = useStageInitialValue(fieldName);
  const initialValue = useMemo(() => asAttributes(committed), [committed]);
  const { fieldProps } = useField({
    name: fieldName,
    initialValue: initialValue as FieldValue,
  });

  return (
    <ListView
      fieldName={fieldName}
      type={type}
      value={asAttributes(fieldProps.value)}
      onChange={(fields) => fieldProps.onChange(fields as FieldValue)}
    />
  );
};

type EdgeAttributesListStubProps = {
  fieldName: string;
  type: string | null;
  value?: Record<string, unknown>[];
  onChange?: (fields: Record<string, unknown>[]) => void;
};

const EdgeAttributesListStub = ({
  fieldName,
  type,
  value,
  onChange,
}: EdgeAttributesListStubProps) =>
  onChange ? (
    <ListView
      fieldName={fieldName}
      type={type}
      value={asAttributes(value)}
      onChange={onChange}
    />
  ) : (
    <RegisteredList fieldName={fieldName} type={type} />
  );

export default EdgeAttributesListStub;
