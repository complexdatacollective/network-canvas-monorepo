import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';

import ArchitectField from '~/components/Form/ArchitectField';
import {
  asStage,
  renderStageForm,
} from '~/components/StageEditor/__tests__/stageFormTestHarness';

vi.mock('~/components/Form/Fields/DataSource', () => ({
  default: ({
    value,
    onChange,
  }: {
    value?: string;
    onChange?: (value: string) => void;
  }) => (
    <input
      aria-label="Roster data source"
      value={value ?? ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

import ExternalDataSource from '../ExternalDataSource';

// Minimal registered fields standing in for the actual leaf fields
// CardDisplayOptions/SortOptionsForExternalData/SearchOptionsForExternalData
// register (`cardOptions`/`sortOptions`/`searchOptions` themselves are never
// registered as fields) — this test mounts those exact leaf paths so
// `setFieldValue` writes into `fields` directly instead of parking an
// unregistered write in `dormantValues`.
const ValueProbe = (({ value }: { value?: unknown }) => (
  <span data-testid="value">{JSON.stringify(value)}</span>
)) as ComponentType<Record<string, unknown>>;

const DependentFields = () => (
  <>
    <ArchitectField
      name="cardOptions.additionalProperties"
      label="cardOptions.additionalProperties"
      component={ValueProbe}
      initialValue={[{ variable: 'x' }]}
    />
    <ArchitectField
      name="sortOptions.sortOrder"
      label="sortOptions.sortOrder"
      component={ValueProbe}
      initialValue={[{ property: 'x', direction: 'asc' }]}
    />
    <ArchitectField
      name="sortOptions.sortableProperties"
      label="sortOptions.sortableProperties"
      component={ValueProbe}
      initialValue={[{ variable: 'x' }]}
    />
    <ArchitectField
      name="searchOptions.matchProperties"
      label="searchOptions.matchProperties"
      component={ValueProbe}
      initialValue={['x']}
    />
    <ArchitectField
      name="searchOptions.fuzziness"
      label="searchOptions.fuzziness"
      component={ValueProbe}
      initialValue={0.5}
    />
  </>
);

const DEPENDENT_LEAF_PATHS = [
  'cardOptions.additionalProperties',
  'sortOptions.sortOrder',
  'sortOptions.sortableProperties',
  'searchOptions.matchProperties',
  'searchOptions.fuzziness',
];

const STAGE_PROPS = {
  stagePath: 'stages[0]',
  stagePosition: 0,
  interfaceType: 'NameGeneratorRoster' as const,
};

describe('ExternalDataSource', () => {
  it('does not reset dependent sections when an existing stage is simply loaded', () => {
    const { getFieldState } = renderStageForm({
      // `subject.type` set so `withDisabledSubjectRequired` leaves the
      // section enabled (it hides its fields entirely while disabled).
      committedStage: asStage({
        dataSource: 'asset-1',
        subject: { entity: 'node', type: 'person' },
      }),
      children: (
        <>
          <ExternalDataSource {...STAGE_PROPS} />
          <DependentFields />
        </>
      ),
    });

    for (const path of DEPENDENT_LEAF_PATHS) {
      expect(getFieldState(path)?.value).not.toBeUndefined();
    }
  });

  it('resets every dependent leaf field when the data source changes', async () => {
    const { getFieldState } = renderStageForm({
      // `subject.type` set so `withDisabledSubjectRequired` leaves the
      // section enabled (it hides its fields entirely while disabled).
      committedStage: asStage({
        dataSource: 'asset-1',
        subject: { entity: 'node', type: 'person' },
      }),
      children: (
        <>
          <ExternalDataSource {...STAGE_PROPS} />
          <DependentFields />
        </>
      ),
    });

    fireEvent.change(screen.getByLabelText('Roster data source'), {
      target: { value: 'asset-2' },
    });

    await waitFor(() => {
      expect(
        getFieldState('cardOptions.additionalProperties')?.value,
      ).toBeUndefined();
    });
    for (const path of DEPENDENT_LEAF_PATHS) {
      expect(getFieldState(path)?.value).toBeUndefined();
    }
  });
});
