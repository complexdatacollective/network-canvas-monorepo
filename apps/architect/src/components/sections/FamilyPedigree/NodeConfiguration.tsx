import type { UnknownAction } from '@reduxjs/toolkit';
import { difference, keys } from 'es-toolkit/compat';
import { useCallback } from 'react';
import { compose, withHandlers } from 'react-recompose';
import { connect, type ConnectedProps, useSelector } from 'react-redux';
import {
  change,
  type FormAction,
  formValueSelector,
  getFormValues,
  SubmissionError,
} from 'redux-form';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { VariableOptions } from '@codaco/protocol-validation';
import { BIOLOGICAL_SEX_OPTIONS } from '@codaco/shared-consts';
import { Row, Section } from '~/components/EditorLayout';
import DialogArrayField from '~/components/Form/DialogArrayField';
import VariablePicker from '~/components/Form/Fields/VariablePicker/VariablePicker';
import ValidatedField from '~/components/Form/ValidatedField';
import ValidatedFieldArray from '~/components/Form/ValidatedFieldArray';
import IssueAnchor from '~/components/IssueAnchor';
import type { Entity } from '~/components/NewVariableWindow';
import NewVariableWindow, {
  useNewVariableWindowState,
} from '~/components/NewVariableWindow';
import EntitySelectField from '~/components/sections/fields/EntitySelectField/EntitySelectField';
import FieldFields from '~/components/sections/Form/FieldFields';
import {
  CODEBOOK_PROPERTIES,
  getCodebookProperties,
  itemSelector,
  normalizeField,
} from '~/components/sections/Form/helpers';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { getTypeForComponent } from '~/config/variables';
import { useAppDispatch } from '~/ducks/hooks';
import {
  createVariableAsync,
  updateVariableAsync,
} from '~/ducks/modules/protocol/codebook';
import { getFamilyPedigreeNodeTypeChangeBlock } from '~/ducks/modules/protocol/stages';
import type { RootState } from '~/ducks/store';
import {
  getVariableOptionsForSubject,
  makeGetVariable,
} from '~/selectors/codebook';
import { getProtocol } from '~/selectors/protocol';
import { ensureError } from '~/utils/ensureError';
import { optionsMatch } from '~/utils/variables';

import NodeFormFieldPreview from './NodeFormFieldPreview';
const nodeEntity: Entity = 'node';
// Stage-level configuration that does not reference node variables survives a
// node-type change; framing/boundaries/introScreen are required (or
// self-contained) schema fields, so clearing them would make the stage fail
// schema validation on save. Exported for the seam test that checks it against
// the schema's required fields.
export const PRESERVE_ON_NODE_TYPE_CHANGE = [
  'id',
  'type',
  'label',
  'interviewScript',
  'skipLogic',
  'edgeConfig',
  'censusPrompt',
  'framing',
  'boundaries',
  'introScreen',
  'nodeConfig.type',
];
type VariableWindowInitialProps = {
  entity: Entity;
  type: string;
  initialValues: {
    name: string;
    type: string;
  };
  lockedOptions: VariableOptions | null;
};
type VariableRowProps = {
  name: string;
  label: string;
  description: string;
  entityType: string;
  options: {
    value: string;
    label: string;
    type?: string;
  }[];
  onCreateOption: (name: string) => void;
};
const VariableRow = ({
  name,
  label,
  description,
  entityType,
  options,
  onCreateOption,
}: VariableRowProps) => (
  <div className="flex items-start gap-5">
    <div className="flex flex-1 basis-0 flex-col gap-1 pt-2.5">
      <span className="font-semibold">
        {label}
        <span className="text-destructive ms-1">*</span>
      </span>
      <span className="text-text/60 text-sm leading-snug">{description}</span>
    </div>
    <div className="relative flex-1 basis-0">
      <IssueAnchor fieldName={name} description={`${label} Variable`} />
      <ValidatedField
        name={name}
        component={VariablePicker}
        validation={{ required: true }}
        componentProps={{
          entity: 'node',
          type: entityType,
          label: 'Select variable',
          options,
          onCreateOption,
        }}
      />
    </div>
  </div>
);
type NodeConfigurationInnerProps = StageEditorSectionProps & {
  handleChangeFields: (
    fields: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
};
const NodeConfigurationInner = ({
  form,
  handleChangeFields,
}: NodeConfigurationInnerProps) => {
  const dispatch = useAppDispatch();
  const formSelector = formValueSelector(form);
  const nodeType = useSelector(
    (state: RootState) =>
      formSelector(state, 'nodeConfig.type') as string | undefined,
  );
  const formValues = useSelector((state: RootState) =>
    getFormValues(form)(state),
  );
  const stageId = useSelector(
    (state: RootState) => formSelector(state, 'id') as string | undefined,
  );
  const stages = useSelector(
    (state: RootState) => getProtocol(state)?.stages ?? [],
  );
  const dependentNarrativeStages = stageId
    ? getFamilyPedigreeNodeTypeChangeBlock(stages, stageId)
    : [];
  const nodeTypeChangeBlockReason =
    dependentNarrativeStages.length > 0
      ? `This Family Pedigree stage's network is used by the following Narrative Pedigree stage(s): ${dependentNarrativeStages
          .map((dependent) => `"${dependent.label || 'Untitled'}"`)
          .join(
            ', ',
          )}. Change or remove those stage(s) before changing its node type.`
      : null;
  const formFields = keys(formValues);
  const handleResetStage = useCallback(() => {
    const fieldsToReset = difference(formFields, PRESERVE_ON_NODE_TYPE_CHANGE);
    for (const field of fieldsToReset) {
      dispatch(change(form, field, null) as UnknownAction);
    }
  }, [dispatch, formFields, form]);
  const nodeVariableOptions = useSelector((state: RootState) =>
    nodeType
      ? getVariableOptionsForSubject(state, { entity: 'node', type: nodeType })
      : [],
  );
  const textNodeVariables = nodeVariableOptions.filter(
    (v) => v.type === 'text',
  );
  const booleanNodeVariables = nodeVariableOptions.filter(
    (v) => v.type === 'boolean',
  );
  // Only categorical variables whose options are exactly the canonical
  // biological-sex set may be bound: the interview and genetics engine depend on
  // the exact values (female/male/…), so an existing categorical variable with a
  // different value set would silently degrade sex resolution. Mirrors the
  // relationship-type picker in EdgeConfiguration.
  const biologicalSexCompatible = nodeVariableOptions.filter(
    (v) =>
      v.type === 'categorical' &&
      optionsMatch(v.options, BIOLOGICAL_SEX_OPTIONS),
  );
  const handleCreatedVariable = (...args: unknown[]) => {
    const [id, params] = args as [
      string,
      {
        field: string;
      },
    ];
    dispatch(change(form, params.field, id));
  };
  const initialWindowProps: VariableWindowInitialProps = {
    entity: nodeEntity,
    type: nodeType ?? '',
    initialValues: { name: '', type: '' },
    lockedOptions: null,
  };
  const [variableWindowProps, openVariableWindow] = useNewVariableWindowState(
    initialWindowProps,
    handleCreatedVariable,
  );
  const handleNewNodeLabelVariable = (name: string) =>
    openVariableWindow(
      { initialValues: { name, type: 'text' }, lockedOptions: null },
      { field: 'nodeConfig.nodeLabelVariable' },
    );
  const handleNewEgoVariable = (name: string) =>
    openVariableWindow(
      { initialValues: { name, type: 'boolean' }, lockedOptions: null },
      { field: 'nodeConfig.egoVariable' },
    );
  const handleNewRelationshipVariable = (name: string) =>
    openVariableWindow(
      { initialValues: { name, type: 'text' }, lockedOptions: null },
      { field: 'nodeConfig.relationshipVariable' },
    );
  const handleNewBiologicalSexVariable = (name: string) =>
    openVariableWindow(
      {
        initialValues: { name, type: 'categorical' },
        // Seed and lock the canonical value set — the interview and genetics
        // engine depend on these exact values, so the researcher may not edit
        // them (mirrors the relationship-type variable).
        lockedOptions: BIOLOGICAL_SEX_OPTIONS,
      },
      { field: 'nodeConfig.biologicalSexVariable' },
    );
  return (
    <>
      <Section
        title="Node Configuration"
        summary={
          <Paragraph>
            Select the node type and configure variables and form fields for
            family members.
          </Paragraph>
        }
      >
        <Row>
          <IssueAnchor fieldName="nodeConfig.type" description="Node Type" />
          <ValidatedField
            name="nodeConfig.type"
            entityType="node"
            promptBeforeChange="You attempted to change the node type of a stage that you have already configured. Before you can proceed the stage must be reset, which will remove any existing configuration. Do you want to reset the stage now?"
            blockChangeReason={nodeTypeChangeBlockReason}
            component={EntitySelectField}
            onChange={handleResetStage}
            validation={{ required: true }}
          />
        </Row>

        {nodeType && (
          <>
            {/* `[&_.variable-pill]:bg-white` lifts the pills off the surface-2 panel */}
            <div className="bg-surface-2 text-surface-2-contrast my-7 flex flex-col gap-7 rounded p-5 [&_.variable-pill]:bg-white">
              <VariableRow
                name="nodeConfig.nodeLabelVariable"
                label="Node Label"
                description="A text variable used to store the display label for each node in the pedigree."
                entityType={nodeType}
                options={textNodeVariables}
                onCreateOption={handleNewNodeLabelVariable}
              />
              <VariableRow
                name="nodeConfig.egoVariable"
                label="Ego Identifier"
                description="A boolean variable to identify which node represents the participant (ego) in the family pedigree."
                entityType={nodeType}
                options={booleanNodeVariables}
                onCreateOption={handleNewEgoVariable}
              />
              <VariableRow
                name="nodeConfig.relationshipVariable"
                label="Relationship to Participant"
                description="Stores each person's relationship to the participant (e.g., mother, uncle, daughter). Automatically calculated by the family pedigree interface."
                entityType={nodeType}
                options={textNodeVariables}
                onCreateOption={handleNewRelationshipVariable}
              />
              <VariableRow
                name="nodeConfig.biologicalSexVariable"
                label="Biological Sex Variable"
                description="Stores each family member’s sex recorded at birth (female/male/intersex/don’t know/prefer not to say), used for sex-linked inheritance."
                entityType={nodeType}
                options={biologicalSexCompatible}
                onCreateOption={handleNewBiologicalSexVariable}
              />
            </div>

            <Section
              title="Form Fields"
              summary={
                <Paragraph>
                  Add fields to collect information about each family member.
                  These fields will be shown when participants add or edit
                  family members.
                </Paragraph>
              }
              layout="vertical"
              className="bg-surface-2 text-surface-2-contrast p-5"
            >
              <ValidatedFieldArray
                name="nodeConfig.form"
                label="Form fields"
                labelHidden
                component={DialogArrayField}
                validation={{}}
                componentProps={{
                  addTitle: 'Edit Field',
                  editorFieldsComponent: FieldFields,
                  editorProps: { type: nodeType, entity: 'node' },
                  previewComponent: NodeFormFieldPreview,
                  editorTitle: 'Edit Field',
                  itemLabel: 'field',
                  sortable: true,
                  onBeforeSave: (value: unknown) =>
                    handleChangeFields(value as Record<string, unknown>),
                  normalizeItem: (value: unknown) =>
                    normalizeField(value as Record<string, unknown>),
                  itemSelector: itemSelector('node', nodeType),
                  requestedEditFormName: 'editable-list-form',
                }}
              />
            </Section>
          </>
        )}
      </Section>
      <NewVariableWindow {...variableWindowProps} />
    </>
  );
};
const mapStateToProps = (
  state: RootState,
  {
    form,
  }: {
    form: string;
  },
) => ({
  getVariable: (uuid: string) => makeGetVariable(uuid)(state),
  getNodeType: () =>
    formValueSelector(form)(state, 'nodeConfig.type') as string | undefined,
});
const mapDispatchToProps = {
  changeForm: change as (
    form: string,
    field: string,
    value: unknown,
  ) => FormAction,
  updateVariable: updateVariableAsync,
  createVariable: createVariableAsync,
};
const connector = connect(mapStateToProps, mapDispatchToProps);
// ConnectedProps resolves the object-form thunk creators to their dispatched
// form — functions returning the thunk promise (with `.unwrap()`) — matching
// react-redux's runtime binding.
type FormHandlerProps = ConnectedProps<typeof connector> & {
  form: string;
};
const formHandlers = withHandlers({
  handleChangeFields:
    (props: FormHandlerProps) => async (values: Record<string, unknown>) => {
      const { variable, component, _createNewVariable, ...rest } = values as {
        variable?: string;
        component?: string;
        _createNewVariable?: string;
        [key: string]: unknown;
      };
      const nodeType = props.getNodeType();
      const variableType = getTypeForComponent(component);
      const codebookProperties = getCodebookProperties(rest);
      const configuration = {
        type: variableType,
        component,
        ...codebookProperties,
      };
      props.changeForm(props.form, '_modified', Date.now());
      if (!_createNewVariable) {
        const current = props.getVariable(variable ?? '');
        if (!current) {
          throw new SubmissionError({ _error: 'Variable not found' });
        }
        await props.updateVariable({
          entity: 'node',
          type: nodeType ?? '',
          variable: variable ?? '',
          configuration: configuration as Record<string, unknown>,
          replaceProperties: CODEBOOK_PROPERTIES,
        });
        return { variable, ...rest };
      }
      try {
        // unwrap() re-throws the thunk's error instead of resolving to a
        // rejected action whose payload is undefined (which would make
        // payload.payload.variable a TypeError).
        const { variable: createdVariable } = await props
          .createVariable({
            entity: 'node',
            type: nodeType ?? '',
            configuration: {
              ...configuration,
              name: _createNewVariable,
            } as Record<string, unknown>,
          })
          .unwrap();
        return { variable: createdVariable, ...rest };
      } catch (e) {
        throw new SubmissionError({ variable: ensureError(e).message });
      }
    },
});
const NodeConfiguration = compose<
  NodeConfigurationInnerProps,
  StageEditorSectionProps
>(
  connector,
  formHandlers,
)(NodeConfigurationInner);
export default NodeConfiguration;
