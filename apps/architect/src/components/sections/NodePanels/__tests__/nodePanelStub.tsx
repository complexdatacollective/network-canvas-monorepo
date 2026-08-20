import { HiddenFieldValue } from '~/components/sections/Form/withFieldsHandlers';
import { useStageInitialValue } from '~/components/StageEditor/stageFormHooks';

import { usePanelSlot } from '../usePanelSlot';

/**
 * A stand-in for `NodePanel` that registers the same stage-form leaves the
 * real one does (its own controls pull in NetworkFilter's whole rule-builder
 * tree, which the tests using this have no use for). Registering them is the
 * point: what reaches the saved stage — and every undo/redo snapshot — is
 * `getFormValues()`, which reports REGISTERED fields only, so a stub that
 * registers nothing could not show the defects these tests cover.
 */
const NodePanelStub = ({
  item,
  index,
  committedIndex,
  onDelete,
  onMove,
}: {
  item: { id?: string };
  index: number;
  committedIndex?: number;
  onDelete: () => void;
  onMove?: (targetIndex: number) => void | boolean;
}) => {
  // The real row's slot binding, from the same hook, so these tests exercise
  // the ownership rule rather than a copy of it.
  const { fieldName: name, ownsSlot } = usePanelSlot(
    item.id,
    committedIndex,
    index,
  );
  const initialTitle = useStageInitialValue<string>(`${name}.title`);
  const initialDataSource = useStageInitialValue<string>(`${name}.dataSource`);

  if (!ownsSlot) return null;

  return (
    <div data-testid="node-panel">
      <HiddenFieldValue
        name={`${name}.title`}
        initialValue={initialTitle ?? ''}
      />
      <HiddenFieldValue
        name={`${name}.dataSource`}
        initialValue={initialDataSource ?? 'existing'}
      />
      {/*
        Registered so the panel assembles from its leaves like the real row
        does; the filter's CONTENT is irrelevant here (no assertion reads it),
        and a filter object is not a `FieldValue` anyway — the real row
        registers it through `NetworkFilter`.
      */}
      <HiddenFieldValue name={`${name}.filter`} />
      <button type="button" onClick={onDelete}>
        Remove side panel {index + 1}
      </button>
      {/*
        The real row reorders by pointer drag, which jsdom cannot deliver. This
        drives the same `onMove` the drag handle does, so a test can exercise
        the gesture that rewrites EVERY slot from the assembled list — the one
        that turns any gap between `usePanelAt` and `writePanelAt` into
        mis-slotted or dropped panel data.
      */}
      {onMove && index > 0 ? (
        <button type="button" onClick={() => onMove(index - 1)}>
          Move side panel {index + 1} up
        </button>
      ) : null}
    </div>
  );
};

export default NodePanelStub;
