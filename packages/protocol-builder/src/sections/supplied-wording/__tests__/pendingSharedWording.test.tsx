import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  type LocalizedString,
  suppliedInterfaceText,
} from '@codaco/protocol-validation';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { categoricalBinStageEditor } from '../../../editors/categorical-bin/CategoricalBinStageEditor.ts';
import { geospatialSections } from '../../../editors/geospatial/__tests__/geospatialFixtures.tsx';
import type { ProtocolLocalization } from '../../../localization/localizedText.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../testing/renderStageEditor.tsx';

/**
 * The shared words a stage brings into use that the protocol does not hold
 * yet. The list follows the open stage: such a word appears as the setting
 * that needs it is turned on, starts with Network Canvas's wording, can be
 * reworded at once, and is saved with the stage. Map search's "Search failed
 * message" is the worked example: a map stage needs it only while its search
 * is on, and the shared protocol's map stage has it off.
 */

const FIXTURE: ProtocolLocalization = {
  defaultLocale: 'en-US',
  locales: ['en-US'],
};
const ENGLISH_AND_SPANISH: ProtocolLocalization = {
  defaultLocale: 'en-US',
  locales: ['en-US', 'es'],
};
const SETTINGS = sectionId({ kind: 'settings' });
const MAP_STAGE = sectionId({ kind: 'stage', stageId: 'geospatial-1' });
const SEARCH_FAILED = 'Search failed message';
const COLLABORATOR = {
  sessionId: 'collaborator-tab',
  userId: 'collaborator',
  displayName: 'A collaborator',
};

const supplied = (
  localization: ProtocolLocalization,
  group = 'geospatial',
  key = 'searchFailed',
): LocalizedString => {
  const value = suppliedInterfaceText(group, key, localization);
  if (value === undefined) throw new Error(`no wording for ${group}.${key}`);
  return value;
};

/** One shared word as the protocol holds it. */
const heldWord = (
  harness: StageEditorHarness,
  group: string,
  key: string,
): unknown => {
  const settings = harness.protocolSections()[SETTINGS];
  const interfaceText = settings?.interfaceText as
    | Readonly<Record<string, Readonly<Record<string, unknown>>>>
    | undefined;
  return interfaceText?.[group]?.[key];
};

const mapStageAllowsSearch = (harness: StageEditorHarness): unknown => {
  const options = harness.protocolSections()[MAP_STAGE]?.mapOptions as
    | Readonly<Record<string, unknown>>
    | undefined;
  return options?.allowSearch;
};

const openMapStage = (localization?: ProtocolLocalization) =>
  renderStageEditor({
    stageId: 'geospatial-1',
    sections: geospatialSections,
    ...(localization === undefined ? {} : { localization }),
  });

/** Turns the wording section on, if it is not, and opens its shared part. */
const openSharedWording = async (harness: StageEditorHarness) => {
  const section = await screen.findByRole('switch', {
    name: 'Customize built-in wording',
  });
  if (section.getAttribute('aria-checked') !== 'true') {
    await harness.user.click(section);
  }
  await harness.user.click(
    await screen.findByRole('button', {
      name: 'Shared by every stage of this kind',
    }),
  );
  // The part's own words are on screen once it has opened.
  await screen.findByRole('textbox', { name: 'Map unavailable message' });
};

const toggleSearch = async (harness: StageEditorHarness) => {
  await harness.user.click(
    screen.getByRole('switch', { name: 'Allow location search' }),
  );
};

describe('a shared word the open stage brings into use', () => {
  it('is listed as its setting is turned on, with Network Canvas’s wording', async () => {
    const harness = openMapStage();
    await openSharedWording(harness);
    expect(heldWord(harness, 'geospatial', 'searchFailed')).toBeUndefined();
    expect(
      screen.queryByRole('textbox', { name: SEARCH_FAILED }),
    ).not.toBeInTheDocument();

    await toggleSearch(harness);

    const field = await screen.findByRole('textbox', { name: SEARCH_FAILED });
    expect(field).toHaveValue(supplied(FIXTURE)['en-US']);
    expect(field).toHaveAccessibleDescription(/saved when you save the stage/);
  });

  it('goes as its setting is turned off', async () => {
    const harness = openMapStage();
    await openSharedWording(harness);
    await toggleSearch(harness);
    await screen.findByRole('textbox', { name: SEARCH_FAILED });

    await toggleSearch(harness);

    await waitFor(() =>
      expect(
        screen.queryByRole('textbox', { name: SEARCH_FAILED }),
      ).not.toBeInTheDocument(),
    );
  });

  it('is saved with the stage, in the language being edited, keeping Network Canvas’s wording in the others', async () => {
    const harness = openMapStage(ENGLISH_AND_SPANISH);
    await openSharedWording(harness);
    await toggleSearch(harness);
    const field = await screen.findByRole('textbox', { name: SEARCH_FAILED });
    const group = field.closest('[data-field-path]');
    if (!(group instanceof HTMLElement)) throw new Error('no field container');

    await harness.user.click(
      within(group).getByRole('button', { name: /Editing language/ }),
    );
    await harness.user.click(
      await screen.findByRole('menuitemradio', { name: /^español/ }),
    );
    const spanish = within(group).getByRole('textbox', { name: SEARCH_FAILED });
    await harness.user.clear(spanish);
    await harness.user.type(spanish, 'Ningún lugar coincide');
    // Not written while the stage is open: the protocol does not use it yet.
    await harness.user.tab();
    expect(heldWord(harness, 'geospatial', 'searchFailed')).toBeUndefined();

    const saved = await harness.submit();

    expect(saved).not.toBeNull();
    expect(mapStageAllowsSearch(harness)).toBe(true);
    expect(heldWord(harness, 'geospatial', 'searchFailed')).toEqual({
      'en-US': supplied(ENGLISH_AND_SPANISH)['en-US'],
      'es': 'Ningún lugar coincide',
    });
  });

  it('is written with the stage in one change', async () => {
    const harness = openMapStage();
    await openSharedWording(harness);
    await toggleSearch(harness);
    const field = await screen.findByRole('textbox', { name: SEARCH_FAILED });
    await harness.user.clear(field);
    await harness.user.type(field, 'No place matched');
    const before = harness.host.store.read(SETTINGS).revision.sequence;

    await harness.submit();

    const stage = harness.host.store.read(MAP_STAGE).revision.sequence;
    const settings = harness.host.store.read(SETTINGS).revision.sequence;
    expect(settings).toBeGreaterThan(before);
    expect(settings).toBe(stage);
    expect(heldWord(harness, 'geospatial', 'searchFailed')).toEqual({
      'en-US': 'No place matched',
    });
  });

  it('is thrown away with the stage’s other changes when the editor is cancelled', async () => {
    const harness = openMapStage();
    await openSharedWording(harness);
    await toggleSearch(harness);
    const field = await screen.findByRole('textbox', { name: SEARCH_FAILED });
    await harness.user.clear(field);
    await harness.user.type(field, 'No place matched');
    await harness.user.tab();

    await harness.cancel();

    expect(heldWord(harness, 'geospatial', 'searchFailed')).toBeUndefined();
    expect(mapStageAllowsSearch(harness)).not.toBe(true);
  });

  it('keeps the researcher’s wording while its setting is turned off and on again', async () => {
    const harness = openMapStage();
    await openSharedWording(harness);
    await toggleSearch(harness);
    const field = await screen.findByRole('textbox', { name: SEARCH_FAILED });
    await harness.user.clear(field);
    await harness.user.type(field, 'No place matched');
    await harness.user.tab();

    await toggleSearch(harness);
    await waitFor(() =>
      expect(
        screen.queryByRole('textbox', { name: SEARCH_FAILED }),
      ).not.toBeInTheDocument(),
    );
    await toggleSearch(harness);

    expect(
      await screen.findByRole('textbox', { name: SEARCH_FAILED }),
    ).toHaveValue('No place matched');
    await harness.submit();
    expect(heldWord(harness, 'geospatial', 'searchFailed')).toEqual({
      'en-US': 'No place matched',
    });
  });

  it('is not written when its setting is turned off before the stage is saved', async () => {
    const harness = openMapStage();
    await openSharedWording(harness);
    await toggleSearch(harness);
    const field = await screen.findByRole('textbox', { name: SEARCH_FAILED });
    await harness.user.clear(field);
    await harness.user.type(field, 'No place matched');
    await toggleSearch(harness);

    expect(await harness.submit()).not.toBeNull();
    expect(heldWord(harness, 'geospatial', 'searchFailed')).toBeUndefined();
  });

  it('refuses the save while it has no words in the default language', async () => {
    const harness = openMapStage();
    await openSharedWording(harness);
    await toggleSearch(harness);
    const field = await screen.findByRole('textbox', { name: SEARCH_FAILED });
    await harness.user.clear(field);

    expect(await harness.submit()).toBeNull();
    expect(field).toHaveAccessibleDescription(/required/i);
    expect(mapStageAllowsSearch(harness)).not.toBe(true);
    expect(heldWord(harness, 'geospatial', 'searchFailed')).toBeUndefined();
  });
});

it('refuses the save over wording left empty in a part that was then closed, and opens the part again', async () => {
  const harness = openMapStage();
  await openSharedWording(harness);
  await toggleSearch(harness);
  const field = await screen.findByRole('textbox', { name: SEARCH_FAILED });
  await harness.user.clear(field);
  const part = screen.getByRole('button', {
    name: 'Shared by every stage of this kind',
  });
  await harness.user.click(part);
  await waitFor(() =>
    expect(
      screen.queryByRole('textbox', { name: SEARCH_FAILED }),
    ).not.toBeInTheDocument(),
  );

  expect(await harness.submit()).toBeNull();
  expect(
    await screen.findByRole('textbox', { name: SEARCH_FAILED }),
  ).toHaveValue('');
  expect(mapStageAllowsSearch(harness)).not.toBe(true);
  expect(heldWord(harness, 'geospatial', 'searchFailed')).toBeUndefined();
});

describe('a shared word the protocol already holds', () => {
  it('is still written straight away, as its field is left', async () => {
    const harness = openMapStage();
    await openSharedWording(harness);
    const field = screen.getByRole('textbox', {
      name: 'Map unavailable message',
    });
    await waitFor(() => expect(field).not.toHaveAttribute('readonly'));
    expect(field).not.toHaveAccessibleDescription(
      /saved when you save the stage/,
    );

    await harness.user.clear(field);
    await harness.user.type(field, 'The map is not available');
    await harness.user.tab();

    await waitFor(() =>
      expect(heldWord(harness, 'geospatial', 'mapUnavailable')).toEqual({
        'en-US': 'The map is not available',
      }),
    );
    expect(heldWord(harness, 'geospatial', 'searchFailed')).toBeUndefined();
  });
});

describe('a new stage of a kind the protocol has none of', () => {
  it('shows the shared words its kind brings in, to be saved with it', async () => {
    const harness = renderStageEditor({
      create: { type: 'CategoricalBin', position: 0 },
      registry: categoricalBinStageEditor,
    });
    // The protocol as it would be without its one Categorical Bin: the stage
    // goes, and with it the words only a Categorical Bin shows.
    expect(
      harness.host.store.deleteStage('categorical-bin-1', COLLABORATOR).status,
    ).toBe('applied');
    const settings = harness.host.store.read(SETTINGS).document;
    const { categoricalBin: _bin, ...interfaceText } =
      settings.interfaceText as Readonly<Record<string, unknown>>;
    harness.host.store.applyAsCollaborator(SETTINGS, {
      ...settings,
      interfaceText,
    });

    const section = await screen.findByRole('switch', {
      name: 'Customize built-in wording',
    });
    if (section.getAttribute('aria-checked') !== 'true') {
      await harness.user.click(section);
    }
    const shared = screen.queryByRole('button', {
      name: 'Shared by every stage of this kind',
    });
    if (shared !== null) await harness.user.click(shared);
    const field = await screen.findByRole('textbox', {
      name: 'Place here label',
    });
    expect(field).toHaveValue(
      supplied(FIXTURE, 'categoricalBin', 'placeHere')['en-US'],
    );
    expect(field).toHaveAccessibleDescription(/saved when you save the stage/);
  });
});
