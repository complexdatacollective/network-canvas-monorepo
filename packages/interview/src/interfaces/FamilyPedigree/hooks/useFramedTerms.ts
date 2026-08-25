import { useFamilyPedigreeStore } from '../FamilyPedigreeContext';
import { FRAMING_TERMS, type FramingTerms } from '../framingTerms';

export function useFramedTerms(): FramingTerms | null {
  const framing = useFamilyPedigreeStore((s) => s.framing);
  return framing ? FRAMING_TERMS[framing] : null;
}
