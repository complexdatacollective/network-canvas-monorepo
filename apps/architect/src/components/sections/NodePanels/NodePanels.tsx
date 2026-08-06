import { useCallback } from 'react';
import { v4 as uuid } from 'uuid';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import ArrayField from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useSetStageValue,
  useStageFormValue,
  useSubject,
} from '~/components/StageEditor/stageFormHooks';

import NodePanel, { type NodePanelValue } from './NodePanel';

// Every other array in the stage form is one opaque field value, but
// NetworkFilter (used by each row below) reads and writes the STAGE form
// directly. So each panel's fields stay individually registered on the
// stage — `panels[N].title`/`.dataSource`/`.filter` — and this component only
// drives the add/remove/reorder UI over them: `ArrayField` renders bounded by
// `MAX_PANELS`, uncontrolled by a
// literal `panels` field (registering one would race the individual leaves —
// see MAX_PANELS below), and `handlePanelsChange` writes the recomputed list
// back across the same bounded set of field paths.
const MAX_PANELS = 2;

// `ArrayField` decides whether to re-sync its internal item list from `value`
// by REFERENCE (`useArrayFieldItems.ts`'s `value !== prevValueRef.current`),
// not by deep equality. An inline `panels ?? []` fallback would allocate a
// fresh array every render, so it would look like new external data on every
// render and wipe out `addItem`'s optimistic local state before the just-
// registered fields' dormant values ever caught up. A stable module-level
// empty array keeps the "no panels" case a no-op for that comparison.
const EMPTY_PANELS: NodePanelValue[] = [];

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

export const NodePanels = (_props: StageEditorSectionProps) => {
  const { type } = useSubject();
  const disabled = !type;
  const { confirm } = useDialog();
  const setStageValue = useSetStageValue();
  const panels = useStageFormValue<NodePanelValue[] | null>('panels');

  const writePanelAt = useCallback(
    (index: number, panel: NodePanelValue | undefined) => {
      setStageValue(`panels[${index}].id`, panel?.id);
      setStageValue(`panels[${index}].title`, panel?.title ?? null);
      setStageValue(
        `panels[${index}].dataSource`,
        panel?.dataSource ?? 'existing',
      );
      setStageValue(`panels[${index}].filter`, panel?.filter ?? null);
    },
    [setStageValue],
  );

  const handlePanelsChange = useCallback(
    (nextPanels: NodePanelValue[] | undefined) => {
      const resolvedPanels = nextPanels ?? [];
      resolvedPanels.forEach((panel, index) => writePanelAt(index, panel));
      for (let index = resolvedPanels.length; index < MAX_PANELS; index += 1) {
        writePanelAt(index, undefined);
      }
    },
    [writePanelAt],
  );

  const handleToggleChange = useCallback(
    (newState: boolean) =>
      handlePanelToggleChange(newState, panels, confirm, () => {
        // The stage's `panels` key was never registered as its own field
        // (see the file-top note), so an explicit dormant write is the only
        // way to signal "cleared" — plain unmount would just fall back to
        // the last committed value (stageFormHooks.ts's useStageFormValue
        // resolution order). Also clear every panel's own leaves: they are
        // real per-index fields (`panels[N].id/.title/.dataSource/.filter`),
        // and `registerField` prefers a dormant value over `initialValue`, so
        // leaving their dormant slots untouched would let a remount
        // resurrect the pre-toggle-off data even though `panels` itself
        // reads as cleared.
        for (let index = 0; index < MAX_PANELS; index += 1) {
          writePanelAt(index, undefined);
        }
        setStageValue('panels', undefined);
      }),
    [confirm, panels, setStageValue, writePanelAt],
  );

  return (
    <Section
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
      <UnconnectedField
        name="panels"
        label="Side panel configuration"
        labelHidden
        component={ArrayField<NodePanelValue>}
        value={panels ?? EMPTY_PANELS}
        onChange={handlePanelsChange}
        itemComponent={NodePanel}
        itemTemplate={createNodePanel}
        getId={(panel: NodePanelValue) => panel.id}
        itemClasses="bg-accent text-accent-contrast elevation-low"
        addButtonLabel="Add new panel"
        emptyStateMessage="No side panels configured."
        immediateAdd
        sortable
        maxItems={MAX_PANELS}
        confirmDelete={false}
        disabled={disabled}
      />
    </Section>
  );
};
