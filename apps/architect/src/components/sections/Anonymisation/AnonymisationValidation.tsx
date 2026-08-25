import Section from '@codaco/fresco-ui/Section';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useStageFormValue,
  useStageInitialValue,
} from '~/components/StageEditor/stageFormHooks';
import Validations from '~/components/Validations/Validations';

type ValidationValue = boolean | number | string | null;
type ValidationMap = Record<string, ValidationValue>;

const hasEntries = (value: ValidationMap | undefined): boolean =>
  !!value && Object.keys(value).length > 0;

const AnonymisationValidation = ({
  stagePath,
  interfaceType,
}: StageEditorSectionProps) => {
  // The Field's own `initialValue` is registration-time only and must not
  // track live edits, or every keystroke would re-register the field. The
  // live value supplements it when choosing the toggle's initial open state.
  const initialValidation = useStageInitialValue<ValidationMap>('validation');
  const liveValidation = useStageFormValue<ValidationMap>('validation');
  const hasValidation =
    liveValidation !== undefined
      ? hasEntries(liveValidation)
      : hasEntries(initialValidation);
  return (
    <Section
      toggleable
      title="Passphrase validation"
      description="Choose which validation rules apply to the passphrase."
      defaultOpen={hasValidation}
    >
      <Validations
        name="validation"
        initialValue={initialValidation}
        variableType="passphrase"
        entity="ego"
        // The stage editor reinitializes in place when the edited stage
        // changes, and keeps same-interface sections mounted — so without
        // stage identity the rule list would carry one passphrase's
        // uncommitted rows onto the next stage's saved rules. `stagePath` is
        // the edited stage's own slot, and is null only before it exists.
        scopeId={stagePath ?? `new-${interfaceType}`}
      />
    </Section>
  );
};
export default AnonymisationValidation;
