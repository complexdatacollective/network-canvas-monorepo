import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { interviewCatalogSource } from '../../i18n/catalog';
import { InterviewI18nProvider } from '../../i18n/InterviewI18nProvider';
import { TestProtocolLocalization } from '../__tests__/TestProtocolLocalization';
import useItems from './useItems';

const { sourceNodes, typeDefinition } = vi.hoisted(() => ({
  sourceNodes: [
    { _uid: 'unnamed-item', type: 'person', attributes: {} },
    { _uid: 'named-item', type: 'person', attributes: { name: 'Zoë Álvarez' } },
  ],
  typeDefinition: {
    name: 'person_internal',
    label: { en: 'Researcher subject' },
    variables: {
      name: { name: 'name', label: 'Name', type: 'text' },
    },
  },
}));

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
      id: 'stage',
      type: 'NameGeneratorRoster',
      panelTitle: { en: 'Available to add' },
      label: { en: 'Authored stage' },
      subject: { entity: 'node', type: 'person' },
      dataSource: 'source',
      prompts: [{ id: 'prompt', text: { en: 'Authored prompt' } }],
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

// Loaded before anything renders, as a host loads a language before it
// mounts an interview, so renders in these languages are synchronous.
beforeAll(async () => {
  await Promise.all(
    ['es', 'en-GB'].map((locale) => interviewCatalogSource.load(locale)),
  );
});

describe('roster memoized fallback labels', () => {
  it('keeps the fallback label, the roster data and authored type labels unchanged across locale changes', () => {
    const before = structuredClone(sourceNodes);
    const tree = (locale: string) => (
      <InterviewI18nProvider requestedLocale={locale}>
        <TestProtocolLocalization>
          <RosterLabels />
        </TestProtocolLocalization>
      </InterviewI18nProvider>
    );
    const { rerender } = render(tree('en'));
    expect(
      screen.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual(['Researcher subject 1', 'Zoë Álvarez']);
    rerender(tree('es'));
    expect(
      screen.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual(['Researcher subject 1', 'Zoë Álvarez']);
    expect(sourceNodes).toEqual(before);
    rerender(tree('en-GB'));
    expect(
      screen.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual(['Researcher subject 1', 'Zoë Álvarez']);
  });
});
