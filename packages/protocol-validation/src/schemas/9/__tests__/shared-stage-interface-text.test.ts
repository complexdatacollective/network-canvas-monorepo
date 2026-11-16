import { describe, expect, it } from 'vitest';

import {
  interfaceTextAsShown,
  interfaceTextWithUpdates,
} from '../../../__tests__/suppliedWording.ts';
import {
  sharedStageInterfaceTextUsed,
  STAGE_TYPE_INTERFACE_TEXT,
} from '../interface-text.ts';

const ENGLISH = { defaultLocale: 'en', locales: ['en'] };

const geospatial = (id: string, allowSearch: boolean) => ({
  id,
  type: 'Geospatial',
  mapOptions: { allowSearch },
});

const protocolWith = (stages: readonly unknown[]) => ({
  localization: ENGLISH,
  codebook: { node: {}, edge: {}, ego: {} },
  stages,
});

/** The geospatial group's entries the result names, or undefined when none. */
const geospatialKeys = (
  used: ReturnType<typeof sharedStageInterfaceTextUsed>,
): readonly string[] | undefined =>
  used.find(({ group }) => group === 'geospatial')?.keys;

describe('the shared interface text a protocol would use with a stage as it stands', () => {
  it('uses an entry a setting brings in once the stage turns that setting on', () => {
    const saved = protocolWith([geospatial('map', false)]);

    expect(
      geospatialKeys(
        sharedStageInterfaceTextUsed(saved, geospatial('map', false)),
      ),
    ).not.toContain('searchFailed');
    expect(
      geospatialKeys(
        sharedStageInterfaceTextUsed(saved, geospatial('map', true)),
      ),
    ).toContain('searchFailed');
  });

  it('stops using that entry once the stage turns the setting off', () => {
    const saved = protocolWith([geospatial('map', true)]);

    expect(
      geospatialKeys(
        sharedStageInterfaceTextUsed(saved, geospatial('map', false)),
      ),
    ).not.toContain('searchFailed');
  });

  it('keeps using an entry another stage of the kind still shows', () => {
    const saved = protocolWith([
      geospatial('map', true),
      geospatial('other', true),
    ]);

    expect(
      geospatialKeys(
        sharedStageInterfaceTextUsed(saved, geospatial('map', false)),
      ),
    ).toContain('searchFailed');
  });

  it('counts a stage the protocol does not hold yet as added to it', () => {
    const saved = protocolWith([]);

    expect(
      geospatialKeys(
        sharedStageInterfaceTextUsed(saved, geospatial('new', true)),
      ),
    ).toContain('searchFailed');
  });

  it('names exactly the stage kind’s groups and entries the protocol would show', () => {
    for (const allowSearch of [true, false]) {
      const stage = geospatial('map', allowSearch);
      const saved = interfaceTextAsShown(protocolWith([stage]));
      const expected = (STAGE_TYPE_INTERFACE_TEXT.Geospatial ?? []).flatMap(
        (group) => {
          const entries = saved[group as keyof typeof saved];
          return entries === undefined
            ? []
            : [{ group, keys: Object.keys(entries) }];
        },
      );

      expect(
        sharedStageInterfaceTextUsed(
          protocolWith([geospatial('map', !allowSearch)]),
          stage,
        ),
      ).toEqual(expected);
    }
  });

  it('names nothing for a kind of stage with no shared text of its own', () => {
    expect(
      sharedStageInterfaceTextUsed(protocolWith([]), {
        id: 'info',
        type: 'Information',
      }),
    ).toEqual([]);
  });
});

describe('interface text with updates written over it', () => {
  it('replaces the named entries and keeps every other', () => {
    const held = {
      geospatial: { searchFailed: { en: 'Not found' }, other: { en: 'Kept' } },
      navigation: { back: { en: 'Back' } },
    };

    expect(
      interfaceTextWithUpdates(held, [
        { group: 'geospatial', key: 'searchFailed', value: { en: 'No match' } },
        { group: 'narrative', key: 'pen', value: { en: 'Pen' } },
      ]),
    ).toEqual({
      geospatial: { searchFailed: { en: 'No match' }, other: { en: 'Kept' } },
      navigation: { back: { en: 'Back' } },
      narrative: { pen: { en: 'Pen' } },
    });
    expect(held.geospatial.searchFailed).toEqual({ en: 'Not found' });
  });

  it('reads anything that is not a record of groups as holding none', () => {
    expect(
      interfaceTextWithUpdates(undefined, [
        { group: 'geospatial', key: 'searchFailed', value: { en: 'No match' } },
      ]),
    ).toEqual({ geospatial: { searchFailed: { en: 'No match' } } });
  });
});
