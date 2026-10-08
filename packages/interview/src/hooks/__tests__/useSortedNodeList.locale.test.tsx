import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  type Variable,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { InterviewI18nProvider } from '../../i18n/InterviewI18nProvider';
import { TestProtocolLocalization } from '../../interfaces/__tests__/TestProtocolLocalization';
import {
  createEncryptionStore,
  NODE_TYPE,
} from '../../interfaces/Anonymisation/__tests__/encryptionFixtures';
import useSortedNodeList from '../useSortedNodeList';

const variables: Record<string, Variable> = {
  name: { name: 'name', label: 'name', type: 'text', component: 'Text' },
};

const named = (name: string): NcNode => ({
  [entityPrimaryKeyProperty]: name,
  type: NODE_TYPE,
  [entityAttributesProperty]: { name },
});

const nodes = [named('z'), named('ö'), named('a')];
const store = createEncryptionStore(nodes, undefined, variables);
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

const names = (sorted: NcNode[]) =>
  sorted.map((node) => node[entityAttributesProperty].name);

describe('useSortedNodeList', () => {
  it('alphabetises in the language the protocol is read in, whatever the interface language', () => {
    const swedish = renderHook(() => useSortedNodeList(nodes, sortOrder), {
      wrapper: wrapperFor('de', 'sv'),
    });
    expect(names(swedish.result.current)).toEqual(['a', 'z', 'ö']);

    const german = renderHook(() => useSortedNodeList(nodes, sortOrder), {
      wrapper: wrapperFor('sv', 'de'),
    });
    expect(names(german.result.current)).toEqual(['a', 'ö', 'z']);
  });
});
