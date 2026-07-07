import type { UnknownAction } from '@reduxjs/toolkit';
import { useCallback } from 'react';
import { useSelector } from 'react-redux';
import { change, formValueSelector } from 'redux-form';

import type { VariableOptions } from '@codaco/protocol-validation';
import {
  GAMETE_ROLE_OPTIONS,
  RELATIONSHIP_TYPE_OPTIONS,
} from '@codaco/shared-consts';
import { Row, Section } from '~/components/EditorLayout';
import VariablePicker from '~/components/Form/Fields/VariablePicker/VariablePicker';
import ValidatedField from '~/components/Form/ValidatedField';
import IssueAnchor from '~/components/IssueAnchor';
import type { Entity } from '~/components/NewVariableWindow';
import NewVariableWindow, {
  useNewVariableWindowState,
} from '~/components/NewVariableWindow';
import EntitySelectField from '~/components/sections/fields/EntitySelectField/EntitySelectField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useAppDispatch } from '~/ducks/hooks';
import type { RootState } from '~/ducks/store';
import { getVariableOptionsForSubject } from '~/selectors/codebook';
import { optionsMatch } from '~/utils/variables';

const edgeEntity: Entity = 'edge';

// Variable pickers that reference the selected edge type's variables; they must
// be cleared when the edge type changes so a saved stage never points at
// variables belonging to the previous edge type.
const EDGE_DEPENDENT_VARIABLE_FIELDS = [
  'edgeConfig.relationshipTypeVariable',
  'edgeConfig.isActiveVariable',
  'edgeConfig.isGestationalCarrierVariable',
  'edgeConfig.gameteRoleVariable',
];

type VariableWindowInitialProps = {
  entity: Entity;
  type: string;
  initialValues: { name: string; type: string };
  lockedOptions: VariableOptions | null;
};

type VariableRowProps = {
  name: string;
  label: string;
  description: string;
  options: { value: string; label: string; type?: string }[];
  onCreateOption: (name: string) => void;
  edgeType: string;
};

const VariableRow = ({
  name,
  label,
  description,
  options,
  onCreateOption,
  edgeType,
}: VariableRowProps) => (
  <div className="flex items-start gap-(--space-md)">
    <div className="flex flex-1 basis-0 flex-col gap-(--space-xs) pt-(--space-sm)">
      <span className="font-semibold">
        {label}
        <span className="text-error ms-(--space-xs)">*</span>
      </span>
      <span className="text-foreground/60 text-sm leading-snug">
        {description}
      </span>
    </div>
    <div className="relative flex-1 basis-0">
      <IssueAnchor fieldName={name} description={`${label} Variable`} />
      <ValidatedField
        name={name}
        component={VariablePicker}
        validation={{ required: true }}
        componentProps={{
          entity: 'edge',
          type: edgeType,
          label: 'Select variable',
          options,
          onCreateOption,
        }}
      />
    </div>
  </div>
);

const EdgeConfiguration = ({ form }: StageEditorSectionProps) => {
  const dispatch = useAppDispatch();
  const formSelector = formValueSelector(form);

  const edgeType = useSelector(
    (state: RootState) =>
      formSelector(state, 'edgeConfig.type') as string | undefined,
  );

  // redux-form invokes a field's onChange prop as (event, newValue, previousValue).
  // A reselect of the current edge type must not clear the dependent variables.
  const handleResetDependentVariables = useCallback(
    (_event: unknown, newValue?: string, previousValue?: string) => {
      if (newValue === previousValue) {
        return;
      }
      for (const field of EDGE_DEPENDENT_VARIABLE_FIELDS) {
        dispatch(change(form, field, null) as UnknownAction);
      }
    },
    [dispatch, form],
  );

  const edgeVariableOptions = useSelector((state: RootState) =>
    edgeType
      ? getVariableOptionsForSubject(state, { entity: 'edge', type: edgeType })
      : [],
  );

  const relationshipTypeCompatible = edgeVariableOptions.filter(
    (v) =>
      v.type === 'categorical' &&
      optionsMatch(v.options, RELATIONSHIP_TYPE_OPTIONS),
  );
  const booleanEdgeVariables = edgeVariableOptions.filter(
    (v) => v.type === 'boolean',
  );
  // Only categorical variables whose options are exactly the canonical
  // gamete-role set may be bound: the interview writes these exact values
  // (egg/sperm) onto genetic parent edges, so an existing categorical variable
  // with a different value set would silently break inheritance tracing.
  // Mirrors the relationship-type picker above.
  const gameteRoleCompatible = edgeVariableOptions.filter(
    (v) =>
      v.type === 'categorical' && optionsMatch(v.options, GAMETE_ROLE_OPTIONS),
  );

  const handleCreatedVariable = (...args: unknown[]) => {
    const [id, params] = args as [string, { field: string }];
    dispatch(change(form, params.field, id));
  };

  const initialWindowProps: VariableWindowInitialProps = {
    entity: edgeEntity,
    type: edgeType ?? '',
    initialValues: { name: '', type: '' },
    lockedOptions: null,
  };

  const [variableWindowProps, openVariableWindow] = useNewVariableWindowState(
    initialWindowProps,
    handleCreatedVariable,
  );

  const handleNewRelationshipTypeVariable = (name: string) =>
    openVariableWindow(
      {
        initialValues: { name, type: 'categorical' },
        lockedOptions: RELATIONSHIP_TYPE_OPTIONS,
      },
      { field: 'edgeConfig.relationshipTypeVariable' },
    );

  const handleNewIsActiveVariable = (name: string) =>
    openVariableWindow(
      { initialValues: { name, type: 'boolean' }, lockedOptions: null },
      { field: 'edgeConfig.isActiveVariable' },
    );

  const handleNewGestationalCarrierVariable = (name: string) =>
    openVariableWindow(
      { initialValues: { name, type: 'boolean' }, lockedOptions: null },
      { field: 'edgeConfig.isGestationalCarrierVariable' },
    );

  const handleNewGameteRoleVariable = (name: string) =>
    openVariableWindow(
      {
        initialValues: { name, type: 'categorical' },
        // Seed and lock the canonical value set — the interview writes these
        // exact values, so the researcher may not edit them (mirrors the
        // relationship-type variable).
        lockedOptions: GAMETE_ROLE_OPTIONS,
      },
      { field: 'edgeConfig.gameteRoleVariable' },
    );

  return (
    <>
      <Section
        title="Edge Configuration"
        summary={
          <>
            <p>
              The family pedigree is stored as a network: each family member is
              a node, and every parent or partner connection between two people
              is an edge. This interface needs an edge type so that it can
              record those connections in your codebook — including the
              parentage it infers automatically — and so that the structure of
              the pedigree appears in your exported data.
            </p>
            <p>
              Select the edge type to use, along with the variables that store
              the details of each relationship.
            </p>
          </>
        }
      >
        <Row>
          <IssueAnchor fieldName="edgeConfig.type" description="Edge Type" />
          <ValidatedField
            name="edgeConfig.type"
            entityType="edge"
            promptBeforeChange="You attempted to change the edge type of a stage that you have already configured. Before you can proceed the variables selected for this edge type must be cleared. Do you want to change the edge type now?"
            component={EntitySelectField}
            onChange={handleResetDependentVariables}
            validation={{ required: true }}
          />
        </Row>
        {edgeType && (
          // `[&_.variable-pill]:bg-white` lifts the pills off the surface-2 panel
          <div className="bg-surface-2 text-surface-2-foreground mt-(--space-lg) flex flex-col gap-(--space-lg) rounded p-(--space-md) [&_.variable-pill]:bg-white">
            <VariableRow
              name="edgeConfig.relationshipTypeVariable"
              label="Relationship Type"
              description="Stores the type of relationship between family members (e.g. biological, social, donor, surrogate, adoptive, or partner)."
              edgeType={edgeType}
              options={relationshipTypeCompatible}
              onCreateOption={handleNewRelationshipTypeVariable}
            />
            <VariableRow
              name="edgeConfig.isActiveVariable"
              label="Is Active"
              description="Stores whether the relationship is currently active."
              edgeType={edgeType}
              options={booleanEdgeVariables}
              onCreateOption={handleNewIsActiveVariable}
            />
            <VariableRow
              name="edgeConfig.isGestationalCarrierVariable"
              label="Gestational Carrier"
              description="Stores whether a parent is a gestational carrier (parent edges only)."
              edgeType={edgeType}
              options={booleanEdgeVariables}
              onCreateOption={handleNewGestationalCarrierVariable}
            />
            <VariableRow
              name="edgeConfig.gameteRoleVariable"
              label="Gamete Role"
              description="Stores which reproductive cell (gamete) a parent contributed to a child: the egg or the sperm. The interface uses this to trace the biological route of inheritance along each parent relationship. This variable uses a fixed set of values (egg/sperm) that cannot be edited."
              edgeType={edgeType}
              options={gameteRoleCompatible}
              onCreateOption={handleNewGameteRoleVariable}
            />
          </div>
        )}
      </Section>
      <NewVariableWindow {...variableWindowProps} />
    </>
  );
};

export default EdgeConfiguration;
