import { useMemo } from 'react';

import { createMessageError } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';

import {
  hasUnvalidatedUse,
  hasValidatedUse,
} from '../../codebook/variableRoles.ts';
import { VariablePickerControl } from '../../fields/VariablePicker.tsx';
import {
  crossClassPickIssue,
  validatedElsewhereMessage,
} from '../../form/arrayFields/crossClassPick.ts';
import ProtocolArrayField from '../../form/ProtocolArrayField.tsx';
import ProtocolField from '../../form/ProtocolField.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import { useStageValue } from '../../form/stageFormHooks.ts';
import BuilderSection from '../BuilderSection.tsx';
import { AutomaticLayoutDefaultField } from './canvasFields.tsx';
import {
  CATEGORICAL_TYPES,
  LAYOUT_TYPES,
  TEXT_TYPES,
  useStageSubject,
  useSubjectVariables,
  useVariableOptions,
  useVariableRoleMap,
} from './codebookOptions.ts';
import ComposerFormFieldsList from './ComposerFormFieldsList.tsx';
import CreateVariableAction, {
  useSetStageFieldValue,
} from './CreateVariableAction.tsx';
import { networkCanvasMessages } from './networkCanvasMessages.ts';
import { asText } from './rowValues.ts';

const QUICK_ADD_FIELD = 'quickAdd';
const LAYOUT_VARIABLE_FIELD = 'layoutVariable';
/**
 * The whole `behaviours` object, not the one flag inside it — see
 * `AutomaticLayoutDefaultField` for why a leaf field here would write an empty
 * container into a stage that never had one.
 */
const BEHAVIOURS_FIELD = 'behaviours';
const CONVEX_HULL_FIELD = 'convexHullVariable';
const NODE_FORM_FIELD = 'nodeForm.fields';

/**
 * The refusal a VALIDATED writer earns by taking an attribute something else
 * already writes around the codebook's rules.
 *
 * The opposite direction has a message of its own in the package's shared
 * cross-class helper. This one belongs to a form-shaped picker, and says what
 * the researcher would have to change to make the pick legal.
 *
 * Encoded rather than formatted: `crossClassPickIssue` answers with a plain
 * string, which reaches the form store and is rendered by a control that never
 * sees this module. `FieldErrors` decodes it in the reader's own language.
 */
const unvalidatedElsewhereMessage = (variableName: string): string =>
  createMessageError(
    networkCanvasMessages.quickAddUnvalidatedElsewhereRefusal,
    { variableName },
  );

/**
 * What the participant can do with nodes on this canvas.
 *
 * Four decisions the stage holds directly — `quickAdd`, `layoutVariable`,
 * `behaviours` and `convexHullVariable` — and three of them name an attribute
 * the codebook has to have, so the section can create one where the protocol
 * has nothing suitable yet.
 *
 * The two attribute pickers deliberately exclude opposite things. Adding a node
 * collects a value through the codebook's own rules, so it may not take an
 * attribute something else writes around them. Grouping writes membership
 * straight onto the node as the participant lassoes and taps, so it may not
 * take an attribute a form elsewhere validates. Each rule is enforced twice:
 * the excluded attributes are not offered, and a pick that survives from a
 * stale draft is refused at save, with the reason.
 */
export default function ComposerNodeConfigurationSection() {
  const intl = useAppIntl();
  const { committedFields } = useStageEditorForm();
  const setStageFieldValue = useSetStageFieldValue();
  const subject = useStageSubject();
  const waiting = subject === undefined;
  const roleMap = useVariableRoleMap();
  const variables = useSubjectVariables(subject);

  const liveQuickAdd = asText(useStageValue(QUICK_ADD_FIELD));
  const liveLayout = asText(useStageValue(LAYOUT_VARIABLE_FIELD));
  const liveHull = asText(useStageValue(CONVEX_HULL_FIELD));

  const quickAddOptions = useVariableOptions({
    subject,
    types: TEXT_TYPES,
    writerClass: 'validated',
    ...(liveQuickAdd === undefined ? {} : { currentValue: liveQuickAdd }),
  });
  const layoutOptions = useVariableOptions({
    subject,
    types: LAYOUT_TYPES,
    writerClass: 'unvalidated',
    ...(liveLayout === undefined ? {} : { currentValue: liveLayout }),
  });
  const hullOptions = useVariableOptions({
    subject,
    types: CATEGORICAL_TYPES,
    writerClass: 'unvalidated',
    ...(liveHull === undefined ? {} : { currentValue: liveHull }),
  });

  // The PRE-EDIT picks, so re-saving a stage that arrived holding a conflict is
  // never refused for one this edit did not introduce.
  const originalQuickAdd = asText(committedFields[QUICK_ADD_FIELD]) ?? '';
  const originalHull = asText(committedFields[CONVEX_HULL_FIELD]) ?? '';

  const quickAddValidation = useMemo(
    () => ({
      custom: messageRuleValidation([
        (value: unknown) =>
          subject === undefined
            ? undefined
            : crossClassPickIssue({
                variableId: typeof value === 'string' ? value : '',
                originalVariableId: originalQuickAdd,
                hasConflictingUse: (variableId) =>
                  hasUnvalidatedUse(roleMap, subject, variableId),
                allVariables: variables,
                message: unvalidatedElsewhereMessage,
              }),
      ]),
    }),
    [originalQuickAdd, roleMap, subject, variables],
  );

  const hullValidation = useMemo(
    () => ({
      custom: messageRuleValidation([
        (value: unknown) =>
          subject === undefined
            ? undefined
            : crossClassPickIssue({
                variableId: typeof value === 'string' ? value : '',
                originalVariableId: originalHull,
                hasConflictingUse: (variableId) =>
                  hasValidatedUse(roleMap, subject, variableId),
                allVariables: variables,
                message: validatedElsewhereMessage,
              }),
      ]),
    }),
    [originalHull, roleMap, subject, variables],
  );

  return (
    <BuilderSection
      title={intl.formatMessage(networkCanvasMessages.composerNodeTitle)}
      description={intl.formatMessage(
        waiting
          ? networkCanvasMessages.composerNodeWaitingDescription
          : networkCanvasMessages.composerNodeDescription,
      )}
      disabled={waiting}
    >
      <ProtocolField<typeof VariablePickerControl>
        name={QUICK_ADD_FIELD}
        component={VariablePickerControl}
        label={intl.formatMessage(networkCanvasMessages.quickAddLabel)}
        hint={intl.formatMessage(networkCanvasMessages.quickAddHint)}
        options={quickAddOptions}
        emptyMessage={intl.formatMessage(networkCanvasMessages.quickAddEmpty)}
        required
        {...quickAddValidation}
      />
      <CreateVariableAction
        subject={subject}
        variableType="text"
        label={intl.formatMessage(networkCanvasMessages.createQuickAddLabel)}
        description={intl.formatMessage(
          networkCanvasMessages.createQuickAddDescription,
        )}
        onCreated={(variableId) =>
          setStageFieldValue(QUICK_ADD_FIELD, variableId)
        }
      />

      <ProtocolField<typeof VariablePickerControl>
        name={LAYOUT_VARIABLE_FIELD}
        component={VariablePickerControl}
        label={intl.formatMessage(networkCanvasMessages.composerLayoutLabel)}
        hint={intl.formatMessage(networkCanvasMessages.composerLayoutHint)}
        options={layoutOptions}
        emptyMessage={intl.formatMessage(
          networkCanvasMessages.composerLayoutEmpty,
        )}
        required
      />
      <CreateVariableAction
        subject={subject}
        variableType="layout"
        label={intl.formatMessage(
          networkCanvasMessages.composerCreateLayoutLabel,
        )}
        description={intl.formatMessage(
          networkCanvasMessages.composerCreateLayoutDescription,
        )}
        onCreated={(variableId) =>
          setStageFieldValue(LAYOUT_VARIABLE_FIELD, variableId)
        }
      />

      <ProtocolField<typeof AutomaticLayoutDefaultField>
        name={BEHAVIOURS_FIELD}
        component={AutomaticLayoutDefaultField}
        label={intl.formatMessage(
          networkCanvasMessages.composerAutomaticLayoutLabel,
        )}
        hint={intl.formatMessage(
          networkCanvasMessages.composerAutomaticLayoutHint,
        )}
        inline
      />

      <ProtocolField<typeof VariablePickerControl>
        name={CONVEX_HULL_FIELD}
        component={VariablePickerControl}
        label={intl.formatMessage(networkCanvasMessages.hullLabel)}
        hint={intl.formatMessage(networkCanvasMessages.hullHint)}
        options={hullOptions}
        emptyMessage={intl.formatMessage(networkCanvasMessages.hullEmpty)}
        {...hullValidation}
      />
      <CreateVariableAction
        subject={subject}
        variableType="categorical"
        label={intl.formatMessage(networkCanvasMessages.createHullLabel)}
        description={intl.formatMessage(
          networkCanvasMessages.createHullDescription,
        )}
        onCreated={(variableId) =>
          setStageFieldValue(CONVEX_HULL_FIELD, variableId)
        }
      />

      <BuilderSection
        title={intl.formatMessage(networkCanvasMessages.nodeFormTitle)}
        description={intl.formatMessage(
          networkCanvasMessages.nodeFormDescription,
        )}
        disabled={waiting}
        capability={{
          fields: [NODE_FORM_FIELD],
          confirmClear: {
            title: networkCanvasMessages.nodeFormClearTitle,
            description: networkCanvasMessages.nodeFormClearDescription,
            confirmLabel: networkCanvasMessages.nodeFormClearConfirm,
          },
        }}
      >
        <ProtocolArrayField<typeof ComposerFormFieldsList>
          name={NODE_FORM_FIELD}
          component={ComposerFormFieldsList}
          subject={subject}
          label={intl.formatMessage(networkCanvasMessages.nodeFormFieldsLabel)}
          hint={intl.formatMessage(networkCanvasMessages.nodeFormFieldsHint)}
          addButtonLabel={intl.formatMessage(
            networkCanvasMessages.nodeFormAddLabel,
          )}
          addTitle={intl.formatMessage(networkCanvasMessages.nodeFormAddTitle)}
          editorTitle={intl.formatMessage(
            networkCanvasMessages.nodeFormEditTitle,
          )}
          itemLabel={networkCanvasMessages.nodeFormFieldNoun}
          emptyStateMessage={intl.formatMessage(
            networkCanvasMessages.nodeFormEmptyState,
          )}
        />
      </BuilderSection>
    </BuilderSection>
  );
}
