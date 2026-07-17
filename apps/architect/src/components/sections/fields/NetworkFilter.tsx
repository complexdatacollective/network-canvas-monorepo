import { get } from 'es-toolkit/compat';
import { useCallback } from 'react';
import { useSelector } from 'react-redux';
import { change, Field, getFormValues } from 'redux-form';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  Filter as FilterQuery,
  ruleValidator,
  withFieldConnector,
  withStoreConnector,
} from '~/components/Query';
import { useAppDispatch } from '~/ducks/hooks';
import type { RootState } from '~/ducks/modules/root';

import Section from '../../EditorLayout/Section';
import { handleFilterDeactivate } from '../Filter';
const FilterField = (
  withFieldConnector as unknown as (
    c: React.ComponentType,
  ) => React.ComponentType<Record<string, unknown>>
)(
  withStoreConnector(
    FilterQuery as unknown as React.ComponentType,
  ) as unknown as React.ComponentType,
);
type NetworkFilterProps = {
  form: string;
  name?: string;
  variant?: 'contrast';
  allowEdgeRules?: boolean;
};
const NetworkFilter = ({
  form,
  name = 'filter',
  variant,
  allowEdgeRules,
}: NetworkFilterProps) => {
  const dispatch = useAppDispatch();
  const { confirm } = useDialog();
  const hasFilter = useSelector(
    (state: RootState) => get(getFormValues(form)(state), name, null) !== null,
  );
  const handleToggleChange = useCallback(
    async (newStatus: boolean) => {
      if (newStatus) {
        return Promise.resolve(true);
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
          return Promise.resolve(false);
        }
      }
      dispatch(change(form, name, null));
      return Promise.resolve(true);
    },
    [confirm, dispatch, form, hasFilter, name],
  );
  const contrastProps =
    variant === 'contrast'
      ? {
          className: 'bg-surface-3 text-surface-3-contrast p-4 rounded-sm',
          layout: 'vertical' as 'vertical' | 'horizontal',
        }
      : {};
  return (
    <Section
      title="Filter"
      toggleable
      summary={
        <Paragraph>
          You can optionally filter which nodes are shown on in this panel.
        </Paragraph>
      }
      startExpanded={hasFilter}
      handleToggleChange={handleToggleChange}
      {...contrastProps}
    >
      <Field
        name={name}
        component={FilterField}
        validate={ruleValidator}
        allowEdgeRules={allowEdgeRules}
      />
    </Section>
  );
};
export default NetworkFilter;
