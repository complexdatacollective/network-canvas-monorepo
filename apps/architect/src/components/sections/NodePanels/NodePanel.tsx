import type { ComponentType } from 'react';

import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { FrescoReduxField } from '~/components/Form';
import DataSource from '~/components/Form/Fields/DataSource';
import ValidatedField from '~/components/Form/ValidatedField';
import NetworkFilter from '~/components/sections/fields/NetworkFilter';
import { getFieldId } from '~/utils/issues';

import Section from '../../EditorLayout/Section';

const FrescoInputField = InputField as ComponentType<Record<string, unknown>>;

type NodePanelProps = {
  fieldId: string;
  form: string;
};
const NodePanel = ({ fieldId, form }: NodePanelProps) => (
  <>
    <Section
      title="Panel Title"
      summary={
        <Paragraph>
          The panel title will be shown above the list of nodes within the
          panel.
        </Paragraph>
      }
      id={getFieldId(`${fieldId}.title`)}
      layout="vertical"
      className="bg-slate-blue-dark mt-10 text-white [--text-dark:white]"
    >
      <ValidatedField
        name={`${fieldId}.title`}
        label="Panel title"
        component={FrescoReduxField}
        validation={{ required: true }}
        componentProps={{
          fieldComponent: FrescoInputField,
          placeholder: 'Panel title',
        }}
      />
    </Section>
    <Section
      title="Data Source"
      summary={
        <Paragraph>
          Choose where the data for this panel should come from (either the
          in-progress interview session [&quot;People you have already
          named&quot;], or an external network data file that you have added).
        </Paragraph>
      }
      id={getFieldId(`${fieldId}.dataSource`)}
      layout="vertical"
      className="bg-slate-blue-dark mt-10 text-white [--text-dark:white]"
    >
      <ValidatedField
        component={
          DataSource as unknown as React.ComponentType<Record<string, unknown>>
        }
        name={`${fieldId}.dataSource`}
        validation={{ required: true }}
        componentProps={{
          canUseExisting: true,
        }}
      />
    </Section>
    <NetworkFilter form={form} variant="contrast" name={`${fieldId}.filter`} />
  </>
);
export default NodePanel;
