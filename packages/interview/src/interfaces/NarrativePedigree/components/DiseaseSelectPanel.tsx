'use client';

import { useId } from 'react';

import SelectField from '@codaco/fresco-ui/form/fields/Select/Styled';
import { Label } from '@codaco/fresco-ui/Label';
import { MotionSurface } from '@codaco/fresco-ui/layout/Surface';

type Disease = {
  id: string;
  label: string;
  color: string;
};

type DiseaseOption = {
  value: string;
  label: string;
};

type DiseaseSelectPanelProps = {
  diseases: Disease[];
  selectedDiseaseId: string | null;
  onSelect: (id: string | null) => void;
};

// Non-empty sentinel for the "show every condition" option. Base-UI Select
// treats an empty-string value as "no value" and renders the placeholder
// instead of the option label; using 'all' avoids that blank-trigger bug.
const ALL_CONDITIONS = 'all';

export default function DiseaseSelectPanel({
  diseases,
  selectedDiseaseId,
  onSelect,
}: DiseaseSelectPanelProps) {
  const selectId = useId();

  const options: DiseaseOption[] = [
    { value: ALL_CONDITIONS, label: 'All conditions' },
    ...diseases.map((disease) => ({
      value: disease.id,
      label: disease.label,
    })),
  ];

  const handleChange = (value: string | number | undefined) => {
    onSelect(
      typeof value === 'string' && value !== ALL_CONDITIONS ? value : null,
    );
  };

  return (
    <MotionSurface
      noContainer
      spacing="xs"
      shadow="xs"
      className="flex flex-col gap-2 rounded"
    >
      <Label htmlFor={selectId}>Show a condition</Label>
      <SelectField
        id={selectId}
        name="np-condition"
        options={options}
        value={selectedDiseaseId ?? ALL_CONDITIONS}
        onChange={handleChange}
      />
    </MotionSurface>
  );
}
