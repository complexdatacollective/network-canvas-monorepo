import { screen, waitFor, within } from '@testing-library/react';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  InvalidShape,
  PromotionFailed,
  ProtocolNotFound,
  SectionExists,
  SectionNotFound,
  SectionsLocked,
} from '@codaco/protocol-builder-core/contract/errors';
import { HostUnauthorized } from '@codaco/protocol-builder-core/contract/session';
import {
  type InterfaceTextUpdate,
  interfaceTextWithUpdates,
  type LocalizedString,
  suppliedInterfaceText,
} from '@codaco/protocol-validation';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { categoricalBinStageEditor } from '../../../editors/categorical-bin/CategoricalBinStageEditor.ts';
import { geospatialSections } from '../../../editors/geospatial/__tests__/geospatialFixtures.tsx';
import type { ProtocolLocalization } from '../../../localization/localizedText.ts';
import type { ProtocolBuilderAdapter } from '../../../state/context.ts';
import { beforeCall } from '../../../testing/host/beforeCall.ts';
import type { InMemoryHost } from '../../../testing/host/createInMemoryHost.ts';
import { loadFixtureStage } from '../../../testing/protocolFixture.ts';
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

/** The stage ids in the protocol's stage order. */
const stageOrder = (harness: StageEditorHarness): unknown[] => {
  const stages =
    harness.protocolSections()[sectionId({ kind: 'stageOrder' })]?.stages;
  return Array.isArray(stages) ? stages : [];
};

/**
 * A transport that drops the answer to the first create after the host has
 * made it, so the editor is told the add failed although it happened, and
 * records the request id of every create it carries.
 */
function withTheFirstCreateAnswerLost(): Readonly<{
  adapter: (host: InMemoryHost) => ProtocolBuilderAdapter;
  requestIds: () => readonly string[];
}> {
  const requestIds: string[] = [];
  let lost = false;
  return {
    requestIds: () => requestIds,
    adapter: (host) =>
      host.adapterWith({
        Create: (input) => {
          requestIds.push(input.requestId);
          return Effect.flatMap(host.handle.Create(input), (answer) => {
            if (lost) return Effect.succeed(answer);
            lost = true;
            return Effect.die(
              new Error('the socket dropped before the answer arrived'),
            );
          });
        },
      }),
  };
}

describe('a new stage saved with its shared words, whose answer is lost', () => {
  it('is added once when the researcher saves again after the protocol has taken its words', async () => {
    const transport = withTheFirstCreateAnswerLost();
    const map = loadFixtureStage('geospatial-1');
    const mapOptions = map.fields.mapOptions as Readonly<
      Record<string, unknown>
    >;
    const harness = renderStageEditor({
      create: {
        type: 'Geospatial',
        position: 1,
        fields: {
          ...map.fields,
          mapOptions: { ...mapOptions, allowSearch: true },
        },
      },
      sections: geospatialSections,
      adapter: transport.adapter,
    });
    const before = stageOrder(harness).length;
    await openSharedWording(harness);
    expect(
      await screen.findByRole('textbox', { name: SEARCH_FAILED }),
    ).toHaveAccessibleDescription(/saved when you save the stage/);

    // The host made the stage and wrote its words; the editor was told the
    // add failed, and has since read the words as the protocol's.
    expect(await harness.submit()).toBeNull();
    expect(stageOrder(harness)).toHaveLength(before + 1);
    expect(heldWord(harness, 'geospatial', 'searchFailed')).toEqual(
      supplied(FIXTURE),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('textbox', { name: SEARCH_FAILED }),
      ).not.toHaveAccessibleDescription(/saved when you save the stage/),
    );

    expect(await harness.submit()).not.toBeNull();

    // Asked again under the same id, so the host answered with the stage it
    // had already made rather than making a second one.
    expect(transport.requestIds()).toHaveLength(2);
    expect(new Set(transport.requestIds()).size).toBe(1);
    expect(stageOrder(harness)).toHaveLength(before + 1);
  });
});

describe('a stage saved with its shared words, whose answer is lost', () => {
  it('is written once when the researcher saves again after the protocol has taken its words', async () => {
    const requestIds: string[] = [];
    let lost = false;
    const harness = renderStageEditor({
      stageId: 'geospatial-1',
      sections: geospatialSections,
      adapter: (host) =>
        host.adapterWith({
          Submit: (input) => {
            requestIds.push(input.requestId);
            return Effect.flatMap(host.handle.Submit(input), (answer) => {
              if (lost) return Effect.succeed(answer);
              lost = true;
              return Effect.die(
                new Error('the socket dropped before the answer arrived'),
              );
            });
          },
        }),
    });
    await openSharedWording(harness);
    await toggleSearch(harness);
    await screen.findByRole('textbox', { name: SEARCH_FAILED });

    // The host wrote the stage and its words; the editor was told the save
    // failed, and has since read the words as the protocol's.
    expect(await harness.submit()).toBeNull();
    const written = harness.host.store.read(SETTINGS).revision.sequence;
    expect(heldWord(harness, 'geospatial', 'searchFailed')).toEqual(
      supplied(FIXTURE),
    );

    expect(await harness.submit()).not.toBeNull();

    // Asked again under the same id, so the host answered with what it had
    // already written rather than writing it again.
    expect(requestIds).toHaveLength(2);
    expect(new Set(requestIds).size).toBe(1);
    expect(harness.host.store.read(SETTINGS).revision.sequence).toBe(written);
  });
});

/** A collaborator saving one shared word, as the settings' own write. */
const collaboratorSaves = (
  harness: StageEditorHarness,
  value: LocalizedString,
) => {
  const settings = harness.host.store.read(SETTINGS).document;
  harness.host.store.applyAsCollaborator(SETTINGS, {
    ...settings,
    interfaceText: interfaceTextWithUpdates(settings.interfaceText, [
      { group: 'geospatial', key: 'searchFailed', value },
    ]),
  });
};

describe('a shared word a collaborator saves while this stage still holds it', () => {
  it('keeps the researcher’s wording, written straight away as the protocol’s', async () => {
    const harness = openMapStage();
    await openSharedWording(harness);
    await toggleSearch(harness);
    const field = await screen.findByRole('textbox', { name: SEARCH_FAILED });
    await harness.user.clear(field);
    await harness.user.type(field, 'No place matched');
    await harness.user.tab();

    collaboratorSaves(harness, { 'en-US': 'Their wording' });

    await waitFor(() =>
      expect(heldWord(harness, 'geospatial', 'searchFailed')).toEqual({
        'en-US': 'No place matched',
      }),
    );
    const now = screen.getByRole('textbox', { name: SEARCH_FAILED });
    expect(now).toHaveValue('No place matched');
    expect(now).not.toHaveAccessibleDescription(
      /saved when you save the stage/,
    );
    expect(await harness.submit()).not.toBeNull();
    expect(heldWord(harness, 'geospatial', 'searchFailed')).toEqual({
      'en-US': 'No place matched',
    });
  });

  it('takes the collaborator’s wording when the researcher had not changed it', async () => {
    const harness = openMapStage();
    await openSharedWording(harness);
    await toggleSearch(harness);
    expect(
      await screen.findByRole('textbox', { name: SEARCH_FAILED }),
    ).toHaveValue(supplied(FIXTURE)['en-US']);

    collaboratorSaves(harness, { 'en-US': 'Their wording' });

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: SEARCH_FAILED })).toHaveValue(
        'Their wording',
      ),
    );
    expect(await harness.submit()).not.toBeNull();
    expect(heldWord(harness, 'geospatial', 'searchFailed')).toEqual({
      'en-US': 'Their wording',
    });
  });
});

describe('a shared word a collaborator saves while the researcher is still editing it', () => {
  it('keeps wording that cannot be saved yet on screen, as their draft of the shared word', async () => {
    const harness = openMapStage();
    await openSharedWording(harness);
    await toggleSearch(harness);
    const field = await screen.findByRole('textbox', { name: SEARCH_FAILED });
    await harness.user.clear(field);
    await harness.user.tab();

    collaboratorSaves(harness, { 'en-US': 'Their wording' });

    // The protocol holds the entry now, so its field says what a shared
    // word's does, and the researcher's cleared field is still theirs.
    await waitFor(() =>
      expect(
        screen.getByRole('textbox', { name: SEARCH_FAILED }),
      ).not.toHaveAccessibleDescription(/saved when you save the stage/),
    );
    const now = screen.getByRole('textbox', { name: SEARCH_FAILED });
    expect(now).toHaveValue('');
    expect(
      screen.getByText(
        'These words appear on every stage of this kind. Changes to them are saved straight away.',
      ),
    ).toBeInTheDocument();
    expect(heldWord(harness, 'geospatial', 'searchFailed')).toEqual({
      'en-US': 'Their wording',
    });

    // Not dropped by saving the stage: the save is refused over it.
    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByRole('textbox', { name: SEARCH_FAILED }),
    ).toHaveAccessibleDescription(/required/i);
    expect(heldWord(harness, 'geospatial', 'searchFailed')).toEqual({
      'en-US': 'Their wording',
    });

    // Made good and left, it is written as a shared word's change is.
    await harness.user.type(
      screen.getByRole('textbox', { name: SEARCH_FAILED }),
      'No place matched',
    );
    await harness.user.tab();
    await waitFor(() =>
      expect(heldWord(harness, 'geospatial', 'searchFailed')).toEqual({
        'en-US': 'No place matched',
      }),
    );
  });

  it('refuses the stage save over it while its part is closed, and opens the part on it', async () => {
    const harness = openMapStage();
    await openSharedWording(harness);
    await toggleSearch(harness);
    await harness.user.clear(
      await screen.findByRole('textbox', { name: SEARCH_FAILED }),
    );
    await harness.user.click(
      screen.getByRole('button', {
        name: 'Shared by every stage of this kind',
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('textbox', { name: SEARCH_FAILED }),
      ).not.toBeInTheDocument(),
    );

    collaboratorSaves(harness, { 'en-US': 'Their wording' });
    await waitFor(() =>
      expect(heldWord(harness, 'geospatial', 'searchFailed')).toEqual({
        'en-US': 'Their wording',
      }),
    );

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByRole('textbox', { name: SEARCH_FAILED }),
    ).toHaveValue('');
    expect(heldWord(harness, 'geospatial', 'searchFailed')).toEqual({
      'en-US': 'Their wording',
    });
  });

  it('leaves the field, its text and the caret where they were while it is being typed into', async () => {
    const harness = openMapStage();
    await openSharedWording(harness);
    await toggleSearch(harness);
    const field = await screen.findByRole('textbox', { name: SEARCH_FAILED });
    await harness.user.clear(field);
    await harness.user.type(field, 'No place');

    collaboratorSaves(harness, { 'en-US': 'Their wording' });

    await waitFor(() =>
      expect(
        screen.getByRole('textbox', { name: SEARCH_FAILED }),
      ).not.toHaveAccessibleDescription(/saved when you save the stage/),
    );
    const now = screen.getByRole('textbox', { name: SEARCH_FAILED });
    expect(now).toBe(field);
    expect(now).toHaveFocus();
    expect(now).toHaveValue('No place');
    expect((now as HTMLInputElement).selectionStart).toBe('No place'.length);
    // Not written while it is still being typed.
    expect(heldWord(harness, 'geospatial', 'searchFailed')).toEqual({
      'en-US': 'Their wording',
    });

    await harness.user.keyboard(' matched');
    await harness.user.tab();
    await waitFor(() =>
      expect(heldWord(harness, 'geospatial', 'searchFailed')).toEqual({
        'en-US': 'No place matched',
      }),
    );
  });
});

describe('a refused save over a shared word held with the stage', () => {
  it('takes focus to the field that answers for it', async () => {
    const harness = openMapStage();
    await openSharedWording(harness);
    await toggleSearch(harness);
    const field = await screen.findByRole('textbox', { name: SEARCH_FAILED });
    await harness.user.clear(field);

    expect(await harness.submit()).toBeNull();
    await waitFor(() =>
      expect(
        screen.getByRole('textbox', { name: SEARCH_FAILED }),
      ).toHaveFocus(),
    );
  });

  it('takes focus to it when its part was closed', async () => {
    const harness = openMapStage();
    await openSharedWording(harness);
    await toggleSearch(harness);
    await harness.user.clear(
      await screen.findByRole('textbox', { name: SEARCH_FAILED }),
    );
    await harness.user.click(
      screen.getByRole('button', {
        name: 'Shared by every stage of this kind',
      }),
    );

    expect(await harness.submit()).toBeNull();
    await waitFor(() =>
      expect(
        screen.getByRole('textbox', { name: SEARCH_FAILED }),
      ).toHaveFocus(),
    );
  });

  it('keeps its part open while the refusal stands, so a second save shows it too', async () => {
    const harness = openMapStage();
    await openSharedWording(harness);
    await toggleSearch(harness);
    await harness.user.clear(
      await screen.findByRole('textbox', { name: SEARCH_FAILED }),
    );
    const part = screen.getByRole('button', {
      name: 'Shared by every stage of this kind',
    });
    expect(await harness.submit()).toBeNull();

    await harness.user.click(part);
    expect(
      screen.getByRole('textbox', { name: SEARCH_FAILED }),
    ).toBeInTheDocument();
    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByRole('textbox', { name: SEARCH_FAILED }),
    ).toBeInTheDocument();
  });
});

describe('switching the wording section off', () => {
  it('asks first, and puts back Network Canvas’s wording for a shared word its setting has hidden', async () => {
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

    const section = screen.getByRole('switch', {
      name: 'Customize built-in wording',
    });
    await harness.user.click(section);
    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Use Network Canvas’s wording',
      }),
    );
    await waitFor(() =>
      expect(section).toHaveAttribute('aria-checked', 'false'),
    );

    await toggleSearch(harness);
    expect(await harness.submit()).not.toBeNull();
    expect(heldWord(harness, 'geospatial', 'searchFailed')).toEqual(
      supplied(FIXTURE),
    );
  });
});

/**
 * A save the host refused, for a reason it gave, is over: nothing it carried
 * was written, so the next save is worked out again from the protocol as it is
 * by then. Only a save whose answer never came is asked again as it was.
 */
describe('a shared word held with a stage whose save was refused', () => {
  /** Every word a save carried, by attempt. */
  const wordsSent = (sent: readonly (readonly InterfaceTextUpdate[])[]) =>
    sent.map((words) => words.map(({ group, key }) => `${group}.${key}`));

  it('takes the wording a collaborator saved while they held the settings, when the researcher had not changed it', async () => {
    const sent: (readonly InterfaceTextUpdate[])[] = [];
    const harness = renderStageEditor({
      stageId: 'geospatial-1',
      sections: geospatialSections,
      adapter: (host) =>
        host.adapterWith({
          Submit: (input) => {
            sent.push(input.interfaceText ?? []);
            return host.handle.Submit(input);
          },
        }),
    });
    await openSharedWording(harness);
    await toggleSearch(harness);
    await screen.findByRole('textbox', { name: SEARCH_FAILED });
    const collaborator = harness.host.asCollaborator(COLLABORATOR);
    const settingsLock = {
      protocolId: harness.host.protocolId,
      sectionId: SETTINGS,
    };
    await collaborator.rpcCall('AcquireLock', settingsLock);

    expect(await harness.submit()).toBeNull();
    expect(mapStageAllowsSearch(harness)).not.toBe(true);

    collaboratorSaves(harness, { 'en-US': 'Their wording' });
    await collaborator.rpcCall('ReleaseLock', settingsLock);

    expect(await harness.submit()).not.toBeNull();
    expect(mapStageAllowsSearch(harness)).toBe(true);
    expect(heldWord(harness, 'geospatial', 'searchFailed')).toEqual({
      'en-US': 'Their wording',
    });
    expect(wordsSent(sent)).toEqual([['geospatial.searchFailed'], []]);
  });

  it('still saves the researcher’s own wording for it, as theirs over the collaborator’s', async () => {
    const harness = openMapStage();
    await openSharedWording(harness);
    await toggleSearch(harness);
    const field = await screen.findByRole('textbox', { name: SEARCH_FAILED });
    await harness.user.clear(field);
    await harness.user.type(field, 'No place matched');
    await harness.user.tab();
    const collaborator = harness.host.asCollaborator(COLLABORATOR);
    const settingsLock = {
      protocolId: harness.host.protocolId,
      sectionId: SETTINGS,
    };
    await collaborator.rpcCall('AcquireLock', settingsLock);

    expect(await harness.submit()).toBeNull();

    collaboratorSaves(harness, { 'en-US': 'Their wording' });
    await collaborator.rpcCall('ReleaseLock', settingsLock);
    await waitFor(() =>
      expect(
        screen.getByRole('textbox', { name: SEARCH_FAILED }),
      ).not.toHaveAccessibleDescription(/saved when you save the stage/),
    );

    expect(await harness.submit()).not.toBeNull();
    expect(mapStageAllowsSearch(harness)).toBe(true);
    expect(heldWord(harness, 'geospatial', 'searchFailed')).toEqual({
      'en-US': 'No place matched',
    });
    expect(screen.getByRole('textbox', { name: SEARCH_FAILED })).toHaveValue(
      'No place matched',
    );
  });

  const failure = {
    reason: 'promotion-failed',
    message: 'the files could not be committed',
    retryable: true,
  } as const;

  /**
   * A transport whose first `call` comes back refused, as the host would
   * answer it: the request never reaches the host, so nothing is written, and
   * every request that does reach it is recorded with the words it carried.
   */
  const refusingTheFirst = (
    call: 'Submit' | 'Create',
    refusal: () => Error,
  ): Readonly<{
    adapter: (host: InMemoryHost) => ProtocolBuilderAdapter;
    reached: () => readonly string[][];
  }> => {
    const sent: (readonly InterfaceTextUpdate[])[] = [];
    let refused = false;
    return {
      reached: () => wordsSent(sent),
      adapter: (host) => {
        const inner = host.adapterWith({
          Submit: (input) => {
            sent.push(input.interfaceText ?? []);
            return host.handle.Submit(input);
          },
          Create: (input) => {
            sent.push(input.interfaceText ?? []);
            return host.handle.Create(input);
          },
        });
        return beforeCall(inner, (tag) => {
          if (tag !== call || refused) return undefined;
          refused = true;
          return Promise.reject(refusal());
        });
      },
    };
  };

  /** Every answer a submit can be refused with that leaves the draft open. */
  const submitRefusals = {
    SectionsLocked: () => new SectionsLocked({ blocked: [] }),
    PromotionFailed: () => new PromotionFailed({ failure }),
    ProtocolNotFound: () => new ProtocolNotFound({ protocolId: 'protocol' }),
    SectionNotFound: () => new SectionNotFound({ sectionId: MAP_STAGE }),
    HostUnauthorized: () => new HostUnauthorized({}),
  };

  it.each(Object.entries(submitRefusals))(
    'takes the collaborator’s wording after a stage save refused with %s',
    async (_name, refusal) => {
      const transport = refusingTheFirst('Submit', refusal);
      const harness = renderStageEditor({
        stageId: 'geospatial-1',
        sections: geospatialSections,
        adapter: transport.adapter,
      });
      await openSharedWording(harness);
      await toggleSearch(harness);
      await screen.findByRole('textbox', { name: SEARCH_FAILED });

      expect(await harness.submit()).toBeNull();
      expect(mapStageAllowsSearch(harness)).not.toBe(true);
      collaboratorSaves(harness, { 'en-US': 'Their wording' });

      expect(await harness.submit()).not.toBeNull();
      expect(mapStageAllowsSearch(harness)).toBe(true);
      expect(heldWord(harness, 'geospatial', 'searchFailed')).toEqual({
        'en-US': 'Their wording',
      });
      expect(transport.reached()).toEqual([[]]);
    },
  );

  /** Every answer an add can be refused with. */
  const createRefusals = {
    SectionsLocked: () => new SectionsLocked({ blocked: [] }),
    PromotionFailed: () => new PromotionFailed({ failure }),
    InvalidShape: () => new InvalidShape({ sectionId: SETTINGS, issues: [] }),
    SectionExists: () => new SectionExists({ sectionId: SETTINGS }),
    ProtocolNotFound: () => new ProtocolNotFound({ protocolId: 'protocol' }),
    SectionNotFound: () => new SectionNotFound({ sectionId: SETTINGS }),
    HostUnauthorized: () => new HostUnauthorized({}),
  };

  it.each(Object.entries(createRefusals))(
    'takes the collaborator’s wording after adding the stage was refused with %s',
    async (_name, refusal) => {
      const transport = refusingTheFirst('Create', refusal);
      const map = loadFixtureStage('geospatial-1');
      const mapOptions = map.fields.mapOptions as Readonly<
        Record<string, unknown>
      >;
      const harness = renderStageEditor({
        create: {
          type: 'Geospatial',
          position: 1,
          fields: {
            ...map.fields,
            mapOptions: { ...mapOptions, allowSearch: true },
          },
        },
        sections: geospatialSections,
        adapter: transport.adapter,
      });
      const before = stageOrder(harness).length;
      await openSharedWording(harness);
      await screen.findByRole('textbox', { name: SEARCH_FAILED });

      expect(await harness.submit()).toBeNull();
      expect(stageOrder(harness)).toHaveLength(before);
      collaboratorSaves(harness, { 'en-US': 'Their wording' });

      expect(await harness.submit()).not.toBeNull();
      expect(stageOrder(harness)).toHaveLength(before + 1);
      expect(heldWord(harness, 'geospatial', 'searchFailed')).toEqual({
        'en-US': 'Their wording',
      });
      expect(transport.reached()).toEqual([[]]);
    },
  );
});
