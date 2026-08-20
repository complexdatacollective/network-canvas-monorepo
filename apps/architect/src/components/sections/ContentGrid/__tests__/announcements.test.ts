import { describe, expect, it } from 'vitest';

import {
  type ContentDraftOutcome,
  getContentTypeChangedAnnouncement,
  getContentTypeChosenAnnouncement,
} from '../announcements';
import { CONTENT_SLOT_NAMES, type ContentSlotType } from '../itemTypes';
import { typeOptions } from '../options';

const ALL_TYPES = Object.keys(CONTENT_SLOT_NAMES) as ContentSlotType[];
const OUTCOMES: ContentDraftOutcome[] = ['restored', 'kept', 'empty'];

describe('content-type announcements', () => {
  // The announcement names the type the researcher just chose. If the control
  // and the announcement drifted apart, a screen-reader user would be told a
  // different type from the one the radio group shows.
  it.each(ALL_TYPES)(
    'names %s exactly as the type control labels it',
    (type: ContentSlotType) => {
      const label = typeOptions.find((option) => option.value === type)?.label;
      expect(label).toBeDefined();
      expect(getContentTypeChosenAnnouncement(type)).toContain(`${label}.`);
      for (const outcome of OUTCOMES) {
        expect(getContentTypeChangedAnnouncement(type, outcome)).toContain(
          `${label}.`,
        );
      }
    },
  );

  it('covers every type and outcome with a distinct whole sentence', () => {
    const messages = ALL_TYPES.flatMap((type) => [
      getContentTypeChosenAnnouncement(type),
      ...OUTCOMES.map((outcome) =>
        getContentTypeChangedAnnouncement(type, outcome),
      ),
    ]);

    expect(new Set(messages).size).toBe(messages.length);
    for (const message of messages) {
      expect(message.endsWith('.')).toBe(true);
      expect(message).not.toContain('undefined');
    }
  });

  it('only promises kept content for the outcome that has some', () => {
    expect(getContentTypeChangedAnnouncement('image', 'kept')).toContain(
      'is kept',
    );
    expect(getContentTypeChangedAnnouncement('image', 'empty')).not.toContain(
      'is kept',
    );
    expect(
      getContentTypeChangedAnnouncement('image', 'restored'),
    ).not.toContain('is kept');
  });
});
