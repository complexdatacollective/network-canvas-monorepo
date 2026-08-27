import FrescoBooleanField from '@codaco/fresco-ui/form/fields/Boolean';
import Section from '@codaco/fresco-ui/Section';
import ArchitectField from '~/components/Form/ArchitectField';
import { useStageInitialValue } from '~/components/StageEditor/stageFormHooks';

const RemoveAfterConsideration = () => {
  const initialValue = useStageInitialValue<boolean>(
    'behaviours.removeAfterConsideration',
  );
  return (
    <Section
      title="Node availability"
      description="Choose whether a focal node remains available after it has been considered."
    >
      <ArchitectField
        name="behaviours.removeAfterConsideration"
        component={FrescoBooleanField}
        initialValue={initialValue}
        label="Removal behavior"
        options={[
          {
            value: true,
            label: 'Yes, remove after consideration',
          },
          {
            value: false,
            label: 'No, keep in bin after consideration',
          },
        ]}
        noReset
      />
    </Section>
  );
};
export default RemoveAfterConsideration;
