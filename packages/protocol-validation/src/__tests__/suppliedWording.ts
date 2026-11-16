import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { InterfaceText } from '../schemas/9/interface-text.ts';
import { suppliedWordingFrom } from '../schemas/9/protocol-wording.ts';
import type { SuppliedWordingCatalogues } from '../schemas/9/supplied-stage-setting.ts';

// The wording Network Canvas supplies is the interview's, which depends on
// this package, so nothing here can import it. These tests read the
// interview's catalogues from its source instead, as the tests of committed
// protocols read theirs, so that what they assert about text a protocol shows
// or stores is asserted against the words a participant reads.

const wordingDir = path.resolve(
  import.meta.dirname,
  '../../../interview/src/locales/wording',
);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** One language's catalogue: message by id. */
const catalogue = (file: string): Readonly<Record<string, string>> => {
  const read: unknown = JSON.parse(
    readFileSync(path.join(wordingDir, file), 'utf8'),
  );
  if (!isRecord(read)) throw new Error(`${file} is not a catalogue`);
  return Object.fromEntries(
    Object.entries(read).flatMap(([id, message]) =>
      typeof message === 'string' ? [[id, message]] : [],
    ),
  );
};

/** The interview's catalogues, as `@codaco/interview/supplied-wording` binds them. */
const SUPPLIED_WORDING: SuppliedWordingCatalogues = Object.fromEntries(
  readdirSync(wordingDir)
    .filter((file) => file.endsWith('.json') && !file.endsWith('.source.json'))
    .map((file) => [file.replace(/\.json$/, ''), catalogue(file)]),
);

export const {
  suppliedStageText,
  stageWordingShown,
  stageWithoutSuppliedText,
  stageWithSuppliedText,
  suppliedInterfaceText,
  interfaceTextShown,
  interfaceTextShownBy,
  interfaceTextAsShown,
  withInterfaceText,
  interfaceTextWithUpdates,
  withoutSuppliedWording,
  withSuppliedWording,
  suppliedWordingIn,
  familyPedigreeWordingIn,
} = suppliedWordingFrom(SUPPLIED_WORDING);

/** Network Canvas's English for a message, by its id. */
export const englishWording = (id: string): string => {
  const text = SUPPLIED_WORDING.en?.[id];
  if (text === undefined) throw new Error(`No English wording for ${id}`);
  return text;
};

type ProtocolWithInterfaceText = Parameters<typeof withInterfaceText>[0];

/** The interface text a protocol stores: what `withInterfaceText` leaves it. */
export const interfaceTextFor = (
  protocol: ProtocolWithInterfaceText,
): InterfaceText => {
  const held: unknown = withInterfaceText(protocol).interfaceText;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `withInterfaceText` leaves the groups and entries the schema names, each a language-to-text map
  return (held ?? {}) as InterfaceText;
};
