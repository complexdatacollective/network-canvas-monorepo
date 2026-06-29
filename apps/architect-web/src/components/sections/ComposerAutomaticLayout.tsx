import { Field, FormSection } from 'redux-form';

import { Row, Section } from '~/components/EditorLayout';
import { Toggle } from '~/components/Form/Fields';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';

import IssueAnchor from '../IssueAnchor';

const ComposerAutomaticLayout = (_props: StageEditorSectionProps) => (
  <Section
    title="Automatic Layout"
    summary={
      <p>
        Choose whether automatic (force-directed) layout is switched on when a
        participant first opens this stage. Unlike the Sociogram this is only a
        default: participants can turn automatic layout on and off themselves
        during the interview, and their choice is remembered for the stage.
      </p>
    }
  >
    <FormSection name="behaviours">
      <Row>
        <IssueAnchor
          fieldName="behaviours.automaticLayout"
          description="Default automatic layout"
        />
        <Field
          name="automaticLayout"
          label="Start with automatic layout switched on"
          component={Toggle}
        />
      </Row>
    </FormSection>
  </Section>
);

export default ComposerAutomaticLayout;
