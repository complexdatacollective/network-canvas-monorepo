import type { Dispatch } from '@reduxjs/toolkit';
import { bindActionCreators } from '@reduxjs/toolkit';
import { has } from 'es-toolkit/compat';
import { Plus } from 'lucide-react';
import { useCallback } from 'react';
import { connect } from 'react-redux';
import type { FormAction } from 'redux-form';
import { arrayPush, change, Field, formValueSelector } from 'redux-form';
import { v4 as uuid } from 'uuid';

import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
import OrderedList from '~/components/OrderedList/OrderedList';
import { useAppDispatch } from '~/ducks/hooks';
import type { RootState } from '~/ducks/modules/root';

import IssueAnchor from '../../IssueAnchor';
import NodePanel from './NodePanel';
type NodePanelsProps = {
  form: string;
  createNewPanel: () => void;
  panels?: Array<Record<string, unknown>> | null;
  disabled?: boolean;
};
const NodePanels = ({
  form,
  createNewPanel,
  panels = null,
  disabled = false,
  ...rest
}: NodePanelsProps) => {
  const dispatch = useAppDispatch();
  const { confirm } = useDialog();
  const handleToggleChange = useCallback(
    async (newState: boolean) => {
      if (!panels || panels.length === 0 || newState) {
        return true;
      }
      const confirmed = await confirm({
        title: 'This will delete your panel configuration',
        description:
          'This will clear your panel configuration, and delete any filter rules you have created. Do you want to continue?',
        confirmLabel: 'Remove panels',
        cancelLabel: 'Cancel',
        intent: 'warning',
        onConfirm: () => {},
      });
      if (confirmed) {
        dispatch(change(form, 'panels', null) as unknown as FormAction);
        return true;
      }
      return false;
    },
    [confirm, dispatch, panels, form],
  );
  const isFull = panels && panels.length === 2;
  return (
    <Section
      // eslint-disable-next-line react/jsx-props-no-spreading
      {...rest}
      title="Side Panels"
      toggleable
      summary={
        <Paragraph>
          Use this section to configure up to two side panels on this name
          generator.
        </Paragraph>
      }
      startExpanded={!!panels}
      handleToggleChange={handleToggleChange}
    >
      <div>
        <IssueAnchor fieldName="panels" description="Panel Configuration" />
        <Field
          name="panels"
          component={OrderedList}
          item={NodePanel}
          form={form}
        />

        {!isFull && (
          <div className="mt-7">
            <Button
              onClick={() => createNewPanel()}
              icon={<Plus />}
              color="primary"
            >
              Add new panel
            </Button>
          </div>
        )}
      </div>
    </Section>
  );
};
const mapStateToProps = (
  state: RootState,
  props: {
    form: string;
  },
) => {
  const getFormValues = formValueSelector(props.form);
  const panels = getFormValues(state, 'panels') as
    | Array<Record<string, unknown>>
    | null
    | undefined;
  const disabled = !has(
    getFormValues(state, 'subject') as Record<string, unknown>,
    'type',
  );
  return {
    disabled,
    panels,
  };
};
const mapDispatchToProps = (
  dispatch: Dispatch,
  {
    form,
  }: {
    form: string;
  },
) => ({
  createNewPanel: bindActionCreators(
    () =>
      arrayPush(form, 'panels', {
        id: uuid(),
        title: null,
        dataSource: 'existing',
        filter: null,
      }),
    dispatch,
  ),
});
export default connect(mapStateToProps, mapDispatchToProps)(NodePanels);
