import { createSelector } from '@reduxjs/toolkit';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { v4 as uuid } from 'uuid';

import Button from '@codaco/fresco-ui/Button';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import NewTypeDialog from '~/components/Dialog/NewTypeDialog';
import { useAppSelector } from '~/ducks/hooks';
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
  const handleChange = (newCheckedTypes: (string | number)[] | undefined) => {
    const typedCheckedTypes = (newCheckedTypes ?? []).map(String);
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
        <CheckboxGroupField
          name="edges"
          options={edgeTypes}
          value={checkedTypes}
          onChange={handleChange}
        />
      ) : (
        <Paragraph>
          No edge types currently defined. Use the button below to create one.
        </Paragraph>
      )}
      <Button
        icon={<Plus />}
        color="primary"
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

type EdgeTypeMultiSelectFieldProps = CreateFormFieldProps<
  EdgeEntry[],
  'div',
  Record<never, never>
>;

/**
 * Field-component wrapper for `EdgeTypeMultiSelectInner`: sources the
 * codebook's edge types and adapts a fresco-ui `Field`'s `value`/`onChange`
 * contract, replacing the redux-form `Field`/`connect` pairing this used to
 * be built from.
 */
const EdgeTypeMultiSelectField = ({
  value,
  onChange,
}: EdgeTypeMultiSelectFieldProps) => {
  const edgeTypes = useAppSelector(getEdgeOptions);
  return (
    <EdgeTypeMultiSelectInner
      edgeTypes={edgeTypes}
      value={Array.isArray(value) ? value : []}
      onChange={(edges) => onChange?.(edges)}
    />
  );
};

export default EdgeTypeMultiSelectField;
