import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { testId, testTypeId, testVariableId } from '../../__tests__/testIds';
import { InterviewI18nProvider } from '../../i18n/InterviewI18nProvider';
import {
  suppliedInterfaceText,
  TestProtocolLocalization,
} from '../__tests__/TestProtocolLocalization';
import useItems from './useItems';

const PERSON_TYPE = testTypeId('person');
const NAME_VAR = testVariableId('name');
const sourceNodes = [
  { _uid: 'unnamed-item', type: PERSON_TYPE, attributes: {} },
  {
    _uid: 'named-item',
    type: PERSON_TYPE,
    attributes: { [NAME_VAR]: 'Zoë Álvarez' },
  },
];
const typeDefinition = {
  name: 'person_internal',
  variables: {
    [NAME_VAR]: { name: 'name', type: 'text' },
  },
};

vi.mock('../../hooks/useExternalData', () => ({
  default: () => ({ externalData: sourceNodes, status: { state: 'ready' } }),
}));
vi.mock('../../hooks/useStageSelector', () => ({
  useStageSelector: (selector: () => unknown) => selector(),
}));
vi.mock('../../selectors/session', () => ({
  getNodeTypeDefinition: () => typeDefinition,
  getNetworkNodes: () => [],
}));
vi.mock('../../selectors/name-generator', () => ({
  getStageCardOptions: () => ({ additionalProperties: [] }),
}));

function RosterLabels() {
  const { items } = useItems({
    stage: {
      id: testId('stage'),
      type: 'NameGeneratorRoster',
      allAddedNotice: { en: 'There is nothing left to add from this list.' },
      unnamedLabel: { en: 'Unnamed {count}', es: 'Sin nombre {count}' },
      panelTitle: { en: 'Available to add' },
      label: { en: 'Authored stage' },
      subject: { entity: 'node', types: [PERSON_TYPE] },
      dataSource: 'source',
      prompts: [{ id: testId('prompt'), text: { en: 'Authored prompt' } }],
    },
    getNavigationHelpers: () => ({
      moveForward: () => {},
      moveBackward: () => {},
    }),
  });
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>{item.props.label}</li>
      ))}
    </ul>
  );
}

const bilingual = { defaultLocale: 'en', locales: ['en', 'es'] };
// What every roster shows alike, as the protocol words it.
const interfaceText = suppliedInterfaceText(bilingual, [
  { type: 'NameGeneratorRoster' },
]);

describe('roster memoized fallback labels', () => {
  it('words the fallback label in the interview language, and leaves the roster data unchanged', () => {
    const before = structuredClone(sourceNodes);
    const tree = (locale: string) => (
      <InterviewI18nProvider>
        <TestProtocolLocalization
          localization={bilingual}
          locale={locale}
          interfaceText={interfaceText}
        >
          <RosterLabels />
        </TestProtocolLocalization>
      </InterviewI18nProvider>
    );
    const { rerender } = render(tree('en'));
    expect(
      screen.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual(['Unnamed 1', 'Zoë Álvarez']);
    rerender(tree('es'));
    expect(
      screen.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual(['Sin nombre 1', 'Zoë Álvarez']);
    expect(sourceNodes).toEqual(before);
    rerender(tree('en'));
    expect(
      screen.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual(['Unnamed 1', 'Zoë Álvarez']);
  });
});
