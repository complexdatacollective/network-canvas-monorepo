import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import SummaryContext from '../../SummaryContext';
import CanvasWording from '../CanvasWording';

const protocol = {
  schemaVersion: 9,
  name: 'Canvas protocol',
  localization: { defaultLocale: 'en', locales: ['en'] },
  codebook: { node: {}, edge: {}, ego: {} },
  assetManifest: {},
  stages: [],
} as unknown as CurrentProtocol;

const renderWording = (type: string, configuration: Record<string, unknown>) =>
  render(
    <SummaryContext.Provider
      value={{ protocol, protocolName: protocol.name, index: [] } as never}
    >
      <CanvasWording type={type} configuration={configuration} />
    </SummaryContext.Provider>,
  );

/** The table row whose label is `label`, so its value can be checked. */
const rowFor = (label: string) => {
  const row = screen.getByText(label).closest('tr');
  if (!(row instanceof HTMLElement)) throw new Error(`No row for ${label}`);
  return row;
};

describe('Protocol Summary canvas wording', () => {
  it('prints the words a Narrative stage holds under its heading', () => {
    renderWording('Narrative', {
      groupsHeading: { en: 'Clusters' },
      presets: [
        {
          id: 'p1',
          label: { en: 'Preset' },
          groupVariable: 'contactType',
        },
      ],
    });

    expect(screen.getByText('Customize built-in wording')).toBeInTheDocument();
    expect(
      within(rowFor('Groups heading')).getByText('Clusters'),
    ).toBeInTheDocument();
  });

  it('prints the narrative headings when a preset uses the matching feature', () => {
    renderWording('Narrative', {
      attributesHeading: { en: 'Important people' },
      presets: [
        {
          id: 'p1',
          label: { en: 'Preset' },
          highlight: [{ variable: 'age', label: { en: 'Age' } }],
        },
      ],
    });

    expect(
      within(rowFor('Attributes heading')).getByText('Important people'),
    ).toBeInTheDocument();
  });

  it('prints the snapshot button of a narrative pedigree', () => {
    renderWording('NarrativePedigree', {
      saveSnapshot: { en: 'Keep a picture' },
    });

    expect(
      within(rowFor('Save snapshot button')).getByText('Keep a picture'),
    ).toBeInTheDocument();
  });

  // A snapshot title shows a name and a condition: the summary names its
  // placeholders, as the stage editor does, rather than printing its syntax.
  it('prints a snapshot title with its placeholders named', () => {
    renderWording('NarrativePedigree', {
      conditionText: { snapshotCondition: { en: '{title}: {condition}' } },
    });

    const row = rowFor('Snapshot title for a condition');
    expect(row).not.toHaveTextContent('{title}');
    expect(row).not.toHaveTextContent('{condition}');
    // Each placeholder is drawn as a pill, named by its label.
    expect(
      [...row.querySelectorAll('[data-token]')].map((pill) =>
        pill.getAttribute('data-token'),
      ),
    ).toEqual(['title', 'condition']);
    expect(row).toHaveTextContent(/.+: .+/);
  });

  it('prints nothing for a stage whose settings hold no words', () => {
    const { container } = renderWording('Narrative', {});
    expect(container).toBeEmptyDOMElement();
  });

  it('prints nothing for a stage type that has no canvas wording', () => {
    const { container } = renderWording('NetworkComposer', {
      convexHullVariable: 'contactType',
    });
    expect(container).toBeEmptyDOMElement();
  });
});
