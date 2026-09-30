// Judging whether a page is actually rendered in the language that was asked
// for, from the catalogs the build ships.
//
// Pure, so the oracle is exercised on synthetic renderings rather than only
// through a browser
// (`scripts/release-test/fresco-release-test-lane-contracts.test.mjs`).
//
// Deliberately not a list of expected Spanish sentences. A hand-picked
// sentence goes stale the moment a translation is improved, and a check that
// looks for one string proves one string. This instead compares the SAME page
// rendered twice: every message whose English the page carried must be gone,
// and its Spanish must be there. A page that fell back to English fails on
// every one of them, and a page that never rendered fails the floor.
import { readFileSync } from 'node:fs';

/**
 * Loads a Fresco message catalog.
 *
 * The English catalog is the source shape (`{ id: { defaultMessage } }`) and a
 * translated one is flat (`{ id: string }`), so both are normalised to
 * id → string here rather than at every call site.
 */
export function loadCatalog(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const catalog = {};
  for (const [id, value] of Object.entries(raw))
    catalog[id] =
      typeof value === 'string' ? value : (value?.defaultMessage ?? '');
  return catalog;
}

/**
 * Messages worth comparing: long enough to be distinctive, actually different
 * between the two languages, and free of placeholders — an interpolated
 * message never appears verbatim on a page, so looking for one would report a
 * correctly translated page as untranslated.
 */
export function comparableMessages(
  english,
  translated,
  { minLength = 12 } = {},
) {
  const ids = [];
  for (const [id, source] of Object.entries(english)) {
    const target = translated[id];
    if (typeof target !== 'string' || target.length < minLength) continue;
    if (source.length < minLength || source === target) continue;
    if (/[{}<>]/.test(source) || /[{}<>]/.test(target)) continue;
    ids.push(id);
  }
  return ids;
}

/**
 * Compares one page rendered in each language.
 *
 * `floor` is the positive control: without a minimum number of messages that
 * were demonstrably on the English page, "every English message is gone" is
 * satisfied by a blank page, an error screen, or a page whose text nobody
 * managed to read.
 */
export function judgeRendering({
  englishText,
  translatedText,
  english,
  translated,
  floor = 3,
  what = 'the page',
  preserved = [],
}) {
  const ids = comparableMessages(english, translated).filter(
    (id) => !preserved.includes(id),
  );
  const present = ids.filter((id) => englishText.includes(english[id]));

  // The other half of the claim, and the reason `preserved` exists rather than
  // being an exclusion list: some of these strings were written into the
  // database when a row was created — an anonymous participant's identifier is
  // the example — and they are research data from that moment on. Switching
  // language must not rewrite them, so where the English rendering had one the
  // translated rendering has to have it still.
  const stored = preserved.filter(
    (id) =>
      typeof english[id] === 'string' && englishText.includes(english[id]),
  );
  const rewritten = stored.filter(
    (id) => !translatedText.includes(english[id]),
  );
  const translatedShown = present.filter((id) =>
    translatedText.includes(translated[id]),
  );
  const stillEnglish = present.filter((id) =>
    translatedText.includes(english[id]),
  );

  // A message that is on neither rendering is not evidence of anything: a page
  // read twice can legitimately differ between the readings (a section that
  // reports a live result, a row that was added in between). What is evidence
  // is a message still in ENGLISH, and a floor of messages positively shown in
  // the other language — so the two are what the verdict is made of, rather
  // than an all-or-nothing tally that a changed page would fail.
  const pass =
    present.length >= floor &&
    stillEnglish.length === 0 &&
    rewritten.length === 0 &&
    translatedShown.length >= floor;

  return {
    pass,
    detail:
      present.length < floor
        ? `only ${present.length} comparable message(s) were found on ${what} in English (at least ${floor} are needed for the comparison to mean anything)`
        : stillEnglish.length > 0
          ? `${stillEnglish.length} of ${present.length} message(s) on ${what} are still English: ${stillEnglish
              .slice(0, 3)
              .map((id) => `${id} ("${english[id]}")`)
              .join('; ')}`
          : translatedShown.length < floor
            ? `only ${translatedShown.length} of ${present.length} message(s) on ${what} were positively shown in the other language`
            : rewritten.length > 0
              ? `stored value(s) on ${what} were rewritten by the language change: ${rewritten.join(', ')} — those are research data, not interface copy`
              : `${present.length} message(s) on ${what} switched language; ${stored.length} stored value(s) left alone`,
    present: present.length,
    translated: translatedShown.length,
  };
}

/**
 * Whether text a researcher authored survived the switch untouched.
 *
 * The other half of the claim: the interface is translated, and the protocol's
 * own words and the participant's answers are not.
 */
export function judgeAuthoredText({ translatedText, authored }) {
  const missing = authored.filter((text) => !translatedText.includes(text));
  return {
    pass: authored.length > 0 && missing.length === 0,
    detail:
      authored.length === 0
        ? 'no authored text was supplied, so nothing was checked'
        : missing.length === 0
          ? `${authored.length} piece(s) of protocol-authored text are unchanged`
          : `protocol-authored text was altered or lost: ${missing.join(' | ')}`,
  };
}

/**
 * The longest run of literal text in an interpolated message.
 *
 * Messages that name a user, a count or a protocol are written with
 * placeholders, so they never appear on a page verbatim and `judgeRendering`
 * skips them — which would leave the structured activity details, the part of
 * the feed the localization actually had to reach, unchecked. What DOES appear
 * verbatim is the prose between the placeholders, so that is what is compared.
 */
export function longestLiteral(message) {
  return (
    String(message ?? '')
      .split(/\{[^{}]*\}|[{}]/)
      .map((part) => part.trim())
      .toSorted((a, b) => b.length - a.length)[0] ?? ''
  );
}

/**
 * Whether interpolated messages — the activity feed's structured details —
 * arrived in the other language.
 *
 * Same shape as `judgeRendering`, and the same floor for the same reason: a
 * page with none of these on it proves nothing either way.
 */
export function judgeInterpolated({
  englishText,
  translatedText,
  english,
  translated,
  ids,
  floor = 1,
  what = 'the structured details',
}) {
  const comparable = ids
    .map((id) => ({
      id,
      source: longestLiteral(english[id]),
      target: longestLiteral(translated[id]),
    }))
    .filter(
      (entry) =>
        entry.source.length >= 12 &&
        entry.target.length >= 12 &&
        entry.source !== entry.target,
    );
  const present = comparable.filter((entry) =>
    englishText.includes(entry.source),
  );
  const stillEnglish = present.filter((entry) =>
    translatedText.includes(entry.source),
  );
  const shown = present.filter((entry) =>
    translatedText.includes(entry.target),
  );

  return {
    pass:
      present.length >= floor &&
      stillEnglish.length === 0 &&
      shown.length >= floor,
    detail:
      present.length < floor
        ? `${what}: only ${present.length} interpolated message(s) were on the English page, so there was nothing to compare`
        : stillEnglish.length > 0
          ? `${what}: still English — ${stillEnglish
              .slice(0, 3)
              .map((entry) => `${entry.id} ("${entry.source}")`)
              .join('; ')}`
          : shown.length < floor
            ? `${what}: none of the ${present.length} message(s) appeared in the other language`
            : `${what}: ${shown.length} of ${present.length} interpolated message(s) switched language`,
  };
}
