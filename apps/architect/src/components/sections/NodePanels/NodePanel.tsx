import { Trash2 } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { IconButton } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { ArrayFieldDragHandle } from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import type { ArrayFieldItemProps } from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import ArchitectField from '~/components/Form/ArchitectField';
import DataSource from '~/components/Form/Fields/DataSource';
import NetworkFilter from '~/components/sections/fields/NetworkFilter';
import {
  useSetStageValue,
  useStageFormValue,
  useStageInitialValue,
} from '~/components/StageEditor/stageFormHooks';
import { getFieldId } from '~/utils/issues';

import Section from '../../EditorLayout/Section';

const EXISTING_DATA_SOURCE = 'existing';

type PanelFilter = { join?: string; rules?: { type?: string }[] } | null;

export const hasEdgeRules = (filter: PanelFilter): boolean =>
  (filter?.rules ?? []).some((rule) => rule.type === 'edge');

export const stripEdgeRules = (filter: PanelFilter): PanelFilter => {
  const remaining = (filter?.rules ?? []).filter(
    (rule) => rule.type !== 'edge',
  );
  if (remaining.length === 0) return null;
  return { ...filter, rules: remaining };
};

export type NodePanelValue = Record<string, unknown> & {
  id: string;
  title: string | null;
  dataSource: string;
  filter: unknown;
};

type NodePanelProps = ArrayFieldItemProps<NodePanelValue>;

const NodePanel = ({
  index,
  committedIndex,
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
  // Bind to the committed position, not the live (possibly mid-drag-preview)
  // index, so the fields stay attached to the right panel while a pointer
  // reorder is being previewed.
  const fieldName = `panels[${committedIndex ?? index}]`;

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

  const setStageValue = useSetStageValue();
  const dataSource = useStageFormValue<string | undefined>(
    `${fieldName}.dataSource`,
  );
  const filter = useStageFormValue<PanelFilter>(`${fieldName}.filter`);
  const initialTitle = useStageInitialValue<string | null>(
    `${fieldName}.title`,
  );
  const initialDataSource = useStageInitialValue<string | undefined>(
    `${fieldName}.dataSource`,
  );

  // Cross-field reactivity (an observer effect, not a `DataSource` `onChange`
  // side effect — `ArchitectField` strips a caller `onChange` defensively, see
  // stageFormHooks.ts): switching away from the in-progress interview network
  // while the panel's filter has edge rules asks for confirmation, since an
  // external data file has no edges to filter.
  const previousDataSourceRef = useRef(dataSource);
  useEffect(() => {
    const previousValue = previousDataSourceRef.current;
    previousDataSourceRef.current = dataSource;
    if (
      previousValue === undefined ||
      dataSource === previousValue ||
      dataSource === EXISTING_DATA_SOURCE ||
      !hasEdgeRules(filter ?? null)
    ) {
      return;
    }

    void (async () => {
      const confirmed = await confirm({
        title: 'This will remove your edge rules',
        description:
          'An external data file contains only nodes, so edge rules cannot be applied to it. Switching will delete the edge rules in this panel’s filter. Do you want to continue?',
        confirmLabel: 'Remove edge rules',
        cancelLabel: 'Cancel',
        intent: 'warning',
        onConfirm: () => {},
      });

      if (confirmed) {
        setStageValue(`${fieldName}.filter`, stripEdgeRules(filter ?? null));
      } else {
        setStageValue(`${fieldName}.dataSource`, previousValue);
      }
    })();
    // Only the dataSource transition itself should retrigger this — `filter`
    // and `confirm` are read at fire time, not watched for their own changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSource, fieldName, setStageValue]);

  return (
    <div className="flex w-full items-center gap-4">
      {isSortable && (
        <ArrayFieldDragHandle
          dragControls={dragControls}
          index={index}
          itemCount={itemCount}
          onMove={onMove}
          disabled={interactionDisabled}
          label={`Reorder side panel ${index + 1} of ${itemCount}`}
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
          <ArchitectField
            name={`${fieldName}.title`}
            label="Panel title"
            labelHidden
            component={InputField}
            validation={{ required: true }}
            initialValue={initialTitle ?? ''}
            placeholder="Panel title"
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
          <ArchitectField
            name={`${fieldName}.dataSource`}
            // Every panel repeated the same hardcoded "Data source" label —
            // distinguish which panel this is (the panel's own index is the
            // only thing that varies; the panel has no title field value
            // available here to name it by).
            label={`Panel ${index + 1} data source`}
            labelHidden
            component={DataSource}
            validation={{ required: true }}
            initialValue={initialDataSource}
            canUseExisting
          />
        </Section>
        <NetworkFilter
          variant="contrast"
          name={`${fieldName}.filter`}
          allowEdgeRules={dataSource === EXISTING_DATA_SOURCE}
        />
      </div>
      <IconButton
        icon={<Trash2 />}
        aria-label="Remove side panel"
        color="destructive"
        disabled={interactionDisabled}
        onClick={handleDelete}
      />
    </div>
  );
};

export default NodePanel;
