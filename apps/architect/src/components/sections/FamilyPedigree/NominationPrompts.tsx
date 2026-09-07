import { createElement, useCallback, type ComponentType } from 'react';
import { useSelector } from 'react-redux';

import { commonMessages } from '@codaco/app-i18n/common';
import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Section from '@codaco/fresco-ui/Section';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import {
  arrayItemMessages,
  arrayValidationMessages,
} from '~/components/Form/arrayFields/arrayMessages';
import DialogArrayField from '~/components/Form/arrayFields/DialogArrayField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
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
} from '~/selectors/indexes';
import {
  hasValidatedUse,
  interfaceOwnedPickIssue,
} from '~/selectors/roleFilters';

import NominationPromptFields from './NominationPromptFields';
import NominationPromptPreview from './NominationPromptPreview';
const remainingMessages = defineMessages({
  editPrompt: {
    id: 'architect.remaining.sections.familyPedigree.nominationPrompts.editPrompt',
    defaultMessage: 'Edit Prompt',
    description:
      'The addTitle text in components / sections / FamilyPedigree / NominationPrompts.',
  },
});
const additionalMessages = defineMessages({
  createNewNominationPrompt: {
    id: 'architect.additional.sections.familyPedigree.nominationPrompts.createNewNominationPrompt',
    defaultMessage: 'Create new nomination prompt',
    description:
      'The addButtonLabel text in components / sections / FamilyPedigree / NominationPrompts.',
  },
  noNominationPromptsHaveBeenCreated: {
    id: 'architect.additional.sections.familyPedigree.nominationPrompts.noNominationPromptsHaveBeenCreated',
    defaultMessage:
      'No nomination prompts have been created yet. Click "Create new nomination prompt" to add your first one.',
    description:
      'The emptyStateMessage text in components / sections / FamilyPedigree / NominationPrompts.',
  },
});
const messages = defineMessages({
  thisWillClearYourNominationPrompts: {
    id: 'architect.sections.familyPedigree.nominationPrompts.thisWillClearYourNominationPrompts',
    defaultMessage: 'This will clear your nomination prompts',
    description:
      'The title text in components / sections / FamilyPedigree / NominationPrompts.',
  },
  thisWillClearYourNominationPrompts4d01c: {
    id: 'architect.sections.familyPedigree.nominationPrompts.thisWillClearYourNominationPrompts4d01c',
    defaultMessage:
      'This will clear your nomination prompts and delete any prompts you have created. Do you want to continue?',
    description:
      'The description text in components / sections / FamilyPedigree / NominationPrompts.',
  },
  clearPrompts: {
    id: 'architect.sections.familyPedigree.nominationPrompts.clearPrompts',
    defaultMessage: 'Clear prompts',
    description:
      'The confirmLabel text in components / sections / FamilyPedigree / NominationPrompts.',
  },
  nominationPrompts: {
    id: 'architect.sections.familyPedigree.nominationPrompts.nominationPrompts',
    defaultMessage: 'Nomination prompts',
    description:
      'The title text in components / sections / FamilyPedigree / NominationPrompts.',
  },
  selectANodeTypeToConfigure: {
    id: 'architect.sections.familyPedigree.nominationPrompts.selectANodeTypeToConfigure',
    defaultMessage: 'Select a node type to configure nomination prompts.',
    description:
      'The description text in components / sections / FamilyPedigree / NominationPrompts.',
  },
  optionallyCollectASpecificConditionOr: {
    id: 'architect.sections.familyPedigree.nominationPrompts.optionallyCollectASpecificConditionOr',
    defaultMessage:
      'Optionally collect a specific condition or trait in a boolean attribute for each family member.',
    description:
      'The description text in components / sections / FamilyPedigree / NominationPrompts.',
  },
  prompts: {
    id: 'architect.sections.familyPedigree.nominationPrompts.prompts',
    defaultMessage: 'Prompts',
    description:
      'The label text in components / sections / FamilyPedigree / NominationPrompts.',
  },
});

// `NominationPromptPreview` declares `text`/`variable` as required props
// rather than the array field's generic `Renderer` bag; DialogArrayField
// always spreads the row's own properties into the preview, so the cast is
// safe.
type Renderer = ComponentType<Record<string, unknown>>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type NominationPrompt = { id?: string; variable?: string };

const NominationPrompts = (_props: StageEditorSectionProps) => {
  const intl = useAppIntl();
  const { confirm } = useDialog();
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
  //
  // DELIBERATELY not converted to the shared `useCrossClassEditorValidate`
  // (CategoricalBin/OrdinalBin/TieStrengthCensus/Sociogram/Geospatial). Its
  // escape is anchored to the row the DIALOG opened on; this one is anchored
  // to the stage's own COMMITTED `nominationPrompts`, found by row id. The
  // two differ once a prompt has been edited more than once within a single
  // unsaved stage session, and only the committed anchor keeps a variable the
  // protocol ALREADY binds here restorable — a pre-existing conflict an
  // import introduced, which the timeline alert reports non-destructively
  // rather than trapping the researcher. `NominationPromptsOnBeforeSave.test`
  // pins both halves: the committed pick escapes, and no row borrows
  // another's.
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
        undefined,
      );
      if (ownedIssue) {
        return { success: false, fieldErrors: { variable: [ownedIssue] } };
      }
      const issue = crossClassPickIssue({
        variableId: variable,
        originalVariableId: originalVariable,
        hasConflictingUse: (variableId) =>
          hasValidatedUse(roleMap, subject, variableId),
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
  const handleOpenChange = useCallback(
    async (newState: boolean) => {
      if (!hasNominationPrompts?.length || newState) {
        return true;
      }
      const confirmed = await confirm({
        title: createElement(AppMessage, {
          message: messages.thisWillClearYourNominationPrompts,
        }),
        description: createElement(AppMessage, {
          message: messages.thisWillClearYourNominationPrompts4d01c,
        }),
        confirmLabel: createElement(AppMessage, {
          message: messages.clearPrompts,
        }),
        cancelLabel: createElement(AppMessage, {
          message: commonMessages.cancel,
        }),
        intent: 'warning',
        onConfirm: () => {},
      });
      return confirmed === true;
    },
    [confirm, hasNominationPrompts],
  );
  return (
    <Section
      disabled={isDisabled}
      title={intl.formatMessage(messages.nominationPrompts)}
      description={
        isDisabled
          ? intl.formatMessage(messages.selectANodeTypeToConfigure)
          : intl.formatMessage(messages.optionallyCollectASpecificConditionOr)
      }
      toggleable
      defaultOpen={!isDisabled && !!hasNominationPrompts?.length}
      onOpenChange={handleOpenChange}
    >
      <ArchitectArrayField
        name="nominationPrompts"
        label={intl.formatMessage(messages.prompts)}
        component={DialogArrayField}
        addButtonLabel={intl.formatMessage(
          additionalMessages.createNewNominationPrompt,
        )}
        validation={{
          notEmpty: (value: unknown) =>
            Array.isArray(value) && value.length > 0
              ? undefined
              : createMessageError(arrayValidationMessages.required),
        }}
        initialValue={nominationPromptsInitial ?? []}
        addTitle={intl.formatMessage(remainingMessages.editPrompt)}
        previewComponent={NominationPromptPreview as unknown as Renderer}
        editorFieldsComponent={NominationPromptFields}
        editorTitle={intl.formatMessage(remainingMessages.editPrompt)}
        editorProps={{ nodeType }}
        itemLabelMessage={arrayItemMessages.prompt}
        editorDialogSize="editor"
        onBeforeSave={onBeforeSave}
        sortable
        requestedEditFormName="editable-list-form"
        emptyStateMessage={intl.formatMessage(
          additionalMessages.noNominationPromptsHaveBeenCreated,
        )}
      />
    </Section>
  );
};
export default NominationPrompts;
