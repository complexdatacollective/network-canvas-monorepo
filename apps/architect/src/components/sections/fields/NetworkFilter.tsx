import { useCallback } from 'react';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import ArchitectField from '~/components/Form/ArchitectField';
import { ruleValidator } from '~/components/Query';
import {
  useSetStageValue,
  useStageFormValue,
  useStageInitialValue,
} from '~/components/StageEditor/stageFormHooks';

import Section from '../../EditorLayout/Section';
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
  const setStageValue = useSetStageValue();
  const hasFilter = useStageFormValue(name) != null;
  // The whole filter object is one registered field; without seeding it, a
  // committed filter renders blank and save would overwrite it away.
  const initialFilter = useStageInitialValue<RuleSetValue>(name);

  const handleToggleChange = useCallback(
    async (newStatus: boolean) => {
      if (newStatus) {
        return true;
      }

      if (hasFilter) {
        const result = await handleFilterDeactivate(
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

        if (!result) {
          return false;
        }
      }

      setStageValue(name, undefined);
      return true;
    },
    [confirm, hasFilter, name, setStageValue],
  );

  const contrastProps =
    variant === 'contrast'
      ? {
          // The deepest surface level: the panel this sits in is painted
          // `bg-accent`, which resolves to the same slate blue as
          // `--surface-3` in Architect's theme, so level 3 gave the filter no
          // edge against its own container.
          className: 'bg-surface-4 text-surface-4-contrast p-4 rounded-sm',
          layout: 'vertical' as 'vertical' | 'horizontal',
        }
      : {};

  return (
    <Section
      title="Filter"
      toggleable
      startExpanded={hasFilter}
      handleToggleChange={handleToggleChange}
      {...contrastProps}
    >
      {/*
        The section heading is the filter's only visible name — it is what
        labels the toggle beside it, including while the section is collapsed
        and the field is unmounted. So the field repeats nothing: no second
        "Filter" label, and no summary restating what the toggle plus the rule
        builder already show. `labelHidden` keeps the accessible name.
      */}
      <ArchitectField
        name={name}
        label="Filter"
        labelHidden
        component={FilterField}
        initialValue={initialFilter}
        allowEdgeRules={allowEdgeRules}
        validation={{ validator: ruleValidator }}
      />
    </Section>
  );
};

export default NetworkFilter;
