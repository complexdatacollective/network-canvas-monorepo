import FrescoBooleanField from '@codaco/fresco-ui/form/fields/Boolean';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Row, Section } from '~/components/EditorLayout';
import ArchitectField from '~/components/Form/ArchitectField';
import { useStageInitialValue } from '~/components/StageEditor/stageFormHooks';

const FIELD_PATH = 'behaviours.automaticLayout';

const AutomaticLayout = () => {
  // Redux Form omitted an untouched field's value entirely; the interface
  // template seeds `true` for the interfaces that offer this choice, so an
  // absent committed value only happens for a protocol saved before this
  // field existed — fall back to Manual mode rather than silently opting in.
  const initialValue = useStageInitialValue<boolean>(FIELD_PATH) ?? false;
  return (
    <Section
      title="Layout Mode"
      summary={
        <Paragraph>
          Interviewer offers two modes for positioning nodes on the sociogram:
          &quot;Manual&quot;, and &quot;Automatic&quot;.
        </Paragraph>
      }
    >
      <Row>
        <Paragraph>
          <strong>Automatic mode</strong> positions nodes when the stage is
          first shown by simulating physical forces such as attraction and
          repulsion. This simulation can be paused and resumed within the
          interview. When paused, the position of nodes can be adjusted
          manually.
        </Paragraph>
        <Paragraph>
          <strong>Manual mode</strong> first places all nodes into a
          &quot;bucket&quot; at the bottom of the screen, from which the
          participant can drag nodes to their desired position.
        </Paragraph>
      </Row>
      <Row>
        <ArchitectField
          name={FIELD_PATH}
          label="Layout mode"
          labelHidden
          component={FrescoBooleanField}
          initialValue={initialValue}
          options={[
            {
              value: false,
              label:
                '**Manual mode**\n\nParticipants must position their alters manually.',
            },
            {
              value: true,
              label:
                '**Automatic mode**\n\nA force-directed layout positions nodes automatically.',
            },
          ]}
          noReset
        />
      </Row>
    </Section>
  );
};
export default AutomaticLayout;
