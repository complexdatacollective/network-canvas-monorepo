import { useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import Section from '@codaco/fresco-ui/Section';
import type { VariableType } from '@codaco/protocol-validation';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import ArchitectField from '~/components/Form/ArchitectField';
import MultiSelect, {
  completeRows,
  type PropertyField,
} from '~/components/Form/arrayFields/MultiSelect';
import { useCreateVariable } from '~/components/StageEditor/stageFormHooks';
import type { RootState } from '~/ducks/modules/root';
import { getVariableOptionsForSubject } from '~/selectors/codebook';

import { VariablePickerControl as VariablePicker } from '../../Form/Fields/VariablePicker/VariablePicker';
import { getSortOrderOptionGetter } from '../CategoricalBinPrompts/optionGetters';
import { getLayoutVariablesForSubject } from './selectors';
const additionalMessages = defineMessages({
  addNewSortRule: {
    id: 'architect.additional.sections.sociogramPrompts.promptFieldsLayout.addNewSortRule',
    defaultMessage: 'Add new sort rule',
    description:
      'The addButtonLabel text in components / sections / SociogramPrompts / PromptFieldsLayout.',
  },
});
const messages = defineMessages({
  nodeLayout: {
    id: 'architect.sections.sociogramPrompts.promptFieldsLayout.nodeLayout',
    defaultMessage: 'Node layout',
    description:
      'The title text in components / sections / SociogramPrompts / PromptFieldsLayout.',
  },
  storeNodePositionsAndConfigureThe: {
    id: 'architect.sections.sociogramPrompts.promptFieldsLayout.storeNodePositionsAndConfigureThe',
    defaultMessage:
      'Store node positions and configure the initial order of unplaced nodes.',
    description:
      'The description text in components / sections / SociogramPrompts / PromptFieldsLayout.',
  },
  ifYouUseTheSameLayout: {
    id: 'architect.sections.sociogramPrompts.promptFieldsLayout.ifYouUseTheSameLayout',
    defaultMessage:
      'If you use the same layout attribute across all prompts, the position of nodes will be automatically set as the participant moves between tasks.',
    description:
      'Visible text in components / sections / SociogramPrompts / PromptFieldsLayout.',
  },
  layoutAttribute: {
    id: 'architect.sections.sociogramPrompts.promptFieldsLayout.layoutAttribute',
    defaultMessage: 'Layout attribute',
    description:
      'The label text in components / sections / SociogramPrompts / PromptFieldsLayout.',
  },
  createOrSelectAnAttributeThat: {
    id: 'architect.sections.sociogramPrompts.promptFieldsLayout.createOrSelectAnAttributeThat',
    defaultMessage:
      'Create or select an attribute that stores node coordinates.',
    description:
      'The hint text in components / sections / SociogramPrompts / PromptFieldsLayout.',
  },
  sortUnplacedNodes: {
    id: 'architect.sections.sociogramPrompts.promptFieldsLayout.sortUnplacedNodes',
    defaultMessage: 'Sort unplaced nodes',
    description:
      'The title text in components / sections / SociogramPrompts / PromptFieldsLayout.',
  },
  controlTheOrderOfTheStack: {
    id: 'architect.sections.sociogramPrompts.promptFieldsLayout.controlTheOrderOfTheStack',
    defaultMessage:
      'Control the order of the stack participants use to position nodes.',
    description:
      'The description text in components / sections / SociogramPrompts / PromptFieldsLayout.',
  },
  sortRules: {
    id: 'architect.sections.sociogramPrompts.promptFieldsLayout.sortRules',
    defaultMessage: 'Sort rules',
    description:
      'The label text in components / sections / SociogramPrompts / PromptFieldsLayout.',
  },
});

const SORT_RULE_PROPERTIES: PropertyField[] = [
  { fieldName: 'property' },
  { fieldName: 'direction' },
];

// A row's own cells cannot block the save (see RowField), and a rule missing
// its direction fails `SortRuleSchema` after `prune`.

/** Stable empty list: `initialValue` is a register-effect dependency. */
const EMPTY_SORT_ORDER: Record<string, unknown>[] = [];

type PromptFieldsProps = {
  entity?: string;
  type?: string;
  /** The row's own pre-edit values, supplied by DialogArrayField's `item` spread. */
  layout?: { layoutVariable?: string | null };
  sortOrder?: Record<string, unknown>[];
};

const PromptFieldsLayout = ({
  entity = '',
  type = '',
  layout,
  sortOrder: initialSortOrder,
}: PromptFieldsProps) => {
  const intl = useAppIntl();
  const SORT_RULE_VALIDATION = {
    completeRows: completeRows(SORT_RULE_PROPERTIES, intl),
  };
  const subject = useMemo(
    () => ({ entity: entity as 'node' | 'edge' | 'ego', type }),
    [entity, type],
  );
  const variableOptions = useSelector((state: RootState) =>
    getVariableOptionsForSubject(state, subject),
  );
  const layoutVariablesForSubject = useSelector((state: RootState) =>
    getLayoutVariablesForSubject(state, subject),
  );

  // Writes into THIS dialog's own (local) form store — the row-editor form,
  // not the stage.
  const setLocalFieldValue = useFormStore((store) => store.setFieldValue);
  const { createVariable } = useCreateVariable();
  const handleCreateVariable = useCallback(
    async (value: string, variableType: string, fieldName: string) => {
      const variable = await createVariable(
        value,
        variableType as VariableType,
      );
      if (variable) setLocalFieldValue(fieldName, variable);
    },
    [createVariable, setLocalFieldValue],
  );

  // "Sort unplaced nodes" gates `sortOrder`'s own mounting, so a reactive
  // read of the field can never see a value until AFTER the section is
  // already expanded — use the row's own pre-edit prop value instead, which
  // only needs to answer "does a configured order already exist" once, on
  // mount; the toggle switch owns everything after that.
  const hasSortOrder = !!initialSortOrder && initialSortOrder.length > 0;

  return (
    <Section
      title={intl.formatMessage(messages.nodeLayout)}
      description={intl.formatMessage(
        messages.storeNodePositionsAndConfigureThe,
      )}
    >
      <Alert variant="info" className="my-7">
        <AlertDescription>
          {intl.formatMessage(messages.ifYouUseTheSameLayout)}
        </AlertDescription>
      </Alert>
      <ArchitectField
        name="layout.layoutVariable"
        label={intl.formatMessage(messages.layoutAttribute)}
        hint={intl.formatMessage(messages.createOrSelectAnAttributeThat)}
        component={VariablePicker}
        validation={{ required: true }}
        initialValue={layout?.layoutVariable ?? undefined}
        type={type}
        entity={entity}
        options={layoutVariablesForSubject}
        onCreateOption={(value: string) =>
          handleCreateVariable(value, 'layout', 'layout.layoutVariable')
        }
      />
      <Section
        toggleable
        title={intl.formatMessage(messages.sortUnplacedNodes)}
        description={intl.formatMessage(messages.controlTheOrderOfTheStack)}
        defaultOpen={hasSortOrder}
      >
        <ArchitectArrayField
          name="sortOrder"
          label={intl.formatMessage(messages.sortRules)}
          component={MultiSelect}
          addButtonLabel={intl.formatMessage(additionalMessages.addNewSortRule)}
          initialValue={initialSortOrder ?? EMPTY_SORT_ORDER}
          properties={SORT_RULE_PROPERTIES}
          validation={SORT_RULE_VALIDATION}
          maxItems={5}
          options={(property: string, rowValues: unknown, allValues: unknown) =>
            getSortOrderOptionGetter(variableOptions, intl)(
              property,
              rowValues,
              allValues as Record<string, unknown>[],
            )
          }
        />
      </Section>
    </Section>
  );
};

export default PromptFieldsLayout;
