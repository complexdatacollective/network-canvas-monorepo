import { startCase } from 'es-toolkit/compat';

import InputField from '@codaco/fresco-ui/form/fields/InputField';
import StyledSelectField from '@codaco/fresco-ui/form/fields/Select/Styled';
import { INHERITANCE_PATTERNS } from '@codaco/shared-consts';
import { Row, Section } from '~/components/EditorLayout';
import ArchitectField from '~/components/Form/ArchitectField';
import ColorPicker from '~/components/Form/Fields/ColorPicker';
import VariablePickerControl from '~/components/Form/Fields/VariablePicker/VariablePicker';
import IssueAnchor from '~/components/IssueAnchor';
import { useAppSelector } from '~/ducks/hooks';
import { getVariableOptionsForSubject } from '~/selectors/codebook';

const INHERITANCE_PATTERN_OPTIONS = INHERITANCE_PATTERNS.map((value) => ({
  value,
  label: startCase(value),
}));

type DiseaseFieldsProps = {
  nodeType: string | undefined;
  /**
   * The row being edited, supplied by DialogArrayField's `item` spread. This
   * dialog mounts its own `FormStoreProvider` (a different store per row), so
   * it cannot resolve its own initial values from stage context — every
   * control seeds its `initialValue` from here instead.
   */
  item?: Record<string, unknown>;
};

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const DiseaseFields = ({ nodeType, item }: DiseaseFieldsProps) => {
  const booleanNodeVariables = useAppSelector((state) => {
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
          <ArchitectField
            name="label"
            label="Disease label"
            labelHidden
            component={InputField}
            validation={{ required: true }}
            initialValue={asString(item?.label)}
            placeholder="Enter a name for this disease..."
          />
        </Row>
      </Section>
      <Section title="Color" layout="vertical">
        <Row>
          <IssueAnchor fieldName="color" description="Disease color" />
          <ArchitectField
            name="color"
            component={ColorPicker}
            validation={{ required: true }}
            label="Select a color for this disease"
            initialValue={asString(item?.color)}
            palette="node-color-seq"
            paletteRange={10}
          />
        </Row>
      </Section>
      <Section title="Node Variable" layout="vertical">
        <Row>
          <IssueAnchor fieldName="variable" description="Disease variable" />
          <ArchitectField
            name="variable"
            component={VariablePickerControl}
            validation={{ required: true }}
            label="Select boolean node variable"
            initialValue={asString(item?.variable)}
            entity="node"
            type={nodeType ?? ''}
            options={booleanNodeVariables}
          />
        </Row>
      </Section>
      <Section title="Inheritance Pattern" layout="vertical">
        <Row>
          <IssueAnchor
            fieldName="inheritancePattern"
            description="Inheritance pattern"
          />
          <ArchitectField
            name="inheritancePattern"
            label="Inheritance pattern"
            labelHidden
            component={StyledSelectField}
            validation={{ required: true }}
            initialValue={asString(item?.inheritancePattern)}
            options={INHERITANCE_PATTERN_OPTIONS}
            placeholder="Select an inheritance pattern..."
          />
        </Row>
      </Section>
    </>
  );
};

export default DiseaseFields;
