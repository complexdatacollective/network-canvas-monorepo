import { describe, expect, it } from 'vitest';

import { analyseSyntheticFeasibility } from '@codaco/protocol-utilities';

import { buildStageRows, type SyntheticStageRow } from '../stageRows';
import {
  FIXTURE_DOCUMENT,
  fixtureDocument,
  PAIR_CEILING_DOCUMENT,
  parseFixture,
} from './fixtureProtocol';

/**
 * The stage table's derivation, over the REAL schema parse of a real protocol
 * document.
 *
 * Two claims are under test and they pull in opposite directions: the VALUES
 * must be the schema's resolution of the document (so they cannot disagree with
 * generation), and the BADGES must be the document's own keys (so a default can
 * never be shown as something a researcher chose). Every case below is chosen
 * so that a derivation reading the wrong one of the two would fail — a stage
 * whose parse carries a resolved topology it never authored, and a stage that
 * authored one, are both here.
 */

const rows = buildStageRows(parseFixture(), FIXTURE_DOCUMENT, []);

const rowFor = (label: string): SyntheticStageRow => {
  const row = rows.find((candidate) => candidate.label === label);
  if (!row) throw new Error(`No stage row for "${label}"`);
  return row;
};

describe('stage rows', () => {
  it('lists every stage once, in timeline order', () => {
    expect(rows.map((row) => row.label)).toEqual([
      'Welcome',
      'About you',
      'Quick add friends',
      'Close friends',
      'Map connections',
      'Position only',
      'Pairs',
      'Contact types',
    ]);
    expect(rows.map((row) => row.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(rowFor('Close friends').id).toBe('close-friends');
  });

  it('resolves a count the document never states, and calls it a default', () => {
    // The parse supplies the shared default nomination distribution; its
    // bounds are the stage's own resolution window, so they are not repeated
    // back to the author as parameters they wrote.
    expect(rowFor('Quick add friends').count).toEqual({
      value: 'normal(mean 8, sd 3)',
      authored: false,
    });
  });

  it('shows an authored count as the author wrote it, bounded by the stage', () => {
    // `poisson(mean 4)` under `minNodes: 1, maxNodes: 10`: the parse fills the
    // bounds from the window, and the summary elides them because they say
    // nothing the window has not already said.
    expect(rowFor('Close friends').count).toEqual({
      value: 'poisson(mean 4)',
      authored: true,
    });
  });

  it('shows a stage with nothing to generate as a burden alone', () => {
    const welcome = rowFor('Welcome');
    expect(welcome.count).toBeUndefined();
    expect(welcome.topology).toBeUndefined();
    expect(welcome.responseBurden).toEqual({ value: '0', authored: false });
  });

  it('separates an authored response burden from a resolved one', () => {
    expect(rowFor('Close friends').responseBurden).toEqual({
      value: '0.9',
      authored: true,
    });
    // The same field, resolved by the schema on a stage that states nothing.
    expect(rowFor('Contact types').responseBurden).toEqual({
      value: '0.5',
      authored: false,
    });
  });

  it('reports a resolved edge topology as a default', () => {
    expect(rowFor('Map connections').topology).toEqual({
      value: 'mean degree normal(mean 3, sd 1)',
      authored: false,
    });
    expect(rowFor('Map connections').note).toBeUndefined();
  });

  it('elides topology bounds that merely restate the metric domain', () => {
    // The document declares `min: 0, max: 1` on a density, which is the whole
    // of the density domain; only the parameters that shape the draw survive.
    expect(rowFor('Pairs').topology).toEqual({
      value: 'density normal(mean 0.3, sd 0.1)',
      authored: true,
    });
  });

  it('hides the topology of a sociogram whose prompts create no edges', () => {
    const positionOnly = rowFor('Position only');
    expect(positionOnly.topology).toBeUndefined();
    expect(positionOnly.note).toBe(
      'No prompt on this stage creates edges, so its edge topology is never used.',
    );
  });

  it('puts a panel under its owning stage with resolved nomination odds', () => {
    expect(rowFor('Quick add friends').panels).toEqual([
      {
        id: 'panel-existing',
        title: 'People you named',
        nominationProbability: { value: '30%', authored: false },
      },
    ]);
    // Every other stage owns none, so a panel cannot drift up the table.
    expect(
      rows.filter((row) => row.panels.length > 0).map((row) => row.label),
    ).toEqual(['Quick add friends']);
  });

  it('marks an authored panel probability as authored', () => {
    // The same fixture with the odds written into the document: the value
    // changes AND the badge flips, which is what proves the badge is reading
    // the file rather than the presence of a resolved value.
    const authored = fixtureDocument({ panelNominationProbability: 0.75 });
    const panel = buildStageRows(parseFixture(authored), authored, []).find(
      (row) => row.label === 'Quick add friends',
    )?.panels[0];

    expect(panel?.nominationProbability).toEqual({
      value: '75%',
      authored: true,
    });
  });
});

describe('conflicts owned by a stage', () => {
  const protocol = parseFixture(PAIR_CEILING_DOCUMENT);
  const conflicts = analyseSyntheticFeasibility(protocol);
  const conflictRows = buildStageRows(
    protocol,
    PAIR_CEILING_DOCUMENT,
    conflicts,
  );

  it('has a real refusal to attribute', () => {
    // Guards the fixture itself: were the protocol to become feasible, every
    // assertion below would pass vacuously.
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.rules).toEqual(['synthetic.count']);
  });

  it('lays the refusal at the stage the engine named, and no other', () => {
    expect(
      conflictRows.map((row) => [row.label, row.conflicts.length]),
    ).toEqual([
      ['First hundred', 0],
      ['Second hundred', 0],
      ['Every pair', 1],
    ]);
  });

  it("carries the engine's conflict object through unchanged", () => {
    const owned = conflictRows.find((row) => row.label === 'Every pair');
    expect(owned?.conflicts[0]).toBe(conflicts[0]);
  });

  it('attributes nothing when the analysis found nothing', () => {
    expect(rows.every((row) => row.conflicts.length === 0)).toBe(true);
  });
});
