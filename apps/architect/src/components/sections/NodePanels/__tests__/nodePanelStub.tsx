import { HiddenFieldValue } from '~/components/sections/Form/withFieldsHandlers';
import { useStageInitialValue } from '~/components/StageEditor/stageFormHooks';

/**
 * A stand-in for `NodePanel` that registers the same stage-form leaves the
 * real one does (its own controls pull in NetworkFilter's whole rule-builder
 * tree, which the tests using this have no use for). Registering them is the
 * point: what reaches the saved stage — and every undo/redo snapshot — is
 * `getFormValues()`, which reports REGISTERED fields only, so a stub that
 * registers nothing could not show the defects these tests cover.
 */
const NodePanelStub = ({
  index,
  committedIndex,
  onDelete,
}: {
  index: number;
  committedIndex?: number;
  onDelete: () => void;
}) => {
  const name = `panels[${committedIndex ?? index}]`;
  const initialTitle = useStageInitialValue<string>(`${name}.title`);
  const initialDataSource = useStageInitialValue<string>(`${name}.dataSource`);

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
    </div>
  );
};

export default NodePanelStub;
