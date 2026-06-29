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

// Sentinel value for the "show every condition" option. Maps to a null
// selection so the view shows all conditions at once (sticker mode).
const ALL_CONDITIONS = '';

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
    // Disease ids and the "all conditions" sentinel are always strings; a
    // missing or sentinel value clears the selection (shows all conditions).
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
