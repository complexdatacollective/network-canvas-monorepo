import { configureStore } from '@reduxjs/toolkit';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it } from 'vitest';

import { asEntityAttributeReference } from '@codaco/protocol-validation';

import { interviewCatalogSource } from '../../i18n/catalog';
import { InterviewI18nProvider } from '../../i18n/InterviewI18nProvider';
import { TestProtocolLocalization } from '../../interfaces/__tests__/TestProtocolLocalization';
import useSortedNodeList from '../useSortedNodeList';

// Loaded before anything renders, as a host loads a language before it
// mounts an interview, so renders in these languages are synchronous.
beforeAll(async () => {
  await Promise.all(
    ['de'].map((locale) => interviewCatalogSource.load(locale)),
  );
});

const store = configureStore({
  reducer: { protocol: () => ({ codebook: undefined }) },
});

const nodes = [{ name: 'z' }, { name: 'ö' }, { name: 'a' }];
const sortOrder = [
  { property: asEntityAttributeReference('name'), direction: 'asc' as const },
];

const wrapperFor =
  (interfaceLocale: string, protocolLocale: string) =>
  ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <InterviewI18nProvider requestedLocale={interfaceLocale}>
        <TestProtocolLocalization
          localization={{
            defaultLocale: protocolLocale,
            locales: [protocolLocale],
          }}
        >
          {children}
        </TestProtocolLocalization>
      </InterviewI18nProvider>
    </Provider>
  );

describe('useSortedNodeList', () => {
  it('alphabetises in the language the protocol is read in, whatever the interface language', () => {
    const swedish = renderHook(() => useSortedNodeList(nodes, sortOrder), {
      wrapper: wrapperFor('de', 'sv'),
    });
    expect(swedish.result.current.map((node) => node.name)).toEqual([
      'a',
      'z',
      'ö',
    ]);

    const german = renderHook(() => useSortedNodeList(nodes, sortOrder), {
      wrapper: wrapperFor('sv', 'de'),
    });
    expect(german.result.current.map((node) => node.name)).toEqual([
      'a',
      'ö',
      'z',
    ]);
  });
});
