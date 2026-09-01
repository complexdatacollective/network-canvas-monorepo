import { describe, expect, it } from 'vitest';

import type { StageType } from '@codaco/protocol-validation';

import { INTERFACE_NAMES, interfaceDisplayName } from '../interfaceNames.ts';

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
   * registry lookup throws for exactly this case, which is right when the
   * answer decides what to RENDER and wrong when it decides what to CALL
   * something.
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
