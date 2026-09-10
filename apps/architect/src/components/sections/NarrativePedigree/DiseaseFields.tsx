import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import StyledSelectField from '@codaco/fresco-ui/form/fields/Select/Styled';
import Section from '@codaco/fresco-ui/Section';
import { INHERITANCE_PATTERNS } from '@codaco/protocol-validation';
import ArchitectField from '~/components/Form/ArchitectField';
import ColorPicker from '~/components/Form/Fields/ColorPicker';
import { VariablePickerControl } from '~/components/Form/Fields/VariablePicker/VariablePicker';
import IssueAnchor from '~/components/IssueAnchor';
import { COLOR_PALETTES } from '~/config';
import { useAppSelector } from '~/ducks/hooks';
import { getVariableOptionsForSubject } from '~/selectors/codebook';
import { excludeInterfaceOwned } from '~/selectors/roleFilters';

import { isVariableUsedBySibling } from '../Form/composerHelpers';
const messages = defineMessages({
  diseaseDetails: {
    id: 'architect.sections.narrativePedigree.diseaseFields.diseaseDetails',
    defaultMessage: 'Disease details',
    description:
      'The title text in components / sections / NarrativePedigree / DiseaseFields.',
  },
  defineHowThisDiseaseAppearsMap: {
    id: 'architect.sections.narrativePedigree.diseaseFields.defineHowThisDiseaseAppearsMap',
    defaultMessage:
      "Define how this disease appears, map it to the source pedigree's affected-status attribute, and choose how its inheritance is interpreted.",
    description:
      'The description text in components / sections / NarrativePedigree / DiseaseFields.',
  },
  diseaseLabel: {
    id: 'architect.sections.narrativePedigree.diseaseFields.diseaseLabel',
    defaultMessage: 'Disease label',
    description:
      'The description text in components / sections / NarrativePedigree / DiseaseFields.',
  },
  enterANameForThisDisease: {
    id: 'architect.sections.narrativePedigree.diseaseFields.enterANameForThisDisease',
    defaultMessage: 'Enter a name for this disease...',
    description:
      'The placeholder text in components / sections / NarrativePedigree / DiseaseFields.',
  },
  diseaseColor: {
    id: 'architect.sections.narrativePedigree.diseaseFields.diseaseColor',
    defaultMessage: 'Disease color',
    description:
      'The description text in components / sections / NarrativePedigree / DiseaseFields.',
  },
  color: {
    id: 'architect.sections.narrativePedigree.diseaseFields.color',
    defaultMessage: 'Color',
    description:
      'The label text in components / sections / NarrativePedigree / DiseaseFields.',
  },
  selectAColorForThisDisease: {
    id: 'architect.sections.narrativePedigree.diseaseFields.selectAColorForThisDisease',
    defaultMessage: 'Select a color for this disease.',
    description:
      'The hint text in components / sections / NarrativePedigree / DiseaseFields.',
  },
  diseaseAttribute: {
    id: 'architect.sections.narrativePedigree.diseaseFields.diseaseAttribute',
    defaultMessage: 'Disease attribute',
    description:
      'The description text in components / sections / NarrativePedigree / DiseaseFields.',
  },
  nodeAttribute: {
    id: 'architect.sections.narrativePedigree.diseaseFields.nodeAttribute',
    defaultMessage: 'Node attribute',
    description:
      'The label text in components / sections / NarrativePedigree / DiseaseFields.',
  },
  selectABooleanNodeAttribute: {
    id: 'architect.sections.narrativePedigree.diseaseFields.selectABooleanNodeAttribute',
    defaultMessage: 'Select a boolean node attribute.',
    description:
      'The hint text in components / sections / NarrativePedigree / DiseaseFields.',
  },
  inheritancePattern: {
    id: 'architect.sections.narrativePedigree.diseaseFields.inheritancePattern',
    defaultMessage: 'Inheritance pattern',
    description:
      'The description text in components / sections / NarrativePedigree / DiseaseFields.',
  },
  chooseHowThisDiseaseIsInherited: {
    id: 'architect.sections.narrativePedigree.diseaseFields.chooseHowThisDiseaseIsInherited',
    defaultMessage:
      'Choose how this disease is inherited. Mendelian patterns are used with biological relationships and recorded sex to infer carrier and possible at-risk statuses. Multifactorial and Unknown show affected status only and do not infer carrier or at-risk statuses.',
    description:
      'The hint text in components / sections / NarrativePedigree / DiseaseFields.',
  },
  selectAnInheritancePattern: {
    id: 'architect.sections.narrativePedigree.diseaseFields.selectAnInheritancePattern',
    defaultMessage: 'Select an inheritance pattern...',
    description:
      'The placeholder text in components / sections / NarrativePedigree / DiseaseFields.',
  },
});

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

const DiseaseFields = ({
  nodeType,
  siblingDiseases,
  editIndex,
  item,
}: DiseaseFieldsProps) => {
  const intl = useAppIntl();
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
  // The same predicate `Diseases.tsx`'s save-time gate applies, so the picker
  // and the gate exclude exactly the same rows.
  const availableVariables = booleanNodeVariables.filter(
    (option) =>
      option.value === currentVariable ||
      !isVariableUsedBySibling(siblingDiseases, option.value, editIndex),
  );

  return (
    <Section
      title={intl.formatMessage(messages.diseaseDetails)}
      description={intl.formatMessage(messages.defineHowThisDiseaseAppearsMap)}
    >
      <IssueAnchor
        fieldName="label"
        description={intl.formatMessage(messages.diseaseLabel)}
      />
      <ArchitectField
        name="label"
        label={intl.formatMessage(messages.diseaseLabel)}
        component={InputField}
        validation={{ required: true }}
        initialValue={asString(item?.label)}
        placeholder={intl.formatMessage(messages.enterANameForThisDisease)}
      />
      <IssueAnchor
        fieldName="color"
        description={intl.formatMessage(messages.diseaseColor)}
      />
      <ArchitectField
        name="color"
        component={ColorPicker}
        validation={{ required: true }}
        label={intl.formatMessage(messages.color)}
        hint={intl.formatMessage(messages.selectAColorForThisDisease)}
        initialValue={asString(item?.color)}
        palette="node-color-seq"
        // The palette's real size, not a hard-coded 10: the theme defines
        // `--node-1` … `--node-8`, so the two extra swatches this used to
        // offer rendered as nothing and stored a colour that renders as
        // nothing wherever it is used. A protocol that already holds one
        // still gets it back — see ColorPicker.
        paletteRange={COLOR_PALETTES['node-color-seq']}
      />
      <IssueAnchor
        fieldName="variable"
        description={intl.formatMessage(messages.diseaseAttribute)}
      />
      <ArchitectField
        name="variable"
        component={VariablePickerControl}
        validation={{ required: true }}
        label={intl.formatMessage(messages.nodeAttribute)}
        hint={intl.formatMessage(messages.selectABooleanNodeAttribute)}
        initialValue={asString(item?.variable)}
        entity="node"
        type={nodeType ?? ''}
        options={availableVariables}
      />
      <IssueAnchor
        fieldName="inheritancePattern"
        description={intl.formatMessage(messages.inheritancePattern)}
      />
      <ArchitectField
        name="inheritancePattern"
        label={intl.formatMessage(messages.inheritancePattern)}
        hint={intl.formatMessage(messages.chooseHowThisDiseaseIsInherited)}
        component={StyledSelectField}
        validation={{ required: true }}
        initialValue={asString(item?.inheritancePattern)}
        options={INHERITANCE_PATTERNS.map((value) => ({
          value,
          label: intl.formatMessage(inheritanceMessages[value]),
        }))}
        placeholder={intl.formatMessage(messages.selectAnInheritancePattern)}
      />
    </Section>
  );
};

export default DiseaseFields;

const inheritanceMessages = defineMessages({
  autosomalDominant: {
    id: 'architect.inheritancePattern.autosomalDominant',
    defaultMessage: 'Autosomal Dominant',
    description: 'Researcher-facing Architect control or feedback.',
  },
  autosomalRecessive: {
    id: 'architect.inheritancePattern.autosomalRecessive',
    defaultMessage: 'Autosomal Recessive',
    description: 'Researcher-facing Architect control or feedback.',
  },
  xLinkedDominant: {
    id: 'architect.inheritancePattern.xLinkedDominant',
    defaultMessage: 'X Linked Dominant',
    description: 'Researcher-facing Architect control or feedback.',
  },
  xLinkedRecessive: {
    id: 'architect.inheritancePattern.xLinkedRecessive',
    defaultMessage: 'X Linked Recessive',
    description: 'Researcher-facing Architect control or feedback.',
  },
  yLinked: {
    id: 'architect.inheritancePattern.yLinked',
    defaultMessage: 'Y Linked',
    description: 'Researcher-facing Architect control or feedback.',
  },
  mitochondrial: {
    id: 'architect.inheritancePattern.mitochondrial',
    defaultMessage: 'Mitochondrial',
    description: 'Researcher-facing Architect control or feedback.',
  },
  multifactorial: {
    id: 'architect.inheritancePattern.multifactorial',
    defaultMessage: 'Multifactorial',
    description: 'Researcher-facing Architect control or feedback.',
  },
  unknown: {
    id: 'architect.inheritancePattern.unknown',
    defaultMessage: 'Unknown',
    description: 'Researcher-facing Architect control or feedback.',
  },
});
