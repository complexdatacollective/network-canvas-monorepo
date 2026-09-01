import { describe, expect, it } from 'vitest';

import { INTERFACE_NAMES } from '@codaco/protocol-builder/interfaces/interfaceNames';
import type { StageType } from '@codaco/protocol-validation';
import { INTERFACE_TYPES } from '~/components/Screens/NewStageScreen/interfaceOptions';
import { getInterface } from '~/components/StageEditor/Interfaces';

const stageTypes = Object.keys(INTERFACE_NAMES) as StageType[];

/**
 * The map itself lives in `@codaco/protocol-builder`, which owns interface
 * metadata for every host. What stays here is the part only Architect can
 * assert: that every Architect surface naming an interface reads that one map
 * rather than deriving or restating a name of its own.
 */
describe('INTERFACE_NAMES in Architect', () => {
  /**
   * The New Stage screen used to hold its own copy of these titles, and the
   * stage timeline read the researcher-facing name of an interface out of that
   * screen's option list. This is what stops a literal title being written
   * back into either place: both now read one map, and any interface whose
   * title stops matching fails here.
   */
  it('is the only source of the New Stage screen titles', () => {
    for (const option of INTERFACE_TYPES) {
      expect(option.title).toBe(INTERFACE_NAMES[option.type]);
    }
    expect(INTERFACE_TYPES.map((option) => option.type).toSorted()).toEqual(
      [...stageTypes].toSorted(),
    );
  });

  /**
   * The stage editor's registry used to derive its own name with
   * `startCase(type)`, which disagreed with the list the researcher picked the
   * interface FROM for six of them — `OneToManyDyadCensus`,
   * `TieStrengthCensus`, `AlterForm`, `AlterEdgeForm`, `Geospatial` and
   * `Anonymisation` — so the same interface was called two different things
   * depending on which part of Architect was speaking. `InterfaceConfig` no
   * longer has a `name` field to override it with; this is what catches a
   * derivation being reintroduced in its place.
   */
  it('is the only source of the stage editor registry names', () => {
    for (const stageType of stageTypes) {
      expect(getInterface(stageType).name).toBe(INTERFACE_NAMES[stageType]);
    }
  });

  /**
   * Every surface that names an interface, agreeing on one string per type —
   * asserted together rather than pairwise, because the defect was never one
   * surface being wrong, it was two of them each being internally consistent
   * and different from each other.
   */
  it('is one name per interface across every surface that shows one', () => {
    const optionTitles = new Map(
      INTERFACE_TYPES.map((option) => [option.type, option.title]),
    );

    for (const stageType of stageTypes) {
      const namesShown = new Set([
        INTERFACE_NAMES[stageType],
        getInterface(stageType).name,
        optionTitles.get(stageType),
      ]);

      expect({ stageType, namesShown: [...namesShown] }).toEqual({
        stageType,
        namesShown: [INTERFACE_NAMES[stageType]],
      });
    }
  });
});
