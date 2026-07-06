import { startCase } from 'es-toolkit/compat';
import { useSelector } from 'react-redux';

import { INHERITANCE_PATTERNS } from '@codaco/shared-consts';
import { Row, Section } from '~/components/EditorLayout';
import ColorPicker from '~/components/Form/Fields/ColorPicker';
import Select from '~/components/Form/Fields/Select';
import Text from '~/components/Form/Fields/Text';
import VariablePicker from '~/components/Form/Fields/VariablePicker/VariablePicker';
import ValidatedField from '~/components/Form/ValidatedField';
import IssueAnchor from '~/components/IssueAnchor';
import type { RootState } from '~/ducks/store';
import { getVariableOptionsForSubject } from '~/selectors/codebook';

const INHERITANCE_PATTERN_OPTIONS = INHERITANCE_PATTERNS.map((value) => ({
  value,
  label: startCase(value),
}));

type DiseaseFieldsProps = {
  nodeType: string | undefined;
};

const DiseaseFields = ({ nodeType }: DiseaseFieldsProps) => {
  const booleanNodeVariables = useSelector((state: RootState) => {
    if (!nodeType) return [];
    return getVariableOptionsForSubject(state, {
      entity: 'node',
      type: nodeType,
    }).filter((v) => v.type === 'boolean');
  });

  return (
    <>
      <Section title="Disease Label" layout="vertical">
        <Row>
          <IssueAnchor fieldName="label" description="Disease label" />
          <ValidatedField
            name="label"
            component={Text}
            validation={{ required: true }}
            componentProps={{
              label: 'Disease label',
              placeholder: 'Enter a name for this disease...',
            }}
          />
        </Row>
      </Section>
      <Section title="Color" layout="vertical">
        <Row>
          <IssueAnchor fieldName="color" description="Disease color" />
          <ValidatedField
            name="color"
            component={ColorPicker as React.ComponentType}
            validation={{ required: true }}
            componentProps={{
              palette: 'node-color-seq',
              paletteRange: 10,
              label: 'Select a color for this disease',
            }}
          />
        </Row>
      </Section>
      <Section title="Node Variable" layout="vertical">
        <Row>
          <IssueAnchor fieldName="variable" description="Disease variable" />
          <ValidatedField
            name="variable"
            component={VariablePicker}
            validation={{ required: true }}
            componentProps={{
              entity: 'node',
              type: nodeType ?? '',
              label: 'Select boolean node variable',
              options: booleanNodeVariables,
            }}
          />
        </Row>
      </Section>
      <Section title="Inheritance Pattern" layout="vertical">
        <Row>
          <IssueAnchor
            fieldName="inheritancePattern"
            description="Inheritance pattern"
          />
          <ValidatedField
            name="inheritancePattern"
            component={Select}
            validation={{ required: true }}
            componentProps={{
              label: 'Inheritance pattern',
              options: INHERITANCE_PATTERN_OPTIONS,
              placeholder: 'Select an inheritance pattern...',
            }}
          />
        </Row>
      </Section>
    </>
  );
};

export default DiseaseFields;
