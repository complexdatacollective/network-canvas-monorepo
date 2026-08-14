import { useCallback, type ComponentType } from 'react';
import { useSelector } from 'react-redux';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import DialogArrayField from '~/components/Form/arrayFields/DialogArrayField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useSetStageValue,
  useStageFormValue,
  useStageInitialValue,
} from '~/components/StageEditor/stageFormHooks';
import {
  crossClassPickIssue,
  validatedElsewhereMessage,
} from '~/components/Validations/contradictions';
import type { RootState } from '~/ducks/store';
import { EMPTY_VARIABLES, getVariablesForSubject } from '~/selectors/codebook';
import {
  getExclusiveVariableSlotMap,
  getVariableRoleMap,
  roleMapKey,
} from '~/selectors/indexes';
import { interfaceOwnedPickIssue } from '~/selectors/roleFilters';

import NominationPromptFields from './NominationPromptFields';
import NominationPromptPreview from './NominationPromptPreview';

// `NominationPromptPreview` declares `text`/`variable` as required props
// rather than the array field's generic `Renderer` bag; DialogArrayField
// always spreads the row's own properties into the preview, so the cast is
// safe.
type Renderer = ComponentType<Record<string, unknown>>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const notEmpty = (value: unknown) =>
  value && Array.isArray(value) && value.length > 0
    ? undefined
    : 'You must create at least one item.';

type NominationPrompt = { id?: string; variable?: string };

const NominationPrompts = (_props: StageEditorSectionProps) => {
  const { confirm } = useDialog();
  const setStageValue = useSetStageValue();
  const nodeType = useStageFormValue<string>('nodeConfig.type');
  const hasNominationPrompts =
    useStageFormValue<unknown[]>('nominationPrompts');
  const nominationPromptsInitial =
    useStageInitialValue<Record<string, unknown>[]>('nominationPrompts');
  const committedNominationPrompts =
    useStageInitialValue<NominationPrompt[]>('nominationPrompts');
  const allVariables = useSelector((state: RootState) =>
    nodeType
      ? getVariablesForSubject(state, { entity: 'node', type: nodeType })
      : EMPTY_VARIABLES,
  );
  const roleMap = useSelector(getVariableRoleMap);
  const exclusiveSlotMap = useSelector(getExclusiveVariableSlotMap);
  // Cross-class exclusivity gate: the nomination toggle is an UNVALIDATED
  // writer, so its variable may not be one a form elsewhere already collects
  // (the save-time backstop for a stale draft that bypassed the picker
  // exclusion — see NominationPromptFields.tsx's excludeValidatedUses call).
  // The row's PRE-EDIT committed variable is looked up by id in the stage's
  // own committed `nominationPrompts` — the array-field successor to reading
  // `getFormInitialValues('editable-list-form')`, since `onBeforeSave` is
  // owned by the stage form, not the row dialog.
  const onBeforeSave = useCallback(
    (value: unknown) => {
      if (!nodeType || !isRecord(value)) return value;
      const subject = { entity: 'node' as const, type: nodeType };
      const variable = typeof value.variable === 'string' ? value.variable : '';
      const id = typeof value.id === 'string' ? value.id : undefined;
      const originalVariable =
        committedNominationPrompts?.find((prompt) => prompt.id === id)
          ?.variable ?? '';
      // A variable the pedigree derives structurally (its ego marker, its
      // relationship variable) can never be a nomination toggle. The picker
      // already drops those, so this catches a stale draft or an imported
      // protocol — and unlike the cross-class gate it has no unchanged-pick
      // escape: re-saving such a prompt would keep writing the ego flag.
      const ownedIssue = interfaceOwnedPickIssue(
        exclusiveSlotMap,
        subject,
        variable,
      );
      if (ownedIssue) {
        return { success: false, fieldErrors: { variable: [ownedIssue] } };
      }
      const issue = crossClassPickIssue({
        variableId: variable,
        originalVariableId: originalVariable,
        hasConflictingUse: (variableId) =>
          (roleMap[roleMapKey(subject, variableId)]?.validated ?? 0) > 0,
        allVariables,
        message: validatedElsewhereMessage,
      });
      if (issue) {
        return { success: false, fieldErrors: { variable: [issue] } };
      }
      return value;
    },
    [
      nodeType,
      roleMap,
      exclusiveSlotMap,
      allVariables,
      committedNominationPrompts,
    ],
  );
  const isDisabled = !nodeType;
  const handleToggleChange = useCallback(
    async (newState: boolean) => {
      if (!hasNominationPrompts?.length || newState) {
        return true;
      }
      const confirmed = await confirm({
        title: 'This will clear your nomination prompts',
        description:
          'This will clear your nomination prompts and delete any prompts you have created. Do you want to continue?',
        confirmLabel: 'Clear prompts',
        cancelLabel: 'Cancel',
        intent: 'warning',
        onConfirm: () => {},
      });
      if (confirmed) {
        // `undefined`, not `null`: the toggle handler runs while the array
        // field is still mounted (the confirm dialog resolves before the
        // Section's own `isOpen` flips), and fresco-ui's `ArrayField` only
        // defaults `undefined` to its own empty array — `null` reaches
        // `useArrayFieldItems`'s unconditional `value.forEach` and throws
        // (see IntroScreen.tsx's identical fix).
        setStageValue('nominationPrompts', undefined);
        return true;
      }
      return false;
    },
    [confirm, setStageValue, hasNominationPrompts],
  );
  return (
    <Section
      disabled={isDisabled}
      summary={
        <Paragraph>
          Optionally add prompts to collect attribute information about family
          members. Each prompt should ask about a specific condition or trait
          and will store the response in the selected boolean variable.
        </Paragraph>
      }
      title="Nomination Prompts"
      toggleable
      startExpanded={!!hasNominationPrompts?.length}
      handleToggleChange={handleToggleChange}
    >
      <ArchitectArrayField
        name="nominationPrompts"
        label="Nomination prompts"
        labelHidden
        component={DialogArrayField}
        validation={{ notEmpty }}
        initialValue={nominationPromptsInitial ?? []}
        addTitle="Edit Prompt"
        previewComponent={NominationPromptPreview as unknown as Renderer}
        editorFieldsComponent={NominationPromptFields}
        editorTitle="Edit Prompt"
        editorProps={{ nodeType }}
        itemLabel="prompt"
        onBeforeSave={onBeforeSave}
        sortable
        requestedEditFormName="editable-list-form"
        emptyStateMessage='No nomination prompts have been created yet. Click "Create new" to add your first prompt.'
      />
    </Section>
  );
};
export default NominationPrompts;
