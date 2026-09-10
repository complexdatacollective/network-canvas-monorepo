import { createElement, useCallback } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Section from '@codaco/fresco-ui/Section';
import ArchitectField from '~/components/Form/ArchitectField';
import { ruleValidator } from '~/components/Query';
import {
  useStageFormValue,
  useStageInitialValue,
} from '~/components/StageEditor/stageFormHooks';

import { handleFilterDeactivate } from '../Filter';
import { FilterField, type RuleSetValue } from './RuleSetFields';
const messages = defineMessages({
  thisWillClearYourFilter: {
    id: 'architect.sections.fields.networkFilter.thisWillClearYourFilter',
    defaultMessage: 'This will clear your filter',
    description:
      'The title text in components / sections / fields / NetworkFilter.',
  },
  thisWillClearYourFilterAnd: {
    id: 'architect.sections.fields.networkFilter.thisWillClearYourFilterAnd',
    defaultMessage:
      'This will clear your filter, and delete any rules you have created. Do you want to continue?',
    description:
      'The description text in components / sections / fields / NetworkFilter.',
  },
  clearFilter: {
    id: 'architect.sections.fields.networkFilter.clearFilter',
    defaultMessage: 'Clear filter',
    description:
      'The confirmLabel text in components / sections / fields / NetworkFilter.',
  },
  panelFilter: {
    id: 'architect.sections.fields.networkFilter.panelFilter',
    defaultMessage: 'Panel filter',
    description:
      'The title text in components / sections / fields / NetworkFilter.',
  },
  filterTheNodesAndEdgesDisplayed: {
    id: 'architect.sections.fields.networkFilter.filterTheNodesAndEdgesDisplayed',
    defaultMessage:
      'Filter the nodes and edges displayed to participants in this panel.',
    description:
      'The description text in components / sections / fields / NetworkFilter.',
  },
  filterRules: {
    id: 'architect.sections.fields.networkFilter.filterRules',
    defaultMessage: 'Filter rules',
    description:
      'The label text in components / sections / fields / NetworkFilter.',
  },
  createOneOrMoreRulesThat: {
    id: 'architect.sections.fields.networkFilter.createOneOrMoreRulesThat',
    defaultMessage:
      'Create one or more rules that must match in order for a node or edge to be shown in this panel.',
    description:
      'The hint text in components / sections / fields / NetworkFilter.',
  },
});

type NetworkFilterProps = {
  name?: string;
  allowEdgeRules?: boolean;
};

const NetworkFilter = ({
  name = 'filter',
  allowEdgeRules,
}: NetworkFilterProps) => {
  const intl = useAppIntl();
  const { confirm } = useDialog();
  const hasFilter = useStageFormValue(name) != null;
  // The whole filter object is one registered field; without seeding it, a
  // committed filter renders blank and save would overwrite it away.
  const initialFilter = useStageInitialValue<RuleSetValue>(name);

  const handleToggleChange = useCallback(
    async (newStatus: boolean) => {
      if (newStatus || !hasFilter) {
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
    [confirm, hasFilter],
  );

  return (
    <Section
      title={intl.formatMessage(messages.panelFilter)}
      description={intl.formatMessage(messages.filterTheNodesAndEdgesDisplayed)}
      toggleable
      defaultOpen={hasFilter}
      onOpenChange={handleToggleChange}
    >
      <ArchitectField
        name={name}
        label={intl.formatMessage(messages.filterRules)}
        hint={intl.formatMessage(messages.createOneOrMoreRulesThat)}
        component={FilterField}
        initialValue={initialFilter}
        allowEdgeRules={allowEdgeRules}
        validation={{
          validator: (value: unknown) => ruleValidator(value, intl),
        }}
      />
    </Section>
  );
};

export default NetworkFilter;
