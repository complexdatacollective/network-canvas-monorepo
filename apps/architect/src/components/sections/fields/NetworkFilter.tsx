import { useCallback } from 'react';

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

type NetworkFilterProps = {
  name?: string;
  variant?: 'contrast';
  allowEdgeRules?: boolean;
};

const NetworkFilter = ({
  name = 'filter',
  variant,
  allowEdgeRules,
}: NetworkFilterProps) => {
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
            title: 'This will clear your filter',
            description:
              'This will clear your filter, and delete any rules you have created. Do you want to continue?',
            confirmLabel: 'Clear filter',
            cancelLabel: 'Cancel',
            intent: 'warning',
            onConfirm: () => {},
          })) === true,
      );
    },
    [confirm, hasFilter],
  );

  const contrastClassName =
    variant === 'contrast'
      ? 'rounded-sm bg-surface-4 text-surface-4-contrast p-4'
      : undefined;

  return (
    <div className={contrastClassName ?? 'w-full'}>
      <Section
        title="Panel filter"
        description="Filter the nodes and edges displayed to participants in this panel."
        toggleable
        defaultOpen={hasFilter}
        onOpenChange={handleToggleChange}
      >
        <ArchitectField
          name={name}
          label="Filter rules"
          hint="Create one or more rules that must match in order for a node or edge to be shown in this panel."
          component={FilterField}
          initialValue={initialFilter}
          allowEdgeRules={allowEdgeRules}
          validation={{ validator: ruleValidator }}
        />
      </Section>
    </div>
  );
};

export default NetworkFilter;
