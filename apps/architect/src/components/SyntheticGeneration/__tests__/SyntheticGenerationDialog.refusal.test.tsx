import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { analyseSyntheticFeasibility } from '@codaco/protocol-utilities';
import {
  CURRENT_SCHEMA_VERSION,
  CurrentProtocolSchema,
  validateProtocol,
  type CurrentProtocol,
} from '@codaco/protocol-validation';

import { SyntheticGenerationDialog } from '../SyntheticGenerationDialog';

/**
 * A refusal, driven through the REAL engine.
 *
 * Nothing about generation is stubbed here: the dialog runs the same pipeline
 * the button runs, over a protocol whose roster stage demands more people than
 * its roster holds, and the engine refuses. Only the host boundary the editor
 * owns — resolving the roster rows out of the asset store — is supplied by the
 * test, because that is the input, not the behaviour under test.
 *
 * The oracle is the engine's own analysis, asked for separately and compared
 * against what reached the screen. A UI that summarised, truncated or reworded
 * the refusal fails, which is the whole rule (spec governing rule 3: the UI
 * never paraphrases a refusal).
 */

const ROSTER_STAGE_ID = 'roster-stage';
const MIN_NODES = 5;

const rosterRow = {
  _uid: 'roster-person-1',
  type: 'person',
  attributes: { name: 'Alex' },
};

// Exactly one row for a stage that refuses to advance below five.
const assetData = {
  rosterNodes: { [ROSTER_STAGE_ID]: [rosterRow] },
  geojsonPropertyValues: {},
};

vi.mock('~/utils/syntheticAssetData', () => ({
  collectSyntheticAssetData: vi.fn(async () => assetData),
}));

const protocol: CurrentProtocol = CurrentProtocolSchema.parse({
  name: 'Too Small Roster',
  schemaVersion: 8,
  assetManifest: {
    roster_data: { name: 'Roster', type: 'network', source: 'roster.json' },
  },
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {
          name: { name: 'name', type: 'text', component: 'Text' },
        },
      },
    },
  },
  stages: [
    {
      id: ROSTER_STAGE_ID,
      type: 'NameGeneratorRoster',
      label: 'Choose from the roster',
      subject: { entity: 'node', type: 'person' },
      dataSource: 'roster_data',
      cardOptions: { additionalProperties: [] },
      prompts: [{ id: 'p1', text: 'Who from this list do you know?' }],
      behaviours: { minNodes: MIN_NODES },
    },
  ],
});

describe('SyntheticGenerationDialog refusals', () => {
  it('renders the engine’s conflicts verbatim when the protocol can never generate', async () => {
    // The oracle: the same analysis the generation run performs, over the same
    // inputs. Built from the app's own parse so the comparison cannot drift
    // from what the dialog actually generated with.
    const validation = await validateProtocol(protocol);
    expect(validation.success).toBe(true);
    if (!validation.success) return;
    expect(validation.data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    if (validation.data.schemaVersion !== CURRENT_SCHEMA_VERSION) return;
    const expected = analyseSyntheticFeasibility(validation.data, assetData);

    // The fixture has to actually refuse, or every assertion below is vacuous.
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.some((c) => c.stageId === ROSTER_STAGE_ID)).toBe(true);

    render(
      <SyntheticGenerationDialog
        open
        onOpenChange={vi.fn()}
        protocol={protocol}
        protocolId="protocol-1"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(
      await screen.findByText('Synthetic data could not be generated'),
    ).toBeInTheDocument();

    for (const conflict of expected) {
      // `getByText` with a string matches a whole text node: a rendering that
      // trimmed, re-punctuated or wrapped the sentence in extra prose within
      // the same node would not match.
      expect(screen.getByText(conflict.reason)).toBeInTheDocument();
    }

    // And the refusal is addressed, so a researcher knows which of their types
    // it is about.
    expect(screen.getByText('Person')).toBeInTheDocument();
  });
});
