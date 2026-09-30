import type { StageSection } from '../../editors/defineStageEditor.tsx';
import FormFieldsSection, {
  type FormFieldsSectionProps,
} from './FormFieldsSection.tsx';

/**
 * What the form collects, and how it asks for it.
 *
 * The subject is a prop because only the editor composing the form knows whose
 * codebook it collects into: an ego form's fields describe the participant, an
 * alter edge form's describe a relationship.
 */
export const formFields =
  (props: FormFieldsSectionProps): StageSection =>
  () => <FormFieldsSection {...props} />;
