import { Field, FormSection } from 'redux-form';

import Heading from '@codaco/fresco-ui/typography/Heading';
import { Row, Section } from '~/components/EditorLayout';
import { Toggle } from '~/components/Form/Fields';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';

import IssueAnchor from '../IssueAnchor';
const NarrativeBehaviours = (_props: StageEditorSectionProps) => (
  <Section title="Narrative Behaviours">
    <FormSection name="behaviours">
      <Row>
        <IssueAnchor
          fieldName="automaticLayout"
          description="Automatic layout"
        />
        <Heading level="h4">Automatic layout</Heading>
        <Field
          name="automaticLayout"
          label="Position nodes automatically using a force-directed layout"
          component={Toggle}
        />
      </Row>
      <Row>
        <IssueAnchor fieldName="freeDraw" description="Free draw" />
        <Heading level="h4">Free-draw</Heading>
        <Field
          name="freeDraw"
          label="Allow drawing on the canvas"
          component={Toggle}
        />
      </Row>
      <Row>
        <IssueAnchor
          fieldName="allowRepositioning"
          description="Allow repositioning"
        />
        <Heading level="h4">Allow repositioning</Heading>
        <Field
          name="allowRepositioning"
          label="Allow nodes to be repositioned"
          component={Toggle}
        />
      </Row>
    </FormSection>
  </Section>
);
export default NarrativeBehaviours;
