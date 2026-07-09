import { createSelector } from '@reduxjs/toolkit';
import { useState } from 'react';
import { connect } from 'react-redux';
import { Field } from 'redux-form';
import { v4 as uuid } from 'uuid';

import NewTypeDialog from '~/components/Dialog/NewTypeDialog';
import CheckboxGroup from '~/components/Form/Fields/CheckboxGroup';
import type { RootState } from '~/ducks/store';
import Button from '~/lib/legacy-ui/components/Button';
import { getEdgeTypes } from '~/selectors/codebook/index';
import { asOptions } from '~/selectors/utils';

type EdgeEntrySubject = {
  entity: 'edge';
  type: string;
};

export type EdgeEntry = {
  id: string;
  subject: EdgeEntrySubject;
  form?: Record<string, unknown>;
};

type EdgeTypeOption = {
  value: string;
  label: string;
};

type EdgeTypeMultiSelectInnerProps = {
  edgeTypes: EdgeTypeOption[];
  value: EdgeEntry[];
  onChange: (edges: EdgeEntry[]) => void;
};

export const EdgeTypeMultiSelectInner = ({
  edgeTypes,
  value,
  onChange,
}: EdgeTypeMultiSelectInnerProps) => {
  const [showNewTypeDialog, setShowNewTypeDialog] = useState(false);
  const checkedTypes = value.map((entry) => entry.subject.type);

  const handleChange = (newCheckedTypes: unknown[]) => {
    const typedCheckedTypes = newCheckedTypes as string[];

    const nextEntries = typedCheckedTypes.map((type) => {
      const existing = value.find((entry) => entry.subject.type === type);
      if (existing) {
        return existing;
      }
      return {
        id: uuid(),
        subject: { entity: 'edge' as const, type },
      };
    });

    onChange(nextEntries);
  };

  // A type created from here is meant for THIS stage, so select it immediately
  // rather than making the user find and tick the new checkbox.
  const handleNewTypeComplete = (newTypeId?: string) => {
    setShowNewTypeDialog(false);
    if (newTypeId && !checkedTypes.includes(newTypeId)) {
      onChange([
        ...value,
        { id: uuid(), subject: { entity: 'edge' as const, type: newTypeId } },
      ]);
    }
  };

  return (
    <div className="flex flex-col items-start gap-5">
      {edgeTypes.length > 0 ? (
        <CheckboxGroup
          options={edgeTypes}
          input={{
            name: 'edges',
            value: checkedTypes,
            onChange: handleChange,
          }}
        />
      ) : (
        <p>
          No edge types currently defined. Use the button below to create one.
        </p>
      )}
      <Button
        icon="add"
        color="sea-green"
        onClick={() => setShowNewTypeDialog(true)}
      >
        Create new edge type
      </Button>
      <NewTypeDialog
        show={showNewTypeDialog}
        entityType="edge"
        onComplete={handleNewTypeComplete}
        onCancel={() => setShowNewTypeDialog(false)}
      />
    </div>
  );
};

const getEdgeOptions = createSelector([getEdgeTypes], (edgeTypes) =>
  asOptions(edgeTypes),
);

type OwnProps = {
  form: string;
};

const withEdgeTypes = connect((state: RootState) => ({
  edgeTypes: getEdgeOptions(state),
}));

type ConnectedProps = {
  edgeTypes: EdgeTypeOption[];
};

type EdgeTypeMultiSelectControlProps = {
  // redux-form types a field value loosely and initialises an unset field to ''
  // (not an array), so value can arrive as a string — the render guards for it.
  input: {
    value: EdgeEntry[] | string;
    onChange: (edges: EdgeEntry[]) => void;
  };
  edgeTypes: EdgeTypeOption[];
};

export const EdgeTypeMultiSelectControl = ({
  input,
  edgeTypes,
}: EdgeTypeMultiSelectControlProps) => (
  <EdgeTypeMultiSelectInner
    edgeTypes={edgeTypes}
    // redux-form initialises an unset field's value to '' (not undefined), so a
    // nullish guard isn't enough — coerce any non-array to an empty selection.
    value={Array.isArray(input.value) ? input.value : []}
    onChange={input.onChange}
  />
);

const EdgeTypeMultiSelectField = ({ edgeTypes }: ConnectedProps & OwnProps) => (
  <Field
    name="edges"
    component={EdgeTypeMultiSelectControl}
    edgeTypes={edgeTypes}
  />
);

export default withEdgeTypes(EdgeTypeMultiSelectField);
