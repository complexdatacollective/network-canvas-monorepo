import React from 'react';
import { Field as RichText } from '@codaco/ui/lib/components/Fields/RichText';
import TextField from '@codaco/ui/lib/components/Fields/Text';
import { Section, Row } from '@components/EditorLayout';
import PropTypes from 'prop-types';
import { ValidatedField } from '../Form';
import IssueAnchor from '../IssueAnchor';

const Name = ({ interfaceType }) => {
  const summaryText = interfaceType === 'Geospatial'
    ? 'This panel is shown prior to the interface, and should serve as an introduction to the task.'
    : 'This panel is shown prior to completion of the forms, and should serve as an introduction to the task.';

  return (
    <Section title="Introduction Panel" summary={<p>{summaryText}</p>}>
      <Row>
        <IssueAnchor
          fieldName="introductionPanel.title"
          description="Title (Introduction panel)"
        />
        <ValidatedField
          name="introductionPanel.title"
          label="Title"
          component={TextField}
          maxLength="50"
          validation={{ required: true }}
        />
      </Row>
      <Row>
        <IssueAnchor
          fieldName="introductionPanel.text"
          description="Text (Introduction panel)"
        />
        <ValidatedField
          name="introductionPanel.text"
          label="Introduction text"
          component={RichText}
          validation={{ required: true }}
        />
      </Row>
    </Section>
  );
};

Name.propTypes = {
  interfaceType: PropTypes.string.isRequired,
};

export default Name;
