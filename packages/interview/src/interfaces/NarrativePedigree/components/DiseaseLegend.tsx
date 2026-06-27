'use client';

import { Button } from '@codaco/fresco-ui/Button';

type Disease = {
  id: string;
  label: string;
  color: string;
};

type DiseaseLegendProps = {
  diseases: Disease[];
  selectedDiseaseId: string | null;
  onSelect: (id: string | null) => void;
};

export default function DiseaseLegend({
  diseases,
  selectedDiseaseId,
  onSelect,
}: DiseaseLegendProps) {
  const allActive = selectedDiseaseId === null;

  return (
    <div
      role="group"
      aria-label="Filter by disease"
      className="flex flex-wrap items-center gap-2"
    >
      <Button
        size="sm"
        variant={allActive ? 'default' : 'outline'}
        aria-pressed={allActive}
        onClick={() => onSelect(null)}
      >
        All diseases
      </Button>
      {diseases.map((disease) => {
        const active = selectedDiseaseId === disease.id;
        return (
          <Button
            key={disease.id}
            size="sm"
            variant={active ? 'default' : 'outline'}
            aria-pressed={active}
            onClick={() => onSelect(active ? null : disease.id)}
            icon={
              <span
                aria-hidden
                className="inline-block size-3 shrink-0 rounded-full"
                style={{ backgroundColor: disease.color }}
              />
            }
          >
            {disease.label}
          </Button>
        );
      })}
    </div>
  );
}
