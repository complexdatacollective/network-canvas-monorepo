import { createElement, useCallback, useMemo } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Section from '@codaco/fresco-ui/Section';
import type { FilterRule } from '@codaco/protocol-validation';
import ArchitectField from '~/components/Form/ArchitectField';
import type { Rule } from '~/components/Query/Rules/validateRule';
import {
  useStageFormValue,
  useStageInitialValue,
} from '~/components/StageEditor/stageFormHooks';

import { ruleValidator } from '../Query';
import { FilterField } from './fields/RuleSetFields';
import getEdgeFilteringWarning from './SociogramPrompts/utils';
const messages = defineMessages({
  thisWillClearYourFilter: {
    id: 'architect.sections.filter.thisWillClearYourFilter',
    defaultMessage: 'This will clear your filter',
    description: 'The title text in components / sections / Filter.',
  },
  thisWillClearYourFilterAnd: {
    id: 'architect.sections.filter.thisWillClearYourFilterAnd',
    defaultMessage:
      'This will clear your filter, and delete any rules you have created. Do you want to continue?',
    description: 'The description text in components / sections / Filter.',
  },
  clearFilter: {
    id: 'architect.sections.filter.clearFilter',
    defaultMessage: 'Clear filter',
    description: 'The confirmLabel text in components / sections / Filter.',
  },
  stageFilter: {
    id: 'architect.sections.filter.stageFilter',
    defaultMessage: 'Stage filter',
    description: 'The title text in components / sections / Filter.',
  },
  createRulesThatLimitWhichNodes: {
    id: 'architect.sections.filter.createRulesThatLimitWhichNodes',
    defaultMessage:
      'Create rules that limit which nodes or edges are shown on this stage.',
    description: 'The description text in components / sections / Filter.',
  },
  filterRulesHideConfiguredValues: {
    id: 'architect.sections.filter.filterRulesHideConfiguredValues',
    defaultMessage: 'Filter rules hide configured values',
    description: 'Visible text in components / sections / Filter.',
  },
  thisStageHasEdgeCreationOr: {
    id: 'architect.sections.filter.thisStageHasEdgeCreationOr',
    defaultMessage:
      'This stage has edge creation or display values that will not be shown based on the current filter rules.',
    description: 'Visible text in components / sections / Filter.',
  },
  filterRules: {
    id: 'architect.sections.filter.filterRules',
    defaultMessage: 'Filter rules',
    description: 'The label text in components / sections / Filter.',
  },
  createOneOrMoreRulesTo: {
    id: 'architect.sections.filter.createOneOrMoreRulesTo',
    defaultMessage:
      'Create one or more rules to filter what is shown on this stage.',
    description: 'The hint text in components / sections / Filter.',
  },
});

export const handleFilterDeactivate = async (
  openDialogFn: () => Promise<boolean>,
) => {
  const result = await openDialogFn();
  return result;
};

/** Matches `RuleSetFields.tsx`'s `RuleSetValue` (not exported from there). */
type FilterValue = { rules?: Rule[]; join?: string } | undefined;
type FilterPrompt = { edges?: { create?: string; display?: string[] } };

const Filter = () => {
  const intl = useAppIntl();
  const { confirm } = useDialog();
  const currentValue = useStageFormValue<FilterValue>('filter');
  const initialValue = useStageInitialValue<FilterValue>('filter');
  // get edge creation and display values for edges across all prompts
  const prompts = useStageFormValue<FilterPrompt[]>('prompts');
  const { edgeCreationValues, edgeDisplayValues } = useMemo(() => {
    if (!prompts) return { edgeCreationValues: [], edgeDisplayValues: [] };
    const creationValues: string[] = [];
    const displayValues: string[] = [];
    prompts.forEach((prompt) => {
      if (prompt?.edges?.create) creationValues.push(prompt.edges.create);
      if (prompt?.edges?.display) displayValues.push(...prompt.edges.display);
    });
    return {
      edgeCreationValues: creationValues,
      edgeDisplayValues: displayValues,
    };
  }, [prompts]);
  const shouldShowWarning = useMemo(() => {
    if (edgeCreationValues.length > 0 || edgeDisplayValues.length > 0) {
      return getEdgeFilteringWarning(
        (currentValue?.rules || []) as FilterRule[],
        [...edgeCreationValues, ...edgeDisplayValues],
      );
    }
    return false;
  }, [currentValue, edgeCreationValues, edgeDisplayValues]);
  const handleToggleChange = useCallback(
    async (newState: boolean) => {
      if (!currentValue || newState) {
        return true;
      }
      return handleFilterDeactivate(
        async () =>
          (await confirm({
            title: createElement(AppMessage, {
              message: messages.thisWillClearYourFilter,
            }),
            description: createElement(AppMessage, {
              message: messages.thisWillClearYourFilterAnd,
            }),
            confirmLabel: createElement(AppMessage, {
              message: messages.clearFilter,
            }),
            cancelLabel: createElement(AppMessage, {
              message: commonMessages.cancel,
            }),
            intent: 'warning',
            onConfirm: () => {},
          })) === true,
      );
    },
    [confirm, currentValue],
  );
  return (
    <Section
      title={intl.formatMessage(messages.stageFilter)}
      description={intl.formatMessage(messages.createRulesThatLimitWhichNodes)}
      toggleable
      defaultOpen={!!currentValue}
      onOpenChange={handleToggleChange}
    >
      {shouldShowWarning && (
        <Alert variant="warning" className="my-7">
          <AlertTitle>
            {intl.formatMessage(messages.filterRulesHideConfiguredValues)}
          </AlertTitle>
          <AlertDescription>
            {intl.formatMessage(messages.thisStageHasEdgeCreationOr)}
          </AlertDescription>
        </Alert>
      )}
      <ArchitectField
        name="filter"
        label={intl.formatMessage(messages.filterRules)}
        hint={intl.formatMessage(messages.createOneOrMoreRulesTo)}
        component={FilterField}
        initialValue={initialValue}
        validation={{
          validator: (value: unknown) => ruleValidator(value, intl),
        }}
      />
    </Section>
  );
};
export default Filter;
