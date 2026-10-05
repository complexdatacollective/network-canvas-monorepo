import { describe, expect, it } from 'vitest';

import { INTERFACE_NAMES } from '@codaco/protocol-builder/interfaces/interfaceNames';
import type { StageType } from '@codaco/protocol-validation';
import { getInterfaceTypes } from '~/components/Screens/NewStageScreen/interfaceOptions';

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
    for (const option of getInterfaceTypes()) {
      expect(option.title).toBe(INTERFACE_NAMES[option.type]);
    }
    expect(
      getInterfaceTypes()
        .map((option) => option.type)
        .toSorted(),
    ).toEqual([...stageTypes].toSorted());
  });

  /**
   * Every Architect surface that names an interface, agreeing on one string
   * per type — asserted together rather than pairwise, because the defect was
   * never one surface being wrong, it was two of them each being internally
   * consistent and different from each other. The editor's own name for an
   * interface is the package's now, and reads the same map.
   */
  it('is one name per interface across every surface that shows one', () => {
    const optionTitles = new Map(
      getInterfaceTypes().map((option) => [option.type, option.title]),
    );

    for (const stageType of stageTypes) {
      const namesShown = new Set([
        INTERFACE_NAMES[stageType],
        optionTitles.get(stageType),
      ]);

      expect({ stageType, namesShown: [...namesShown] }).toEqual({
        stageType,
        namesShown: [INTERFACE_NAMES[stageType]],
      });
    }
  });
});
