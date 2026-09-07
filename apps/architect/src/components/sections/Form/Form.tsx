import { useCallback, useMemo, type ComponentType } from 'react';
import { useSelector } from 'react-redux';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Section from '@codaco/fresco-ui/Section';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import ArchitectField from '~/components/Form/ArchitectField';
import {
  arrayItemMessages,
  arrayValidationMessages,
} from '~/components/Form/arrayFields/arrayMessages';
import DialogArrayField from '~/components/Form/arrayFields/DialogArrayField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useStageFormValue,
  useStageInitialValue,
  useSubject,
} from '~/components/StageEditor/stageFormHooks';
import type { RootState } from '~/ducks/modules/root';
import { getVariablesForSubjectSelector } from '~/selectors/codebook';
import { getVariableRoleMapOutsideStage } from '~/selectors/indexes';
import { getProtocol } from '~/selectors/protocol';
import { hasUnvalidatedUse } from '~/selectors/roleFilters';

import {
  draftUnvalidatedElsewhereMessage,
  makeFieldEditorValidate,
  variableDisplayName,
} from '../../Validations/contradictions';
import { draftAdditionalAttributeVariableIds } from '../../Validations/draftWriterRoles';
import {
  composerValidationViews,
  isVariableUsedBySibling,
  sharedFormValidationView,
} from './composerHelpers';
import { useFormFieldCommit } from './fieldCommit';
import FieldEditorPreview from './FieldEditorPreview';
import FieldFields from './FieldFields';
import FieldPreview from './FieldPreview';
import { itemSelector, normalizeField } from './helpers';
const remainingMessages = defineMessages({
  editField: {
    id: 'architect.remaining.sections.form.form.editField',
    defaultMessage: 'Edit Field',
    description: 'The addTitle text in components / sections / Form / Form.',
  },
});
const chromeMessages = defineMessages({
  selectTypeAboveToConfigureThis: {
    id: 'architect.chrome.sections.form.form.selectTypeAboveToConfigureThis',
    defaultMessage:
      'Select {entity, select, edge {an edge} other {a node}} type above to configure this section.',
    description:
      'Researcher-facing explanatory text in components / sections / Form / Form.',
  },
});
const additionalMessages = defineMessages({
  createNewFormField: {
    id: 'architect.additional.sections.form.form.createNewFormField',
    defaultMessage: 'Create new form field',
    description:
      'The addButtonLabel text in components / sections / Form / Form.',
  },
});
const messages = defineMessages({
  formConfiguration: {
    id: 'architect.sections.form.form.formConfiguration',
    defaultMessage: 'Form configuration',
    description: 'The title text in components / sections / Form / Form.',
  },
  mapAttributesToInputControlsAnd: {
    id: 'architect.sections.form.form.mapAttributesToInputControlsAnd',
    defaultMessage:
      'Map attributes to input controls and define the validation rules for this form.',
    description: 'The description text in components / sections / Form / Form.',
  },
  formTitle: {
    id: 'architect.sections.form.form.formTitle',
    defaultMessage: 'Form title',
    description: 'The label text in components / sections / Form / Form.',
  },
  shownAtTheTopOfThe: {
    id: 'architect.sections.form.form.shownAtTheTopOfThe',
    defaultMessage:
      "Shown at the top of the form. Use a short descriptive title such as 'Add a contact'.",
    description: 'The hint text in components / sections / Form / Form.',
  },
  enterATitle: {
    id: 'architect.sections.form.form.enterATitle',
    defaultMessage: 'Enter a title...',
    description: 'The placeholder text in components / sections / Form / Form.',
  },
  formFields: {
    id: 'architect.sections.form.form.formFields',
    defaultMessage: 'Form fields',
    description: 'The label text in components / sections / Form / Form.',
  },
  addOneOrMoreFieldsTo: {
    id: 'architect.sections.form.form.addOneOrMoreFieldsTo',
    defaultMessage:
      'Add one or more fields to your form to collect attributes. Use the drag handle on the left of each prompt to adjust its order.',
    description: 'The hint text in components / sections / Form / Form.',
  },
});

// DialogArrayField renders these with the edited row's own properties, so it
// types them by the only shape it can know.
const EditorFields = FieldFields as ComponentType<Record<string, unknown>>;
const EditorPreview = FieldEditorPreview as ComponentType<
  Record<string, unknown>
>;
const Preview = FieldPreview as ComponentType<Record<string, unknown>>;

/** Stable empty array: `initialValue` is a register-effect dependency. */
const NO_FIELDS: Record<string, unknown>[] = [];

// The three interfaces whose form IS the whole stage have no separate heading
// to author: the stage's own title does that job.
const INTERFACES_WITHOUT_FORM_TITLE = new Set([
  'EgoForm',
  'AlterForm',
  'AlterEdgeForm',
]);

const Form = ({
  stagePath,
  stagePosition,
  interfaceType,
}: StageEditorSectionProps) => {
  const intl = useAppIntl();
  const { entity, type } = useSubject();
  const disableFormTitle = INTERFACES_WITHOUT_FORM_TITLE.has(interfaceType);
  // Without a subject there is no codebook to draw variables from, so the
  // section is inert until one is chosen. EgoForm needs no subject at all.
  const disabled = interfaceType !== 'EgoForm' && !type;
  const disabledMessage = disabled
    ? intl.formatMessage(chromeMessages.selectTypeAboveToConfigureThis, {
        entity: interfaceType === 'AlterEdgeForm' ? 'edge' : 'node',
      })
    : undefined;

  // Memoized on the primitives so the subject object identity is stable
  // across renders, matching getVariablesForSubjectSelector's reselect
  // memoization instead of defeating it every render.
  const subject = useMemo(
    () => ({ entity, type: type ?? undefined }),
    [entity, type],
  );
  const allVariables = useSelector((state: RootState) =>
    getVariablesForSubjectSelector(state, subject),
  );
  const currentStageIndex = stagePath === null ? undefined : stagePosition;
  const roleMap = useSelector((state: RootState) =>
    getVariableRoleMapOutsideStage(state, currentStageIndex),
  );
  const stages = useSelector((state: RootState) => getProtocol(state)?.stages);
  const resolvedComposerViews = useMemo(
    () =>
      entity === 'ego' ? [] : composerValidationViews(stages, { entity, type }),
    [stages, entity, type],
  );
  const formFields = useStageFormValue('form.fields');
  const promptDrafts = useStageFormValue('prompts');
  const draftUnvalidatedVariables = useMemo(
    () => draftAdditionalAttributeVariableIds(promptDrafts),
    [promptDrafts],
  );
  const resolvedFormViews = useMemo(
    () => [sharedFormValidationView(formFields), ...resolvedComposerViews],
    [formFields, resolvedComposerViews],
  );
  // Backs makeFieldEditorValidate's save-time gate: other stages' saved roles
  // and this stage's live prompt roles replace this stage's stale saved roles.
  const hasUnvalidatedUseForSubject = useCallback(
    (variableId: string): boolean | string => {
      if (draftUnvalidatedVariables.has(variableId)) {
        return draftUnvalidatedElsewhereMessage(
          variableDisplayName(allVariables, variableId),
        );
      }
      return hasUnvalidatedUse(roleMap, subject, variableId);
    },
    [roleMap, subject, draftUnvalidatedVariables, allVariables],
  );
  const handleChangeFields = useFormFieldCommit({
    entity,
    type: type ?? '',
  });

  const initialFields =
    useStageInitialValue<Record<string, unknown>[]>('form.fields');
  const initialTitle = useStageInitialValue<string>('form.title');

  const editorValidate = useMemo(() => {
    const validateField = makeFieldEditorValidate(
      allVariables,
      undefined,
      undefined,
      hasUnvalidatedUseForSubject,
      resolvedFormViews,
      undefined,
    );
    return (
      values: Record<string, unknown>,
      props?: { editIndex?: number; initialValues?: unknown },
    ): Record<string, unknown> => {
      const variable =
        typeof values.variable === 'string' ? values.variable : '';
      // One form may not collect a variable twice: every field renders under
      // its variable's name, so two fields share one value while each still
      // contributes its own control and rules. The picker already drops a
      // sibling's variable; this is the backstop for a stale draft or an
      // imported protocol that already repeats one. Same predicate as the
      // composer editor's gate, so the two surfaces cannot drift.
      //
      // Read from the LIVE rows, not the committed snapshot. A field added in
      // this editing session is not in `form.fields` on the saved stage yet,
      // so a committed list would let the researcher pick its variable a
      // second time — and the picker, given the same list, would not even hide
      // it — leaving a stage that the schema refuses on save. The converse
      // costs them too: a variable freed by a row they just deleted would go
      // on being rejected. `useStageFormValue` holds its reference while the
      // value is unchanged, so this does not churn on unrelated keystrokes.
      if (isVariableUsedBySibling(formFields, variable, props?.editIndex)) {
        return {
          variable: createMessageError(arrayValidationMessages.duplicateField),
        };
      }
      return validateField(values, props);
    };
  }, [
    allVariables,
    hasUnvalidatedUseForSubject,
    resolvedFormViews,
    formFields,
  ]);

  const editorProps = useMemo(
    () => ({ type, entity, currentStageIndex, siblingFields: formFields }),
    [currentStageIndex, entity, type, formFields],
  );
  const previewProps = useMemo(() => ({ entity, type }), [entity, type]);
  const rowItemSelector = useMemo(
    () => itemSelector(entity, type),
    [entity, type],
  );

  return (
    <Section
      title={intl.formatMessage(messages.formConfiguration)}
      description={
        disabled
          ? disabledMessage
          : intl.formatMessage(messages.mapAttributesToInputControlsAnd)
      }
      disabled={disabled}
    >
      {!disableFormTitle && (
        <ArchitectField
          name="form.title"
          label={intl.formatMessage(messages.formTitle)}
          hint={intl.formatMessage(messages.shownAtTheTopOfThe)}
          component={InputField}
          initialValue={initialTitle}
          validation={{ required: true }}
          placeholder={intl.formatMessage(messages.enterATitle)}
        />
      )}
      <ArchitectArrayField
        name="form.fields"
        label={intl.formatMessage(messages.formFields)}
        hint={intl.formatMessage(messages.addOneOrMoreFieldsTo)}
        component={DialogArrayField}
        addButtonLabel={intl.formatMessage(
          additionalMessages.createNewFormField,
        )}
        initialValue={initialFields ?? NO_FIELDS}
        validation={{
          required: createMessageError(arrayValidationMessages.required),
        }}
        addTitle={intl.formatMessage(remainingMessages.editField)}
        editorTitle={intl.formatMessage(remainingMessages.editField)}
        editorFieldsComponent={EditorFields}
        editorPreviewComponent={EditorPreview}
        editorProps={editorProps}
        editorValidate={editorValidate}
        itemLabelMessage={arrayItemMessages.field}
        itemSelector={rowItemSelector}
        normalizeItem={(value: unknown) =>
          normalizeField(value as Record<string, unknown>)
        }
        onBeforeSave={(value: unknown) =>
          handleChangeFields(value as Record<string, unknown>)
        }
        previewComponent={Preview}
        previewProps={previewProps}
        requestedEditFormName="editable-list-form"
        sortable
      />
    </Section>
  );
};

export default Form;
