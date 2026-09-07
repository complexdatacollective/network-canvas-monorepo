import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import MapAppearanceSection from '../../../sections/geospatial/MapAppearanceSection.tsx';
import MapSourceSection from '../../../sections/geospatial/MapSourceSection.tsx';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../testing/renderStageEditor.tsx';

/**
 * The fixture stage opens on New York, so every reading below starts from a
 * centre that is already set — which is the case the field gets wrong.
 */
const FIXTURE_LONGITUDE = -74;
const FIXTURE_LATITUDE = 40.7;

/**
 * `mapOptions` is one object owned by two sections, so both are mounted: a
 * save writes the whole object, and the source section's keys would otherwise
 * leave the document and be refused by the schema rather than by the control
 * under test.
 */
const openEditor = () =>
  renderStageEditor({
    stageId: 'geospatial-1',
    sections: (
      <>
        <MapSourceSection />
        <MapAppearanceSection />
      </>
    ),
  });

const longitudeInput = (): HTMLElement => screen.getByLabelText('Longitude');
const latitudeInput = (): HTMLElement => screen.getByLabelText('Latitude');

/** The centre the host was asked to commit. */
const savedCenter = async (harness: StageEditorHarness): Promise<unknown> => {
  const request = await harness.submit();
  if (request === null) throw new Error('the stage did not save');
  const options = request.stageDocument.mapOptions;
  if (typeof options !== 'object' || options === null) {
    throw new Error('the saved stage has no map options');
  }
  return (options as Record<string, unknown>).center;
};

/**
 * A coordinate is entered one character at a time, and the first character of
 * half the world is a minus sign.
 *
 * A number input reports nothing at all for a value it cannot read as a
 * number, so every intermediate reading of `-122.4` — `-`, `-1`, `-12` — is
 * either empty or a number the researcher is still building. What the field
 * stores has to be the number, and what it SHOWS has to be the text, or the
 * control rewrites itself under the cursor: the minus sign of `-122.4`
 * disappears the moment the first digit lands on it, and a stage saved from
 * that control points at the wrong hemisphere.
 */
describe('typing a coordinate into the starting centre', () => {
  it('builds a western longitude out of the characters typed into it', async () => {
    const harness = openEditor();

    await harness.user.clear(longitudeInput());
    await harness.user.type(longitudeInput(), '-122.4');

    expect(longitudeInput()).toHaveValue(-122.4);
    expect(await savedCenter(harness)).toEqual([-122.4, FIXTURE_LATITUDE]);
  });

  /**
   * The same reading, entered the way a researcher corrects a coordinate that
   * is already there: select the lot, type over it.
   */
  it('builds one typed over the coordinate already in the control', async () => {
    const harness = openEditor();

    await harness.user.tripleClick(longitudeInput());
    await harness.user.type(longitudeInput(), '-122.4', { skipClick: true });

    expect(longitudeInput()).toHaveValue(-122.4);
    expect(await savedCenter(harness)).toEqual([-122.4, FIXTURE_LATITUDE]);
  });

  /**
   * A southern latitude is the same problem on the other control, and the two
   * are one value — so building one must not disturb the other.
   */
  it('builds a southern latitude without touching the longitude', async () => {
    const harness = openEditor();

    await harness.user.clear(latitudeInput());
    await harness.user.type(latitudeInput(), '-33.9');

    expect(latitudeInput()).toHaveValue(-33.9);
    expect(await savedCenter(harness)).toEqual([FIXTURE_LONGITUDE, -33.9]);
  });
});

/**
 * A centre is a PAIR, so half of one is not a centre.
 *
 * Emptying a coordinate is how a researcher says they have not chosen a
 * starting view after all, and the field has to let them: the value it stores
 * stops being a centre, its own `required` says so, and the coordinate they
 * already entered stays in front of them to finish rather than being taken
 * away.
 */
describe('clearing a coordinate of the starting centre', () => {
  /**
   * The refusal is the whole point: an unreadable coordinate stored as zero
   * would save silently, and zero is a real place — the Gulf of Guinea — so
   * the stage would open somewhere the researcher never chose with nothing on
   * screen having said so.
   */
  it('refuses the save, and says the starting centre is required', async () => {
    const harness = openEditor();

    await harness.user.clear(longitudeInput());

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText('This field is required.'),
    ).toBeInTheDocument();
  });

  it('leaves the coordinate the researcher did enter on screen', async () => {
    const harness = openEditor();

    await harness.user.clear(longitudeInput());

    expect(longitudeInput()).toHaveValue(null);
    expect(latitudeInput()).toHaveValue(FIXTURE_LATITUDE);
  });
});

/**
 * Three numbers describe the starting view — longitude, latitude and zoom —
 * so the section carries six stepper buttons, and a screen reader announces a
 * button by its name alone. Left to the shared field's default, all six are
 * called "Increase value" or "Decrease value": the control that moves the map
 * east cannot be told from the one that zooms it in without seeing where it
 * sits on the page.
 */
describe('the steppers beside the starting view’s numbers', () => {
  it('names each one for the number it moves', () => {
    openEditor();

    const stepperNames = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? '')
      .filter((name) => /^(Increase|Decrease) /.test(name));

    expect(stepperNames).toHaveLength(6);
    expect(new Set(stepperNames)).toEqual(
      new Set([
        'Increase longitude',
        'Decrease longitude',
        'Increase latitude',
        'Decrease latitude',
        'Increase zoom',
        'Decrease zoom',
      ]),
    );
  });
});
