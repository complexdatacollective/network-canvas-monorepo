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
  it('prints the words a Network Composer stage holds under its heading', () => {
    renderWording('NetworkComposer', {
      addNamePlaceholder: { en: 'Type a name' },
      tooltips: { addPerson: { en: 'Add a person' } },
    });

    expect(screen.getByText('Words on the canvas')).toBeInTheDocument();
    expect(
      within(rowFor('Name box placeholder')).getByText('Type a name'),
    ).toBeInTheDocument();
    expect(
      within(rowFor('Add node tooltip')).getByText('Add a person'),
    ).toBeInTheDocument();
  });

  it('prints the groups heading only once the composer has groups', () => {
    const { unmount } = renderWording('NetworkComposer', {
      groupsHeading: { en: 'Clusters' },
    });
    expect(screen.queryByText('Groups heading')).not.toBeInTheDocument();
    unmount();

    renderWording('NetworkComposer', {
      convexHullVariable: 'contactType',
      groupsHeading: { en: 'Clusters' },
    });
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

  it('prints the layout tooltips of a stage whose automatic layout is on', () => {
    const configuration = {
      behaviours: { automaticLayout: true },
      tooltips: { pauseLayout: { en: 'Freeze the layout' } },
    };
    const { unmount } = renderWording('Sociogram', configuration);
    expect(
      within(rowFor('Pause layout tooltip')).getByText('Freeze the layout'),
    ).toBeInTheDocument();
    unmount();

    renderWording('Sociogram', {
      ...configuration,
      behaviours: { automaticLayout: false },
    });
    expect(screen.queryByText('Freeze the layout')).not.toBeInTheDocument();
  });

  it('prints the at-risk notation only when the pedigree shows at-risk statuses', () => {
    const configuration = {
      showAtRiskStatuses: false,
      conditionText: {
        notation: { atRiskAffected: { en: 'Possibly affected' } },
      },
    };
    const { unmount } = renderWording('NarrativePedigree', configuration);
    expect(screen.queryByText('Possibly affected')).not.toBeInTheDocument();
    unmount();

    renderWording('NarrativePedigree', {
      ...configuration,
      showAtRiskStatuses: true,
    });
    expect(
      within(rowFor('May develop this condition')).getByText(
        'Possibly affected',
      ),
    ).toBeInTheDocument();
  });

  it('prints the key heading of a narrative pedigree', () => {
    renderWording('NarrativePedigree', {
      keyHeading: { en: 'Symbols' },
    });

    expect(
      within(rowFor('Key heading')).getByText('Symbols'),
    ).toBeInTheDocument();
  });

  it('prints nothing for a stage whose settings hold no words', () => {
    const { container } = renderWording('NetworkComposer', {});
    expect(container).toBeEmptyDOMElement();
  });

  it('prints nothing for a stage type that has no canvas wording', () => {
    const { container } = renderWording('FamilyPedigree', {
      prompt: { en: 'Draw your family' },
    });
    expect(container).toBeEmptyDOMElement();
  });
});
