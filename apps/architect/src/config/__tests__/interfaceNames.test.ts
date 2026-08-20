import { describe, expect, it } from 'vitest';

import type { StageType } from '@codaco/protocol-validation';
import { INTERFACE_TYPES } from '~/components/Screens/NewStageScreen/interfaceOptions';
import { getInterface } from '~/components/StageEditor/Interfaces';
import { INTERFACE_NAMES, interfaceDisplayName } from '~/config/interfaceNames';

const stageTypes = Object.keys(INTERFACE_NAMES) as StageType[];

describe('INTERFACE_NAMES', () => {
  it('names every stage type the schema defines', () => {
    // `Record<StageType, string>` already makes a missing entry a build error;
    // this catches the other half — a name that is present but empty.
    expect(stageTypes.length).toBeGreaterThan(0);
    for (const stageType of stageTypes) {
      expect(INTERFACE_NAMES[stageType].trim()).not.toBe('');
    }
  });

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
        interfaceDisplayName(stageType),
        optionTitles.get(stageType),
      ]);

      expect({ stageType, namesShown: [...namesShown] }).toEqual({
        stageType,
        namesShown: [INTERFACE_NAMES[stageType]],
      });
    }
  });
});

describe('interfaceDisplayName', () => {
  it('answers for every stage type', () => {
    for (const stageType of stageTypes) {
      expect(interfaceDisplayName(stageType)).toBe(INTERFACE_NAMES[stageType]);
    }
  });

  /**
   * A stage `type` read back out of a protocol is a plain string, and an
   * imported `.netcanvas` authored against a newer schema can name an
   * interface this build has never heard of. A display surface has to be able
   * to ask about one without being thrown at — the stage editor's own
   * `getInterface` throws for exactly this case, which is right when the answer
   * decides what to RENDER and wrong when it decides what to CALL something.
   */
  it('says nothing, rather than throwing, about a stage type it does not know', () => {
    expect(() => interfaceDisplayName('SomeFutureInterface')).not.toThrow();
    expect(interfaceDisplayName('SomeFutureInterface')).toBeUndefined();
  });

  // The map is an ordinary object, so an inherited key must not answer as a
  // name: a protocol's stage `type` is arbitrary text from a file.
  it('does not answer with an inherited property', () => {
    expect(interfaceDisplayName('toString')).toBeUndefined();
    expect(interfaceDisplayName('constructor')).toBeUndefined();
  });
});
