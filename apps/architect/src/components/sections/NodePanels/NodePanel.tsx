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
import IssueAnchor from '~/components/IssueAnchor';
import NetworkFilter from '~/components/sections/fields/NetworkFilter';
import type { RuleSetValue } from '~/components/sections/fields/RuleSetFields';
import { useStageRestoreVersion } from '~/components/StageEditor/StageFormBridge';
import {
  useSetStageValue,
  useStageFormValue,
  useStageInitialValue,
} from '~/components/StageEditor/stageFormHooks';

import { usePanelSlot } from './usePanelSlot';

const EXISTING_DATA_SOURCE = 'existing';

type PanelFilterInput = RuleSetValue | undefined;

export const hasEdgeRules = (filter: PanelFilterInput): boolean =>
  (filter?.rules ?? []).some((rule) => rule.type === 'edge');

export const stripEdgeRules = (
  filter: PanelFilterInput,
): RuleSetValue | undefined => {
  const remaining = (filter?.rules ?? []).filter(
    (rule) => rule.type !== 'edge',
  );
  if (remaining.length === 0) return undefined;
  return { ...filter, rules: remaining };
};

export type NodePanelValue = Record<string, unknown> & {
  id: string;
  title: string | undefined;
  dataSource: string;
  filter: RuleSetValue | undefined;
};

type NodePanelProps = ArrayFieldItemProps<NodePanelValue>;

const NodePanel = ({
  item,
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
  // reorder is being previewed. `ownsSlot` is false for a row the list has
  // already re-indexed past — see usePanelSlot for why that row must render
  // no fields.
  const { fieldName, ownsSlot } = usePanelSlot(item.id, committedIndex, index);

  const handleDelete = () => {
    void confirm({
      title: 'Remove this item?',
      description: 'This item will be removed from the list.',
      confirmLabel: 'Remove item',
      cancelLabel: 'Cancel',
      intent: 'destructive',
      onConfirm: () => onDelete?.(),
    });
  };

  const setStageValue = useSetStageValue();
  const dataSource = useStageFormValue<string | undefined>(
    `${fieldName}.dataSource`,
  );
  const filter = useStageFormValue<PanelFilterInput>(`${fieldName}.filter`);
  const initialTitle = useStageInitialValue<string>(`${fieldName}.title`);
  const initialDataSource = useStageInitialValue<string | undefined>(
    `${fieldName}.dataSource`,
  );

  // Cross-field reactivity (an observer effect, not a `DataSource` `onChange`
  // side effect — `ArchitectField` strips a caller `onChange` defensively, see
  // stageFormHooks.ts): switching away from the in-progress interview network
  // while the panel's filter has edge rules asks for confirmation, since an
  // external data file has no edges to filter.
  const previousDataSourceRef = useRef(dataSource);
  const restoreVersion = useStageRestoreVersion();
  const previousRestoreVersionRef = useRef(restoreVersion);
  useEffect(() => {
    const previousValue = previousDataSourceRef.current;
    previousDataSourceRef.current = dataSource;
    const previousRestoreVersion = previousRestoreVersionRef.current;
    previousRestoreVersionRef.current = restoreVersion;
    if (
      previousValue === undefined ||
      dataSource === previousValue ||
      dataSource === EXISTING_DATA_SOURCE ||
      !hasEdgeRules(filter) ||
      // A superseded row reads the slot values of the panel that replaced it,
      // so its `dataSource` appears to change when the list is re-indexed.
      // Prompting there would ask about a panel that no longer exists.
      !ownsSlot
    ) {
      return;
    }

    // The confirmation is awaited, so the timeline can hold an entry pairing
    // an external data source with the edge rules that had not been stripped
    // yet. Stepping onto it must not re-open the dialog: confirming would
    // delete the rules the restore just brought back, and cancelling would
    // write the data source back and undo the step itself.
    if (previousRestoreVersion !== restoreVersion) return;

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
        setStageValue(`${fieldName}.filter`, stripEdgeRules(filter));
      } else {
        setStageValue(`${fieldName}.dataSource`, previousValue);
      }
    })();
    // Only the dataSource transition itself should retrigger this — `filter`
    // and `confirm` are read at fire time, not watched for their own changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSource, fieldName, ownsSlot, restoreVersion, setStageValue]);

  // Render nothing once the list has re-indexed past this row: its fields would
  // otherwise claim a slot another panel now owns, and tearing them down here —
  // in the same commit that rebinds the survivor — is what hands the slot over
  // intact. The row is on its way out through `ArrayField`'s exit animation, so
  // this only blanks content that is already disappearing.
  if (!ownsSlot) return null;

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
        {/*
          These fields used to sit inside `Section`s that carried the
          `getFieldId(...)` scroll targets the Issues panel resolves against
          (utils/issues.ts `candidateIdsFor`). The fields render bare now, so
          the exact-path anchors are rendered directly — `ArchitectField`'s own
          anchor only covers the `._error` candidate, and its `startCase(name)`
          description would put the raw field path in the issues list.
        */}
        <IssueAnchor
          fieldName={`${fieldName}.title`}
          description="Panel title"
        />
        <ArchitectField
          name={`${fieldName}.title`}
          label="Panel title"
          hint={
            <Paragraph>
              The panel title will be shown above the list of nodes within the
              panel.
            </Paragraph>
          }
          component={InputField}
          validation={{ required: true }}
          initialValue={initialTitle ?? ''}
        />
        <IssueAnchor
          fieldName={`${fieldName}.dataSource`}
          description={`Panel ${index + 1} data source`}
        />
        <ArchitectField
          name={`${fieldName}.dataSource`}
          // Every panel repeated the same hardcoded "Data source" label —
          // distinguish which panel this is (the panel's own index is the
          // only thing that varies; the panel has no title field value
          // available here to name it by).
          label={`Data source for panel ${index + 1}`}
          hint={
            <Paragraph>
              Choose where this panel&rsquo;s data comes from: the in-progress
              interview session (&ldquo;People you have already named&rdquo;),
              or a network data file you have added to this protocol.
            </Paragraph>
          }
          component={DataSource}
          validation={{ required: true }}
          initialValue={initialDataSource}
          canUseExisting
        />
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
