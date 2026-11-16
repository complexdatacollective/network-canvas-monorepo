// Text a correction adds to the interview within a schema version is the
// interview's own: no protocol of that version can hold it, so a researcher
// cannot reword it until the next schema version names it as a text a
// protocol may hold. Until then it is a message of the interview whose id
// begins `interview.added.`, translated into every language Network Canvas
// supplies (`src/locales/added`), and shown in the language `resolveAddedText`
// chooses.
//
// To add one: declare the message where it is used, with an id that begins
// with the prefix; run `pnpm --filter @codaco/interview i18n:extract`, which
// writes its English into `src/locales/added/en.json`; translate it into the
// other eight catalogues there; and run `i18n:stamp`. The catalogue test
// fails until all nine hold it.
//
// This module imports nothing, so that the extraction script can read it.

/** What the id of every message a correction added begins with. */
const ADDED_TEXT_ID_PREFIX = 'interview.added.';

/** Whether `id` is the id of a message a correction added. */
export const isAddedTextId = (id: string): boolean =>
  id.startsWith(ADDED_TEXT_ID_PREFIX);
