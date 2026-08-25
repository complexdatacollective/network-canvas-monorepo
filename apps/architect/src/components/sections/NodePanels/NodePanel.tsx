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

import { panelAcceptsNominationOdds } from './panelNominationOdds';
import { PanelSyntheticSection } from './PanelSyntheticSection';
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
  // Authored generation parameters (`panelSchema.synthetic`). No control
  // renders it, so it is optional rather than `| undefined`: a panel that was
  // never given one must keep the key absent, not carry an explicit
  // `undefined` that would read as a cleared value.
  synthetic?: Record<string, unknown>;
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
  // Authored generation parameters. This editor renders no control for them
  // (see NodePanels' registration), but the effect below must clear them when
  // the panel stops drawing on the in-progress network.
  const synthetic = useStageFormValue<Record<string, unknown> | undefined>(
    `${fieldName}.synthetic`,
  );
  const initialTitle = useStageInitialValue<string>(`${fieldName}.title`);
  const initialDataSource = useStageInitialValue<string | undefined>(
    `${fieldName}.dataSource`,
  );

  // Cross-field reactivity (an observer effect, not a `DataSource` `onChange`
  // side effect — `ArchitectField` strips a caller `onChange` defensively, see
  // stageFormHooks.ts). Two things follow a change of data source: edge rules
  // an external data file has no edges to apply them to, and nomination odds
  // the schema admits on nothing but the interview network.
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
      // A superseded row reads the slot values of the panel that replaced it,
      // so its `dataSource` appears to change when the list is re-indexed.
      // Acting there would speak for a panel that no longer exists.
      !ownsSlot
    ) {
      return;
    }

    // A restore writes the snapshot's own values for every field it names, so
    // stepping the timeline is not a researcher changing the data source and
    // neither reaction belongs to it. The confirmation being awaited is what
    // makes this reachable: the timeline can hold an entry pairing an external
    // data source with the edge rules and odds that had not been dropped yet,
    // and stepping onto that entry would otherwise delete exactly what the
    // step just brought back — or, on the cancel path, write the data source
    // back and undo the step itself.
    if (previousRestoreVersion !== restoreVersion) return;

    /**
     * Drop the panel's authored generation parameters where this data source
     * is one the schema refuses them on.
     *
     * `panelSchema` admits nomination odds on an existing-network panel alone,
     * so a roster panel that keeps them is a stage that cannot be saved — and
     * the control that would remove them is the very one this transition stops
     * rendering. Which data sources those are is ASKED of the schema through
     * the same helper the control is gated on (see the render below), rather
     * than spelled out a second time here.
     */
    const dropInadmissibleOdds = () => {
      if (
        panelAcceptsNominationOdds({
          ...item,
          // The live value is the one that just changed; `item` still carries
          // the list's last normalisation of this row.
          dataSource,
        })
      ) {
        return;
      }
      setStageValue(`${fieldName}.synthetic`, undefined);
    };

    // Nothing to confirm — an external file the panel's filter never asked to
    // follow an edge through. The odds still have to go, and waiting for a
    // dialog that will never open is what left them behind.
    if (dataSource === EXISTING_DATA_SOURCE || !hasEdgeRules(filter)) {
      dropInadmissibleOdds();
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
        setStageValue(`${fieldName}.filter`, stripEdgeRules(filter));
        dropInadmissibleOdds();
      } else {
        // Cancelling puts the panel back where it was found, so the odds are
        // admissible again and were never removed — the drop happens on the
        // confirmed branch alone, and the write below only retriggers this
        // effect for a data source that accepts them.
        setStageValue(`${fieldName}.dataSource`, previousValue);
      }
    })();
    // Only the dataSource transition itself should retrigger this — `filter`,
    // `item` and `confirm` are read at fire time, not watched for their own
    // changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSource, fieldName, ownsSlot, restoreVersion, setStageValue]);

  // Render nothing once the list has re-indexed past this row: its fields would
  // otherwise claim a slot another panel now owns, and tearing them down here —
  // in the same commit that rebinds the survivor — is what hands the slot over
  // intact. The row is on its way out through `ArrayField`'s exit animation, so
  // this only blanks content that is already disappearing.
  if (!ownsSlot) return null;

  // Every panel used to repeat the same hardcoded "Data source" label — this
  // distinguishes which panel it belongs to (the panel's own index is the only
  // thing that varies; the panel has no title field value available here to
  // name it by). Held in one place so the field and its issue anchor cannot
  // call the same control two different things.
  const dataSourceLabel = `Data source for panel ${index + 1}`;

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
          anchor only covers the `._error` candidate. Each `description` repeats
          the field's `label`, which is what `ArchitectField` now anchors with
          too (#1400), so whichever candidate the panel resolves names the field
          the same way.
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
          description={dataSourceLabel}
        />
        <ArchitectField
          name={`${fieldName}.dataSource`}
          label={dataSourceLabel}
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
        {/*
          Nomination odds are decided person by person, which only an
          existing-network panel does — `panelSchema` refuses them on a roster
          panel, whose contribution is drawn once for the whole stage. So the
          control follows the data source rather than rendering disabled, and
          it is the SCHEMA that is asked which data sources those are (the
          stage's Synthetic data section asks the same question of the same
          helper, so the two surfaces cannot come to disagree).
        */}
        {panelAcceptsNominationOdds({
          ...item,
          // The live value wins while it is registered; `item` carries the
          // list's own normalisation for the window before it is.
          dataSource: dataSource ?? item.dataSource,
        }) && <PanelSyntheticSection fieldName={fieldName} />}
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
