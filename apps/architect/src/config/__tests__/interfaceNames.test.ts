import { describe, expect, it } from 'vitest';

import { INTERFACE_NAMES } from '@codaco/protocol-builder/interfaces/interfaceNames';
import type { StageType } from '@codaco/protocol-validation';
import { getInterfaceTypes } from '~/components/Screens/NewStageScreen/interfaceOptions';

const stageTypes = Object.keys(INTERFACE_NAMES) as StageType[];

// A protocol may end with several finish stages, so the New Stage screen
// offers every stage type, the finish stage included.
const offeredStageTypes = stageTypes;

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
    expect(stageTypes.length).toBeGreaterThan(0);
    for (const option of getInterfaceTypes()) {
      expect(option.title).toBe(INTERFACE_NAMES[option.type]);
    }
    expect(
      getInterfaceTypes()
        .map((option) => option.type)
        .toSorted(),
    ).toEqual([...offeredStageTypes].toSorted());
  });
});
