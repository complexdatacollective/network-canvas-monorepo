import { createSelector } from '@reduxjs/toolkit';
import { connect } from 'react-redux';
import { Field } from 'redux-form';
import { v4 as uuid } from 'uuid';

import CheckboxGroup from '~/components/Form/Fields/CheckboxGroup';
import type { RootState } from '~/ducks/store';
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

  return (
    <CheckboxGroup
      options={edgeTypes}
      input={{
        name: 'edges',
        value: checkedTypes,
        onChange: handleChange,
      }}
    />
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
