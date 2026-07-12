import { Trash2 } from 'lucide-react';
import type { ComponentType } from 'react';

import { IconButton } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { ArrayFieldDragHandle } from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import DataSource from '~/components/Form/Fields/DataSource';
import type { FrescoReduxArrayFieldItemProps } from '~/components/Form/FrescoReduxArrayField';
import FrescoReduxField from '~/components/Form/FrescoReduxField';
import ValidatedField from '~/components/Form/ValidatedField';
import NetworkFilter from '~/components/sections/fields/NetworkFilter';
import { getFieldId } from '~/utils/issues';

import Section from '../../EditorLayout/Section';

const FrescoInputField = InputField as ComponentType<Record<string, unknown>>;

export type NodePanelValue = Record<string, unknown> & {
  id: string;
  title: string | null;
  dataSource: string;
  filter: unknown;
};

type NodePanelProps = FrescoReduxArrayFieldItemProps<NodePanelValue>;

const NodePanel = ({
  fieldName,
  form,
  index,
  itemCount,
  isSortable,
  dragControls,
  onMove,
  onDelete,
  disabled,
  readOnly,
}: NodePanelProps) => {
  const { confirm } = useDialog();
  const interactionDisabled = disabled || readOnly;
  const handleDelete = () => {
    void confirm({
      title: 'Remove this item?',
      description: 'This item will be removed from the list.',
      confirmLabel: 'Remove item',
      cancelLabel: 'Cancel',
      intent: 'destructive',
      onConfirm: onDelete,
    });
  };

  return (
    <div className="flex w-full items-start gap-4">
      {isSortable && (
        <ArrayFieldDragHandle
          dragControls={dragControls}
          index={index}
          itemCount={itemCount}
          onMove={onMove}
          disabled={interactionDisabled}
          label={`Reorder side panel ${index + 1} of ${itemCount}`}
          className="mt-10"
        />
      )}
      <div className="min-w-0 flex-1">
        <Section
          title="Panel Title"
          summary={
            <Paragraph>
              The panel title will be shown above the list of nodes within the
              panel.
            </Paragraph>
          }
          id={getFieldId(`${fieldName}.title`)}
          layout="vertical"
          className="bg-slate-blue-dark mt-10 text-white [--text-dark:white]"
        >
          <ValidatedField
            name={`${fieldName}.title`}
            label="Panel title"
            labelHidden
            component={FrescoReduxField}
            validation={{ required: true }}
            componentProps={{
              fieldComponent: FrescoInputField,
              placeholder: 'Panel title',
            }}
          />
        </Section>
        <Section
          title="Data Source"
          summary={
            <Paragraph>
              Choose where the data for this panel should come from (either the
              in-progress interview session [&quot;People you have already
              named&quot;], or an external network data file that you have
              added).
            </Paragraph>
          }
          id={getFieldId(`${fieldName}.dataSource`)}
          layout="vertical"
          className="bg-slate-blue-dark mt-10 text-white [--text-dark:white]"
        >
          <ValidatedField
            component={
              DataSource as unknown as React.ComponentType<
                Record<string, unknown>
              >
            }
            name={`${fieldName}.dataSource`}
            validation={{ required: true }}
            componentProps={{
              canUseExisting: true,
            }}
          />
        </Section>
        <NetworkFilter
          form={form}
          variant="contrast"
          name={`${fieldName}.filter`}
        />
      </div>
      <IconButton
        icon={<Trash2 />}
        aria-label="Remove side panel"
        size="sm"
        variant="text"
        color="destructive"
        disabled={interactionDisabled}
        className="mt-10"
        onClick={handleDelete}
      />
    </div>
  );
};

export default NodePanel;
