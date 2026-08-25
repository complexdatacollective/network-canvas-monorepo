import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import Section from '@codaco/fresco-ui/Section';
import ArchitectField from '~/components/Form/ArchitectField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useStageInitialValue } from '~/components/StageEditor/stageFormHooks';

const NarrativeBehaviours = (_props: StageEditorSectionProps) => {
  const initialAutomaticLayout = useStageInitialValue<boolean>(
    'behaviours.automaticLayout',
  );
  const initialFreeDraw = useStageInitialValue<boolean>('behaviours.freeDraw');
  const initialAllowRepositioning = useStageInitialValue<boolean>(
    'behaviours.allowRepositioning',
  );
  return (
    <Section
      title="Narrative behaviors"
      description="Control automatic layout, drawing, and node repositioning on the narrative canvas."
    >
      <ArchitectField
        name="behaviours.automaticLayout"
        label="Automatic layout"
        hint="Position nodes automatically using a force-directed layout"
        component={ToggleField}
        inline
        initialValue={initialAutomaticLayout ?? false}
      />
      <ArchitectField
        name="behaviours.freeDraw"
        label="Free-draw"
        hint="Allow drawing on the canvas"
        component={ToggleField}
        inline
        initialValue={initialFreeDraw ?? false}
      />
      <ArchitectField
        name="behaviours.allowRepositioning"
        label="Allow repositioning"
        hint="Allow nodes to be repositioned"
        component={ToggleField}
        inline
        initialValue={initialAllowRepositioning ?? false}
      />
    </Section>
  );
};
export default NarrativeBehaviours;
