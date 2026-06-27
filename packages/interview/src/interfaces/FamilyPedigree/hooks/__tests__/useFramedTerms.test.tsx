import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { FramingId } from '@codaco/shared-consts';

import { FamilyPedigreeContext } from '../../FamilyPedigreeContext';
import { createFamilyPedigreeStore, type VariableConfig } from '../../store';
import { useFramedTerms } from '../useFramedTerms';

const testConfig: VariableConfig = {
  nodeType: 'person',
  edgeType: 'family',
  nodeLabelVariable: 'label',
  egoVariable: 'isEgo',
  relationshipVariable: 'relationship',
  relationshipTypeVariable: 'relationshipType',
  isActiveVariable: 'isActive',
  isGestationalCarrierVariable: 'isGestationalCarrier',
  gameteRoleVariable: 'gameteRole',
  biologicalSexVariable: 'biologicalSex',
};

function framingWrapper(framing: FramingId | null) {
  const store = createFamilyPedigreeStore(
    new Map(),
    new Map(),
    new Map(),
    testConfig,
    undefined,
    undefined,
    undefined,
    undefined,
    framing,
  );
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <FamilyPedigreeContext.Provider value={store}>
        {children}
      </FamilyPedigreeContext.Provider>
    );
  };
}

describe('useFramedTerms', () => {
  it('returns gamete terms when framing is gamete', () => {
    const { result } = renderHook(() => useFramedTerms(), {
      wrapper: framingWrapper('gamete'),
    });
    expect(result.current?.eggParent).toBe('Egg Parent');
  });

  it('returns gendered terms when framing is gendered', () => {
    const { result } = renderHook(() => useFramedTerms(), {
      wrapper: framingWrapper('gendered'),
    });
    expect(result.current?.spermParent).toBe('Father');
  });

  it('returns null before the participant has chosen', () => {
    const { result } = renderHook(() => useFramedTerms(), {
      wrapper: framingWrapper(null),
    });
    expect(result.current).toBeNull();
  });
});
