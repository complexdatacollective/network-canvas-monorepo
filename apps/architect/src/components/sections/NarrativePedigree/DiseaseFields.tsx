import { startCase } from 'es-toolkit/compat';

import InputField from '@codaco/fresco-ui/form/fields/InputField';
import StyledSelectField from '@codaco/fresco-ui/form/fields/Select/Styled';
import { INHERITANCE_PATTERNS } from '@codaco/shared-consts';
import { Section } from '~/components/EditorLayout';
import ArchitectField from '~/components/Form/ArchitectField';
import ColorPicker from '~/components/Form/Fields/ColorPicker';
import { VariablePickerControl } from '~/components/Form/Fields/VariablePicker/VariablePicker';
import IssueAnchor from '~/components/IssueAnchor';
import { COLOR_PALETTES } from '~/config';
import { useAppSelector } from '~/ducks/hooks';
import { getVariableOptionsForSubject } from '~/selectors/codebook';
import { excludeInterfaceOwned } from '~/selectors/roleFilters';

const INHERITANCE_PATTERN_OPTIONS = INHERITANCE_PATTERNS.map((value) => ({
  value,
  label: startCase(value),
}));

type DiseaseFieldsProps = {
  nodeType: string | undefined;
  /**
   * The committed disease rows of the stage this editor edits a row of, and
   * that row's array index. One Narrative Pedigree may not map two diseases to
   * one variable, so a variable a sibling row already claims must not be
   * offered.
   */
  siblingDiseases?: unknown;
  editIndex?: number;
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether another disease row already maps this variable. */
export const isVariableUsedByAnotherDisease = (
  diseases: unknown,
  variable: string,
  excludeIndex?: number,
): boolean => {
  if (!Array.isArray(diseases) || variable === '') return false;
  return diseases.some(
    (row, index) =>
      index !== excludeIndex && isRecord(row) && row.variable === variable,
  );
};

const DiseaseFields = ({
  nodeType,
  siblingDiseases,
  editIndex,
  item,
}: DiseaseFieldsProps) => {
  const currentVariable = asString(item?.variable);
  const booleanNodeVariables = useAppSelector((state) => {
    if (!nodeType) return [];
    const booleans = getVariableOptionsForSubject(state, {
      entity: 'node',
      type: nodeType,
    }).filter((v) => v.type === 'boolean');
    // A disease maps an affected/not-affected answer someone else collects.
    // The pedigree's own structural variables are not answers — mapping the
    // ego marker as a disease paints the participant as affected on every
    // seed. The row's current value is always kept so an imported protocol's
    // pick never renders blank.
    return excludeInterfaceOwned(
      state,
      { entity: 'node', type: nodeType },
      booleans,
      currentVariable,
    );
  });
  const availableVariables = booleanNodeVariables.filter(
    (option) =>
      option.value === currentVariable ||
      !isVariableUsedByAnotherDisease(siblingDiseases, option.value, editIndex),
  );

  return (
    <>
      <Section title="Disease Label" layout="vertical">
        <>
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
        </>
      </Section>
      <Section title="Color" layout="vertical">
        <>
          <IssueAnchor fieldName="color" description="Disease color" />
          <ArchitectField
            name="color"
            component={ColorPicker}
            validation={{ required: true }}
            label="Select a color for this disease"
            initialValue={asString(item?.color)}
            palette="node-color-seq"
            // The palette's real size, not a hard-coded 10: the theme defines
            // `--node-1` … `--node-8`, so the two extra swatches this used to
            // offer rendered as nothing and stored a colour that renders as
            // nothing wherever it is used. A protocol that already holds one
            // still gets it back — see ColorPicker.
            paletteRange={COLOR_PALETTES['node-color-seq']}
          />
        </>
      </Section>
      <Section title="Node Attribute" layout="vertical">
        <>
          <IssueAnchor fieldName="variable" description="Disease attribute" />
          <ArchitectField
            name="variable"
            component={VariablePickerControl}
            validation={{ required: true }}
            label="Select boolean node attribute"
            initialValue={asString(item?.variable)}
            entity="node"
            type={nodeType ?? ''}
            options={availableVariables}
          />
        </>
      </Section>
      <Section title="Inheritance Pattern" layout="vertical">
        <>
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
        </>
      </Section>
    </>
  );
};

export default DiseaseFields;
