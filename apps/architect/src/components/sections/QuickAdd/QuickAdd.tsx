import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
import ArchitectField from '~/components/Form/ArchitectField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useCreateVariable,
  useStageFormValue,
  useStageInitialValue,
  useSubject,
} from '~/components/StageEditor/stageFormHooks';
import { useAppSelector } from '~/ducks/hooks';

import withDisabledSubjectRequired from '../../enhancers/withDisabledSubjectRequired';
import { VariablePickerControl as VariablePicker } from '../../Form/Fields/VariablePicker/VariablePicker';
import CodebookVariableValidationSection from '../CodebookVariableValidationSection';
import { getQuickAddOptionsForSubject } from './withOptions';

// Deliberately NOT `StageEditorSectionProps & {...}`: `withDisabledSubjectRequired`
// only ever supplies `{interfaceType?, type?}` (own) and `{disabled,
// disabledMessage}` (injected) — the component it wraps must accept exactly
// that shape (or less) for the composition below to typecheck. `stagePath`/
// `stagePosition` pass through unread (the section doesn't need them).
type QuickAddProps = {
  disabled?: boolean;
  disabledMessage?: string;
};

const QuickAdd = ({ disabled, disabledMessage }: QuickAddProps) => {
  const { entity, type } = useSubject();
  const quickAdd = useStageFormValue<string | null>('quickAdd');
  const initialQuickAdd = useStageInitialValue<string | undefined>('quickAdd');
  const { createVariable } = useCreateVariable();
  const options = useAppSelector((state) =>
    getQuickAddOptionsForSubject(
      state,
      { entity, type: type ?? undefined },
      quickAdd ?? undefined,
    ),
  );

  if (!type) {
    return null;
  }

  // The alert nudges the user to store the quick-add value in a variable named
  // "name". Once they've done so, the recommendation is satisfied — hide it.
  const selectedOption = options.find(
    (option) => option.value === quickAdd || option.label === quickAdd,
  );
  const hasNameVariable = selectedOption?.label.toLowerCase() === 'name';

  return (
    <Section
      disabled={disabled}
      disabledMessage={disabledMessage}
      group
      title="Quick Add Variable"
      id="issue-form"
      summary={
        <Paragraph>
          Choose which variable to use to store the value of the quick add form.
        </Paragraph>
      }
    >
      {!hasNameVariable && (
        <Alert variant="info" className="my-7">
          <AlertDescription>
            Use a variable called &quot;name&quot; here, unless you have a good
            reason not to. Interviewer will then automatically use this variable
            as the label for the node in the interview.
          </AlertDescription>
        </Alert>
      )}
      <ArchitectField
        name="quickAdd"
        label="Variable to store the quick-add value"
        labelHidden
        component={VariablePicker}
        validation={{ required: true }}
        initialValue={initialQuickAdd}
        options={options}
        // NameGeneratorQuickAdd's quickAdd is a VALIDATED writer (see
        // `withOptions.tsx`), so a variable created here requires a value
        // from the start. NetworkComposer seeds the same rule for its own
        // validated quick-add writer.
        onCreateOption={(value: string) =>
          createVariable(value, 'text', 'quickAdd', { required: true })
        }
        type={type}
        entity={entity}
      />
      {quickAdd && (
        <CodebookVariableValidationSection
          fieldName="quickAdd"
          entity={entity}
          type={type}
          variableId={quickAdd}
        />
      )}
    </Section>
  );
};

const QuickAddWithDisabledState = withDisabledSubjectRequired(QuickAdd);

/**
 * `withDisabledSubjectRequired` computes `disabled`/`disabledMessage` from
 * `interfaceType`/`type` props (the `withSubject` enhancer used to inject
 * `type`). Sections no longer receive `type` as a prop — it comes from
 * `useSubject()` — so this forwards it explicitly rather than composing the
 * two enhancers as before.
 */
const QuickAddSection = (props: StageEditorSectionProps) => {
  const { type } = useSubject();
  return <QuickAddWithDisabledState {...props} type={type ?? undefined} />;
};

export default QuickAddSection;
