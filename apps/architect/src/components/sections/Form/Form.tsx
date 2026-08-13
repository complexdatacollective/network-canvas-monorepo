import { useCallback, useMemo, type ComponentType } from 'react';
import { useSelector } from 'react-redux';

import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { Section } from '~/components/EditorLayout';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import ArchitectField from '~/components/Form/ArchitectField';
import DialogArrayField from '~/components/Form/arrayFields/DialogArrayField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useStageFormValue,
  useStageInitialValue,
  useSubject,
} from '~/components/StageEditor/stageFormHooks';
import type { RootState } from '~/ducks/modules/root';
import { getVariablesForSubjectSelector } from '~/selectors/codebook';
import {
  getVariableRoleMapOutsideStage,
  roleMapKey,
} from '~/selectors/indexes';
import { getProtocol } from '~/selectors/protocol';

import {
  draftUnvalidatedElsewhereMessage,
  makeFieldEditorValidate,
  variableDisplayName,
} from '../../Validations/contradictions';
import { draftAdditionalAttributeVariableIds } from '../../Validations/draftWriterRoles';
import {
  composerValidationViews,
  sharedFormValidationView,
} from './composerHelpers';
import { useFormFieldCommit } from './fieldCommit';
import FieldFields from './FieldFields';
import FieldPreview from './FieldPreview';
import { itemSelector, normalizeField } from './helpers';

// DialogArrayField renders these with the edited row's own properties, so it
// types them by the only shape it can know.
const EditorFields = FieldFields as ComponentType<Record<string, unknown>>;
const Preview = FieldPreview as ComponentType<Record<string, unknown>>;

/** Stable empty array: `initialValue` is a register-effect dependency. */
const NO_FIELDS: Record<string, unknown>[] = [];

const notEmpty = (value: unknown) =>
  value && Array.isArray(value) && value.length > 0
    ? undefined
    : 'You must create at least one item.';

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
  const { entity, type } = useSubject();
  const disableFormTitle = INTERFACES_WITHOUT_FORM_TITLE.has(interfaceType);
  // Without a subject there is no codebook to draw variables from, so the
  // section is inert until one is chosen. EgoForm needs no subject at all.
  const disabled = interfaceType !== 'EgoForm' && !type;
  const disabledMessage = disabled
    ? `Select ${
        interfaceType === 'AlterEdgeForm' ? 'an edge' : 'a node'
      } type above to configure this section.`
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
  const hasUnvalidatedUse = useCallback(
    (variableId: string): boolean | string => {
      if (draftUnvalidatedVariables.has(variableId)) {
        return draftUnvalidatedElsewhereMessage(
          variableDisplayName(allVariables, variableId),
        );
      }
      return (roleMap[roleMapKey(subject, variableId)]?.unvalidated ?? 0) > 0;
    },
    [roleMap, subject, draftUnvalidatedVariables, allVariables],
  );
  const editorValidate = useMemo(
    () =>
      makeFieldEditorValidate(
        allVariables,
        undefined,
        undefined,
        hasUnvalidatedUse,
        resolvedFormViews,
      ),
    [allVariables, hasUnvalidatedUse, resolvedFormViews],
  );

  const handleChangeFields = useFormFieldCommit({
    entity,
    type: type ?? '',
  });

  const initialFields =
    useStageInitialValue<Record<string, unknown>[]>('form.fields');
  const initialTitle = useStageInitialValue<string>('form.title');

  const editorProps = useMemo(
    () => ({ type, entity, currentStageIndex }),
    [currentStageIndex, entity, type],
  );
  const previewProps = useMemo(() => ({ entity, type }), [entity, type]);
  const rowItemSelector = useMemo(
    () => itemSelector(entity, type),
    [entity, type],
  );

  return (
    <Section
      disabled={disabled}
      disabledMessage={disabledMessage}
      group
      title="Form"
      summary="Add one or more fields to your form to collect attributes about each node the participant creates. Use the drag handle on the left of each prompt to adjust its order."
    >
      {!disableFormTitle && (
        <ArchitectField
          name="form.title"
          label="Form heading text (e.g 'Add a person')"
          component={InputField}
          initialValue={initialTitle}
          validation={{ required: true }}
          placeholder="Enter your title here"
        />
      )}
      <ArchitectArrayField
        name="form.fields"
        label="Form fields"
        labelHidden={disableFormTitle}
        component={DialogArrayField}
        initialValue={initialFields ?? NO_FIELDS}
        validation={{ notEmpty }}
        addTitle="Edit Field"
        editorTitle="Edit Field"
        editorFieldsComponent={EditorFields}
        editorProps={editorProps}
        editorValidate={editorValidate}
        itemLabel="field"
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
