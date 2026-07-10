import type { ComponentType } from 'react';

import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';

import { FrescoReduxField, ValidatedField } from '../Form';
import IssueAnchor from '../IssueAnchor';

const FrescoInputField = InputField as ComponentType<Record<string, unknown>>;

const Title = (_props: StageEditorSectionProps) => (
  <Section
    title="Page Heading"
    summary={
      <Paragraph>
        Use the page heading to show a large title element on your information
        stage.
      </Paragraph>
    }
  >
    <IssueAnchor fieldName="title" description="Page Heading" />
    <ValidatedField
      label="Page heading"
      name="title"
      component={FrescoReduxField}
      placeholder="Enter your title here..."
      validation={{ required: true }}
      componentProps={{ fieldComponent: FrescoInputField }}
    />
  </Section>
);
export default Title;
