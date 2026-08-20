import FrescoBooleanField from '@codaco/fresco-ui/form/fields/Boolean';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
import ArchitectField from '~/components/Form/ArchitectField';
import { useStageInitialValue } from '~/components/StageEditor/stageFormHooks';

const RemoveAfterConsideration = () => {
  const initialValue = useStageInitialValue<boolean>(
    'behaviours.removeAfterConsideration',
  );
  return (
    <Section title="Remove After Consideration">
      <>
        <ArchitectField
          name="behaviours.removeAfterConsideration"
          component={FrescoBooleanField}
          initialValue={initialValue}
          label="Remove after consideration"
          hint={
            <Paragraph>
              This toggle determines if a node should continue to be shown in
              the bin after it has been the main focal node. If it is set to
              true, the node will be removed from the pool after it has been
              shown in the primary position for consideration.
            </Paragraph>
          }
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
      </>
    </Section>
  );
};
export default RemoveAfterConsideration;
