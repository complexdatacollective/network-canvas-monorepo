import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { InterviewI18nProvider } from '../../i18n/InterviewI18nProvider';
import useItems from './useItems';

const { sourceNodes, typeDefinition } = vi.hoisted(() => ({
  sourceNodes: [
    { _uid: 'unnamed-item', type: 'person', attributes: {} },
    { _uid: 'named-item', type: 'person', attributes: { name: 'Zoë Álvarez' } },
  ],
  typeDefinition: {
    name: 'Researcher subject',
    variables: { name: { name: 'name', type: 'text' } },
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
      label: 'Authored stage',
      subject: { entity: 'node', type: 'person' },
      dataSource: 'source',
      prompts: [{ id: 'prompt', text: 'Authored prompt' }],
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

describe('roster memoized fallback labels', () => {
  it('invalidates already-loaded fallback labels on locale changes without rewriting roster data or authored type names', () => {
    const before = structuredClone(sourceNodes);
    const tree = (locale: string) => (
      <InterviewI18nProvider requestedLocale={locale}>
        <RosterLabels />
      </InterviewI18nProvider>
    );
    const { rerender } = render(tree('en'));
    expect(
      screen.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual(['Unnamed Researcher subject 1', 'Zoë Álvarez']);
    rerender(tree('es'));
    expect(
      screen.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual(['Researcher subject sin nombre 1', 'Zoë Álvarez']);
    expect(sourceNodes).toEqual(before);
    rerender(tree('en-GB'));
    expect(
      screen.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual(['Unnamed Researcher subject 1', 'Zoë Álvarez']);
  });
});
