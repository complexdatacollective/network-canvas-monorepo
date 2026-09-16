import { fieldElementIds } from '@codaco/fresco-ui/form/Field/fieldElements';
import FieldErrors from '@codaco/fresco-ui/form/FieldErrors';
import { FieldLabel } from '@codaco/fresco-ui/form/FieldLabel';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { useStageNameField } from '../naming/useStageNameField.ts';
import StageNameInput from './StageNameInput.tsx';

export type StageNameFieldProps = Readonly<{
  /**
   * Put on the field's own element, beside the classes it always carries.
   *
   * The whole of what a host has to say about how this sits on its page: it is
   * a hero heading in Architect and a line in a dialog somewhere else, and
   * every other difference between those is the chrome the host draws AROUND
   * this rather than anything about the field.
   */
  className?: string;
  /**
   * What to do when focus leaves the control — `useAutoStageName().onBlur` for
   * a host that proposes names, and nothing for one that does not.
   *
   * Deliberately passed in rather than reached for: writing a name nobody
   * asked for is the host's policy, so a host that has not opted into it must
   * not get half of it by rendering this.
   */
  onBlur?: () => void;
}>;

/**
 * The stage's name as a field: the control, the accessible label it is named
 * by, and the refusal when there is no name.
 *
 * The least a host has to render to let a researcher name a stage, and the one
 * caller of `useStageNameField` in a host that uses it — so a host gets the
 * field's DOM contract (the label an issues panel harvests a name from, the
 * region a refusal is announced in, the form association that makes Enter
 * save) without reassembling it, and cannot accidentally register the field
 * twice.
 *
 * It draws NO title chrome. A picture of the interface, a badge naming it, the
 * position in the interview, a heading — Architect draws all of those around
 * this, and a host reached from a list that already says which interface it is
 * draws none of them. That is the whole reason this package publishes a field
 * and not a title.
 *
 * The label is visually hidden and still rendered, because the control IS the
 * visible heading wherever a host draws one: a second visible label would name
 * the stage twice, and a control with no label at all is one a screen reader
 * and a host's issues panel have no name for.
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
        Mounted whether or not it holds anything, because the control already
        describes it: a refusal arrives after a submit, and a region that
        appeared at the same moment as its message would not be there to be
        announced.
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
