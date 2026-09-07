import { expect } from 'vitest';

import { commonCatalogs, commonMessages } from '@codaco/app-i18n/common';

import { protocolBuilderCatalogs } from '../locales/catalogs.ts';
import enCatalog from '../locales/en.json';

/**
 * The prefix `createMessageError` writes in front of an encoded descriptor.
 *
 * A reader seeing it is reading a message that crossed a string-only contract
 * and was never decoded — `formatMessageError(text, intl) ?? text` at the
 * render site is what turns it back into a sentence.
 */
const ENCODED_MESSAGE_PREFIX = '@codaco/app-i18n/error/v1:';

/** A named ICU argument nothing supplied a value for. */
const UNFORMATTED_PLACEHOLDER = /\{[A-Za-z_][A-Za-z0-9_]*\s*[,}]/;

/** The attributes a researcher reads, beside the text nodes. */
const COPY_ATTRIBUTES = [
  'aria-label',
  'aria-description',
  'placeholder',
  'title',
  'alt',
];

const collapse = (text: string) => text.replaceAll(/\s+/gu, ' ').trim();

/**
 * Everything a reader can see in the document right now: every text node, plus
 * the attributes that carry copy.
 *
 * The whole document rather than one container, because a dialog is a portal
 * and lives outside the render root — which is exactly the surface this sweep
 * exists to look at.
 */
const visibleStrings = (): string[] => {
  const seen: string[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = collapse(node.textContent ?? '');
    if (text !== '') seen.push(text);
  }
  for (const element of document.body.querySelectorAll('*')) {
    for (const name of COPY_ATTRIBUTES) {
      const value = element.getAttribute(name);
      if (value === null) continue;
      const text = collapse(value);
      if (text !== '') seen.push(text);
    }
  }
  return seen;
};

const spanish = (catalog: Record<string, unknown> | undefined, id: string) => {
  const translated = catalog?.[id];
  return typeof translated === 'string' ? translated : undefined;
};

/**
 * Every English sentence this package's readers are entitled to see Spanish
 * instead of, indexed by the sentence itself.
 *
 * Built from the `common.*` descriptors and this package's own extraction
 * artifact, which between them own every word these editors render that is not
 * either protocol content or a fixture's. A message whose Spanish is the same
 * string is not in here (nothing to leak); nor is one carrying an ICU argument,
 * because the rendered form is not the pattern.
 *
 * Fresco UI's `frescoUi.*` English is deliberately absent: its extraction
 * artifact is not an export of that package, and its own suite is where its
 * components are held to this. What that costs here is small — a fresco-ui
 * control rendering English inside a Spanish editor is a fresco-ui defect, and
 * this package's own copy is what these sweeps are about.
 *
 * The four-letter floor keeps single tokens out: "No" is Spanish for "No", and
 * an attribute a researcher named "Age" is protocol content that must render
 * exactly as they typed it.
 */
const translatableEnglish = (): ReadonlyMap<string, string> => {
  const index = new Map<string, string>();
  const add = (id: string, english: string, translated?: string) => {
    if (translated === undefined || translated === english) return;
    // Only literal messages compare: a pattern is not what is rendered.
    if (/[{}]/.test(english)) return;
    if (english.replaceAll(/[^A-Za-z]/gu, '').length < 4) return;
    index.set(collapse(english), id);
  };

  for (const descriptor of Object.values(commonMessages)) {
    add(
      descriptor.id ?? '',
      typeof descriptor.defaultMessage === 'string'
        ? descriptor.defaultMessage
        : '',
      spanish(commonCatalogs.es, descriptor.id ?? ''),
    );
  }
  for (const [id, entry] of Object.entries(
    enCatalog as Record<string, { defaultMessage: string }>,
  )) {
    add(id, entry.defaultMessage, spanish(protocolBuilderCatalogs.es, id));
  }
  return index;
};

const ENGLISH = translatableEnglish();

/**
 * The fixed wording inside a message that also carries an ICU argument.
 *
 * `ENGLISH` above skips every pattern, because the pattern is not what a
 * reader sees — `Node color {index, number}` never appears on screen. That
 * left the sweep blind to exactly the class of literal the last review found:
 * a colour list rebuilt as `` `Node color ${index + 1}` `` renders "Node color
 * 1", which matches no whole message and so was reported by nothing.
 *
 * What survives formatting is the text BETWEEN the arguments, so that is what
 * is compared — but only when the Spanish pattern does not contain the same
 * run, which is what makes it evidence of English rather than of a word the
 * two languages share. Only runs of some length qualify: this is a substring
 * test against everything on screen, and a short run ("of", ", ") would match
 * inside unrelated copy.
 */
const PATTERN_ARGUMENT = /\{[^{}]*\}/gu;

const MIN_RUN_CHARACTERS = 10;
const MIN_RUN_LETTERS = 8;

const englishOnlyRuns = (): ReadonlyMap<string, string> => {
  const index = new Map<string, string>();
  for (const [id, entry] of Object.entries(
    enCatalog as Record<string, { defaultMessage: string }>,
  )) {
    const english = entry.defaultMessage;
    if (!/[{}]/.test(english)) continue;
    const translated = spanish(protocolBuilderCatalogs.es, id);
    if (translated === undefined || translated === english) continue;
    for (const run of english.split(PATTERN_ARGUMENT)) {
      const text = collapse(run);
      if (text.length < MIN_RUN_CHARACTERS) continue;
      if (text.replaceAll(/[^A-Za-z]/gu, '').length < MIN_RUN_LETTERS) continue;
      // A run both languages write the same way proves nothing.
      if (collapse(translated).includes(text)) continue;
      index.set(text, id);
    }
  }
  return index;
};

const ENGLISH_RUNS = englishOnlyRuns();

/**
 * Every string a fixture holds, which is every string on screen that must NOT
 * be translated.
 *
 * A researcher's own words are stored in the protocol document and rendered to
 * the participant exactly as they were typed — a stage called "Sociogram", an
 * attribute called "Age", a prompt written in English by an English-speaking
 * researcher. Some of them read exactly like copy this package owns, and
 * reporting one would be telling the reader their own protocol is a
 * translation defect.
 *
 * Read out of the documents the test mounts rather than listed by hand, so a
 * fixture that gains an attribute does not quietly widen the sweep's blind
 * spot — or start failing it.
 *
 * Takes arbitrary values rather than a harness so both the codebook editors
 * (which are handed section documents directly) and the stage editors (whose
 * harness exposes seeded fields and a host codebook) can feed it the same way.
 */
export const protocolStrings = (
  ...values: readonly unknown[]
): ReadonlySet<string> => {
  const strings = new Set<string>();
  const collect = (value: unknown) => {
    if (typeof value === 'string') {
      const text = collapse(value);
      if (text !== '') strings.add(text);
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) collect(entry);
      return;
    }
    if (typeof value === 'object' && value !== null) {
      for (const [key, entry] of Object.entries(value)) {
        // Keys are content too: a codebook indexes its types and attributes by
        // ids the editors show, and those are the researcher's as well.
        strings.add(collapse(key));
        collect(entry);
      }
    }
  };
  collect(values);
  return strings;
};

/**
 * What is wrong with what is on screen, said in the words a reader would see.
 *
 * Three failures, all of which look like working software from the inside:
 *
 * - **English with a Spanish translation behind it.** Compared whole rather
 *   than by substring, because a substring match reports `common.save` against
 *   a heading that merely contains the word — a long sentence is matched
 *   inside a larger one too, where the coincidence is no longer plausible.
 * - **An encoded descriptor nobody decoded**, which reaches the reader as the
 *   raw payload.
 * - **An ICU argument nothing filled in**, which reaches them as `{name}`.
 */
export const localeLeaks = (
  content: ReadonlySet<string> = new Set(),
): string[] => {
  const strings = visibleStrings();
  const leaks: string[] = [];

  for (const text of strings) {
    if (text.includes(ENCODED_MESSAGE_PREFIX)) {
      leaks.push(`undecoded message: ${text}`);
    }
    if (UNFORMATTED_PLACEHOLDER.test(text)) {
      leaks.push(`unformatted placeholder: ${text}`);
    }
  }

  for (const [english, id] of ENGLISH) {
    if (content.has(english)) continue;
    const found = strings.some(
      (text) =>
        text === english || (english.length >= 20 && text.includes(english)),
    );
    if (found) leaks.push(`${id} rendered in English: ${english}`);
  }

  for (const [run, id] of ENGLISH_RUNS) {
    if (content.has(run)) continue;
    if (strings.some((text) => text.includes(run))) {
      leaks.push(`${id} rendered in English: ${run}`);
    }
  }

  return [...new Set(leaks)].toSorted();
};

/**
 * The one thing a surface can put on screen that is English on purpose.
 *
 * Narrow, and declared at the call site, because a sweep that quietly forgave
 * a leak would be a green tick over the defect it exists to find.
 */
export type SweepAllowances = Readonly<{
  /**
   * Words a test FIXTURE renders, which are nobody's copy.
   *
   * `TestPromptEditor` labels a box "Prompt text" as a stand-in for a family's
   * own field. Three real areas happen to say the same words
   * (`networkCanvas`, `pedigree` and `geospatial` each declare a `Prompt text`
   * label), so the sweep — which indexes by the English SENTENCE, not by where
   * it was rendered — reports the fixture's stand-in under whichever id is
   * spelled the same. Naming them here says "a fixture put this here", the
   * same claim `packageSource.ts` makes about a fixture FILE.
   *
   * Not a route around a real leak: a word listed here is one nothing in this
   * package declares as copy, and the sweep still reports every id that does.
   */
  fixtureWords?: readonly string[];
}>;

/**
 * Assert that nothing on screen is English, raw or unformatted.
 *
 * `where` names the surface, because a sweep drives several and the failure
 * has to say which one was open. `content` is what the RESEARCHER wrote —
 * build it with {@link protocolStrings} out of the documents the test mounted.
 */
export const expectNoLocaleLeaks = (
  where: string,
  content: ReadonlySet<string> = new Set(),
  { fixtureWords = [] }: SweepAllowances = {},
): void => {
  const allowed = new Set<string>(content);
  for (const word of fixtureWords) allowed.add(collapse(word));
  expect(localeLeaks(allowed), `Spanish leaks at ${where}`).toEqual([]);
};
