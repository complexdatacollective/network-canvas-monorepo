import { has } from 'es-toolkit/compat';
import { useCallback } from 'react';
import { connect } from 'react-redux';
import type { FormAction } from 'redux-form';
import { change, Field, formValueSelector } from 'redux-form';
import { v4 as uuid } from 'uuid';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
import FrescoReduxArrayField from '~/components/Form/FrescoReduxArrayField';
import { useAppDispatch } from '~/ducks/hooks';
import type { RootState } from '~/ducks/modules/root';

import IssueAnchor from '../../IssueAnchor';
import NodePanel, { type NodePanelValue } from './NodePanel';

const createNodePanel = (): NodePanelValue => ({
  id: uuid(),
  title: null,
  dataSource: 'existing',
  filter: null,
});

export const handlePanelToggleChange = async (
  newState: boolean,
  panels: Array<Record<string, unknown>> | null | undefined,
  confirm: ReturnType<typeof useDialog>['confirm'],
  removePanels: () => void,
) => {
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

  if (!confirmed) return false;

  removePanels();
  return true;
};

type NodePanelsProps = {
  form: string;
  panels?: Array<Record<string, unknown>> | null;
  disabled?: boolean;
};
export const NodePanels = ({
  form,
  panels = null,
  disabled = false,
  ...rest
}: NodePanelsProps) => {
  const dispatch = useAppDispatch();
  const { confirm } = useDialog();
  const handleToggleChange = useCallback(
    (newState: boolean) =>
      handlePanelToggleChange(newState, panels, confirm, () => {
        dispatch(change(form, 'panels', null) as unknown as FormAction);
      }),
    [confirm, dispatch, panels, form],
  );
  return (
    <Section
      // eslint-disable-next-line react/jsx-props-no-spreading
      {...rest}
      title="Side Panels"
      toggleable
      disabled={disabled}
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
          component={FrescoReduxArrayField}
          label=""
          itemComponent={NodePanel}
          itemTemplate={createNodePanel}
          getId={(panel: NodePanelValue) => panel.id}
          itemClasses="bg-accent text-accent-contrast elevation-low"
          addButtonLabel="Add new panel"
          emptyStateMessage="No side panels configured."
          immediateAdd
          sortable
          maxItems={2}
          confirmDelete={false}
          disabled={disabled}
        />
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
export default connect(mapStateToProps)(NodePanels);
