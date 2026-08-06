import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  nodeForm: [{ variable: 'alias', prompt: 'Alias' }],
  useProtocolForm: vi.fn(() => ({ fieldComponents: null })),
}));

vi.mock('../../../../forms/useProtocolForm', () => ({
  default: fixtures.useProtocolForm,
}));

vi.mock('../../../../hooks/useStageSelector', () => ({
  useStageSelector: (selector: unknown) => {
    if (selector === 'nodeForm') return fixtures.nodeForm;
    if (selector === 'nodeLabelVariable') return 'displayName';
    if (selector === 'nodeType') return 'person';
    return undefined;
  },
}));

vi.mock('../../utils/nodeUtils', () => ({
  getNodeForm: 'nodeForm',
  getNodeLabelVariable: 'nodeLabelVariable',
  getNodeType: 'nodeType',
}));

import usePedigreeNodeForm from '../usePedigreeNodeForm';

describe('usePedigreeNodeForm', () => {
  beforeEach(() => {
    fixtures.useProtocolForm.mockClear();
  });

  it('aliases the configured label variable to the live pedigree name field', () => {
    const initialValues = { alias: 'Old label' };

    renderHook(() =>
      usePedigreeNodeForm({
        currentEntityId: 'person-1',
        initialValues,
      }),
    );

    expect(fixtures.useProtocolForm).toHaveBeenCalledWith({
      subject: { entity: 'node', type: 'person' },
      fields: fixtures.nodeForm,
      initialValues,
      currentEntityId: 'person-1',
      formValueAliases: { displayName: 'name' },
    });
  });
});
