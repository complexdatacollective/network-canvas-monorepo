import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import type { StageEditorHarness } from '../../../testing/renderStageEditor.tsx';
import { geospatialPrompts } from '../sections/geospatialPrompts.tsx';
import { mapAppearance } from '../sections/mapAppearance.tsx';
import { mapSource } from '../sections/mapSource.tsx';

const MapSource = mapSource();
const Prompts = geospatialPrompts();
const MapAppearance = mapAppearance();

/**
 * Every section a geospatial stage composes that is not one of the shared
 * five, in the order the editor lists them.
 *
 * All three are mounted together wherever one of them is under test, because
 * they own one `mapOptions` object between them: a mount holding only half of
 * it saves a `mapOptions` missing the other half's keys, and the refusal that
 * follows is the schema's rather than the control's.
 */
export const geospatialSections = (
  <>
    <MapSource />
    <Prompts />
    <MapAppearance />
  </>
);

/** The map settings of a saved stage, read as tolerantly as the editor reads them. */
export const mapOptionsOf = (
  stage: Record<string, unknown>,
): Record<string, unknown> => {
  const options = stage.mapOptions;
  if (typeof options !== 'object' || options === null) {
    throw new Error('the saved stage has no map options');
  }
  return options as Record<string, unknown>;
};

/**
 * Replaces one coordinate, whole.
 *
 * Set rather than typed, because these tests are about what the section does
 * with a FINISHED coordinate. What the control does with one as it is being
 * built — where a lone minus sign reads as no number at all — belongs to the
 * field, and `fields/geospatial/__tests__/MapCenterField.test.tsx` types one
 * in character by character.
 *
 * Waits for the editor to have been opened first, which `harness.user` does
 * for itself and `fireEvent` does not: until the host has answered the
 * acquire, the stage is on screen but not this researcher's, and every control
 * on it declines to be written.
 */
export const enterCoordinate = async (
  harness: StageEditorHarness,
  label: string,
  value: string,
): Promise<void> => {
  await harness.opened();
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

/**
 * Opens one prompt's dialog and answers with the dialog itself.
 *
 * Every query inside a prompt editor is made through this, so a wait covers
 * ONE thing: the dialog arriving. A `findByRole` at document level would be
 * waiting for the editor to boot AND the dialog to open AND that control's own
 * data, and a failure could not say which of the three did not happen — nor
 * could it tell a control inside the dialog from one of the same name on the
 * stage behind it.
 */
export const openPrompt = async (
  harness: StageEditorHarness,
  /** The row's own affordance, in the language the editor was opened in. */
  name: string,
): Promise<ReturnType<typeof within>> => {
  await harness.user.click(screen.getByRole('button', { name }));
  return within(await screen.findByRole('dialog'));
};

/**
 * Waits for the map layer to have been read, which is what puts the properties
 * its features carry into the recorded-property picker.
 *
 * Split out from the assertions that need it so a wait covers one thing: the
 * layer arriving. The picker renders a sentence in its place until then.
 */
export const awaitLayerRead = async (): Promise<HTMLElement> =>
  waitFor(() => screen.getByRole('combobox', { name: 'Recorded property' }));
