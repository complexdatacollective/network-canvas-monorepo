import { FRAMING_TERMS, type FramingTerms } from '@codaco/shared-consts';

import { useFamilyPedigreeStore } from '../FamilyPedigreeContext';

export function useFramedTerms(): FramingTerms | null {
  const framing = useFamilyPedigreeStore((s) => s.framing);
  return framing ? FRAMING_TERMS[framing] : null;
}
