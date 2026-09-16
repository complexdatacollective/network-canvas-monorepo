import { fieldElementIds } from '@codaco/fresco-ui/form/Field/fieldElements';
import FieldErrors from '@codaco/fresco-ui/form/FieldErrors';
import { FieldLabel } from '@codaco/fresco-ui/form/FieldLabel';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { useStageNameField } from '../naming/useStageNameField.ts';
import StageNameInput from './StageNameInput.tsx';

export type StageNameFieldProps = Readonly<{
  /** Put on the field's own element, beside the classes it always carries. */
  className?: string;
  /**
   * `useAutoStageName().onBlur`, for a host that proposes names. Passed in
   * rather than reached for: a host that has not opted into that policy must
   * not get half of it by rendering this.
   */
  onBlur?: () => void;
}>;

/**
 * The stage's name as a field: the control, the accessible label it is named
 * by, and the refusal when there is no name.
 *
 * The least a host has to render to let a researcher name a stage, so it gets
 * the field's DOM contract — the label an issues panel harvests a name from,
 * the region a refusal is announced in, the form association that makes Enter
 * save — without reassembling it. It draws no title chrome: the picture, the
 * badge and the position are the host's, which is why this package publishes a
 * field and not a title.
 *
 * The label is hidden and still rendered: the control IS the visible heading,
 * and a control with no label is one a screen reader has no name for.
 */
export default function StageNameField({
  className,
  onBlur,
}: StageNameFieldProps) {
  const { id, label, error, containerProps, fieldProps } = useStageNameField();
  const elementIds = fieldElementIds(id);

  return (
    <div {...containerProps} className={cx('flex w-full flex-col', className)}>
      <FieldLabel id={elementIds.label} htmlFor={id} className="sr-only">
        {label}
      </FieldLabel>
      <StageNameInput {...fieldProps} onFieldBlur={onBlur} />
      {/*
        Mounted whether or not it holds anything: the control already describes
        it, and a region that appeared with its message would not be there to
        be announced.
      */}
      <FieldErrors
        id={elementIds.error}
        name={fieldProps.name}
        errors={error === undefined ? undefined : [error]}
        show={error !== undefined}
      />
    </div>
  );
}
