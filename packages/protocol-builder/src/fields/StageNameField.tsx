import { fieldElementIds } from '@codaco/fresco-ui/form/Field/fieldElements';
import FieldErrors from '@codaco/fresco-ui/form/FieldErrors';
import { FieldLabel } from '@codaco/fresco-ui/form/FieldLabel';
import { cx } from '@codaco/fresco-ui/utils/cva';

import { EditingLanguageSwitcher } from '../localization/EditingLanguageSwitcher.tsx';
import { useAutoStageName } from '../naming/useAutoStageName.ts';
import { useStageNameField } from '../naming/useStageNameField.ts';
import { useStandingStageNameProposal } from '../naming/useStandingStageNameProposal.ts';
import StageNameInput from './StageNameInput.tsx';

export type StageNameFieldProps = Readonly<{
  /** Put on the field's own element, beside the classes it always carries. */
  className?: string;
  /**
   * Whether a stage being created is named, unasked, from what it collects
   * (`useAutoStageName`), with a proposed name selected as the control gains
   * focus so typing replaces it. Both halves of that policy or neither: a
   * host that has not opted in must not get half of it by rendering this, so
   * the opt-in is a prop it has to pass rather than something reached for.
   */
  proposeName?: boolean;
}>;

type StageNameControlProps = Readonly<{
  className: string | undefined;
  onBlur?: () => void;
  selectOnFocus?: () => boolean;
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
  proposeName = false,
}: StageNameFieldProps) {
  return proposeName ? (
    <ProposingStageNameControl className={className} />
  ) : (
    <StageNameControl className={className} />
  );
}

/**
 * The control with the proposal policy beside it: `useAutoStageName` is the
 * one writer of a proposed name, and belongs beside the one caller of
 * `useStageNameField`.
 */
function ProposingStageNameControl({
  className,
}: Readonly<{ className: string | undefined }>) {
  const { onBlur } = useAutoStageName();
  const { isStanding } = useStandingStageNameProposal();
  return (
    <StageNameControl
      className={className}
      onBlur={onBlur}
      selectOnFocus={isStanding}
    />
  );
}

function StageNameControl({
  className,
  onBlur,
  selectOnFocus,
}: StageNameControlProps) {
  const { id, label, error, translations, containerProps, fieldProps } =
    useStageNameField();
  const elementIds = fieldElementIds(id);

  return (
    <div {...containerProps} className={cx('flex w-full flex-col', className)}>
      <FieldLabel id={elementIds.label} htmlFor={id} className="sr-only">
        {label}
      </FieldLabel>
      <StageNameInput
        {...fieldProps}
        onFieldBlur={onBlur}
        selectOnFocus={selectOnFocus}
      />
      <EditingLanguageSwitcher values={[translations]} className="mt-1" />
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
