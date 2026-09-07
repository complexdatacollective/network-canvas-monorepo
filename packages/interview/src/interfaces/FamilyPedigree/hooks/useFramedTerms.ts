'use client';

import { useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';

import { useFamilyPedigreeStore } from '../FamilyPedigreeContext';
import { getFramingTerms, type FramingTerms } from '../framingTerms';

export function useFramedTerms(): FramingTerms | null {
  const intl = useAppIntl();
  const framing = useFamilyPedigreeStore((s) => s.framing);
  return useMemo(
    () => (framing ? getFramingTerms(framing, intl) : null),
    [framing, intl],
  );
}
