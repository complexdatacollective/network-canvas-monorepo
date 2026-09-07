import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Section from '@codaco/fresco-ui/Section';
import ArchitectField from '~/components/Form/ArchitectField';
import IssueAnchor from '~/components/IssueAnchor';
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
const messages = defineMessages({
  selectAnAttribute: {
    id: 'architect.sections.quickAdd.quickAdd.selectAnAttribute',
    defaultMessage: 'Select an attribute',
    description:
      'The description text in components / sections / QuickAdd / QuickAdd.',
  },
  quickAddConfiguration: {
    id: 'architect.sections.quickAdd.quickAdd.quickAddConfiguration',
    defaultMessage: 'Quick add configuration',
    description:
      'The title text in components / sections / QuickAdd / QuickAdd.',
  },
  chooseTheAttributePopulatedWhenA: {
    id: 'architect.sections.quickAdd.quickAdd.chooseTheAttributePopulatedWhenA',
    defaultMessage:
      'Choose the attribute populated when a participant creates a node with Quick Add.',
    description:
      'The description text in components / sections / QuickAdd / QuickAdd.',
  },
  selectTheAttributeThatIsAssigned: {
    id: 'architect.sections.quickAdd.quickAdd.selectTheAttributeThatIsAssigned',
    defaultMessage:
      "Select the attribute that is assigned a value when creating a new node using the Quick Add button. Use an attribute called 'name' here, unless you have a good reason not to. Interviewer will then automatically use this attribute as the label for the node in the interview.",
    description:
      'The hint text in components / sections / QuickAdd / QuickAdd.',
  },
});

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
  const intl = useAppIntl();
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

  return (
    <>
      <IssueAnchor
        fieldName="quickAdd"
        description={intl.formatMessage(messages.selectAnAttribute)}
      />
      <Section
        title={intl.formatMessage(messages.quickAddConfiguration)}
        description={
          disabled
            ? disabledMessage
            : intl.formatMessage(messages.chooseTheAttributePopulatedWhenA)
        }
        disabled={disabled}
      >
        <ArchitectField
          name="quickAdd"
          label={intl.formatMessage(messages.selectAnAttribute)}
          hint={intl.formatMessage(messages.selectTheAttributeThatIsAssigned)}
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
    </>
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
