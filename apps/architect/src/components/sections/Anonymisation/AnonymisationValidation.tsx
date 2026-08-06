import FieldErrors from '@codaco/fresco-ui/form/FieldErrors';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Row, Section } from '~/components/EditorLayout';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useSetStageValue,
  useStageFormValue,
  useStageInitialValue,
} from '~/components/StageEditor/stageFormHooks';
import Validations from '~/components/Validations/Validations';
import { getFieldId } from '~/utils/issues';

type ValidationValue = boolean | number | string | null;
type ValidationMap = Record<string, ValidationValue>;

const hasEntries = (value: ValidationMap | undefined): boolean =>
  !!value && Object.keys(value).length > 0;

const validationErrorsId = getFieldId('anonymisation-validation-sync-error');

const AnonymisationValidation = (_props: StageEditorSectionProps) => {
  const setStageValue = useSetStageValue();
  // The Field's own `initialValue` (registration-time only — must not track
  // live edits, or every keystroke would re-register the field); the toggle's
  // `startExpanded` needs the LIVE value so the section reacts to undo/redo
  // and to rules being removed back down to zero.
  const initialValidation = useStageInitialValue<ValidationMap>('validation');
  const liveValidation = useStageFormValue<ValidationMap>('validation');
  const hasValidation = hasEntries(liveValidation);
  // Audit sweep: the shape ValidationSection was already fixed for. A
  // collapsed toggleable Section unmounts its children, and `validateForm`
  // only fails a submit over errors on REGISTERED fields — so a sync error
  // keyed at `validation` while this section is shut would neither block the
  // save nor be visible. This form ships no such validate today, which makes
  // the section accidentally safe rather than correct; forcing it open while
  // the error stands closes the class.
  const fieldErrors = useFormStore(
    (store) => store.errors.fieldErrors.validation,
  );
  const hasValidationSyncError =
    Array.isArray(fieldErrors) && fieldErrors.length > 0;
  const handleToggleValidation = (nextState: boolean) => {
    if (!nextState) {
      setStageValue('validation', undefined);
    }
    return true;
  };
  return (
    <Section
      toggleable
      title="Passphrase Validation"
      summary={
        <Paragraph>
          Add one or more validation rules for the passphrase.
        </Paragraph>
      }
      startExpanded={hasValidation}
      forceExpanded={hasValidationSyncError}
      handleToggleChange={handleToggleValidation}
    >
      <Row>
        <Validations
          name="validation"
          initialValue={initialValidation}
          variableType="passphrase"
          entity="ego"
        />
      </Row>
      {/* fresco-ui's own Field error slot only shows once the field is both
          dirty and blurred, which a field revealed here for the first time
          (the section was collapsed) never is. Render the message directly,
          keyed only on the error existing — matches the old
          `submitFailed`-gated (not dirty-gated) display it replaces. */}
      <FieldErrors
        id={validationErrorsId}
        errors={fieldErrors ?? undefined}
        show={hasValidationSyncError}
      />
    </Section>
  );
};
export default AnonymisationValidation;
