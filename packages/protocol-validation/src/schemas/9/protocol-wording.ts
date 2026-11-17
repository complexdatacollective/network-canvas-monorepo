import type {
  LocaleTag,
  LocalizationDeclaration,
} from '../../localization/localeTag.ts';
import { INTERFACE_TEXT_ENTRIES, interfaceTextWith } from './interface-text.ts';
import type { LocalizedString } from './localized-string.ts';
import type { FamilyPedigreeWording } from './stages/family-pedigree.ts';
import {
  type SuppliedText,
  type SuppliedWordingCatalogues,
  type SuppliedWordingSource,
  wordingFromCatalogues,
  wordingPresence,
} from './supplied-stage-setting.ts';
import {
  stageTextWith,
  SUPPLIED_STAGE_SETTINGS,
} from './supplied-stage-text.ts';

type ProtocolDocument = Readonly<{
  localization: LocalizationDeclaration;
  codebook?: unknown;
  stages?: readonly unknown[];
  interfaceText?: unknown;
}>;

type StageLike = Readonly<{ type: string }> & Readonly<Record<string, unknown>>;

const isStage = (stage: unknown): stage is StageLike =>
  typeof stage === 'object' &&
  stage !== null &&
  !Array.isArray(stage) &&
  'type' in stage &&
  typeof stage.type === 'string';

/** `stages` with `rewrite` applied to each stage; the same array if none changed. */
const mapStages = (
  stages: readonly unknown[] | undefined,
  rewrite: (stage: StageLike) => StageLike,
): readonly unknown[] | undefined => {
  if (stages === undefined) return undefined;
  const next = stages.map((stage) => (isStage(stage) ? rewrite(stage) : stage));
  return next.every((stage, index) => stage === stages[index]) ? stages : next;
};

type InterfaceTextByName = Readonly<
  Record<
    string,
    Readonly<Record<string, LocalizedString | undefined>> | undefined
  >
>;

/**
 * Everything that is read of a protocol with Network Canvas's wording to
 * hand: the wording itself, the text the interview shows, and a stage, an
 * interface text and a whole protocol as they are stored and with the wording
 * they show written out.
 */
const suppliedWordingWith = (source: SuppliedWordingSource) => {
  const ofStages = stageTextWith(source);
  const ofInterfaceText = interfaceTextWith(source);
  const { stageWithoutSuppliedText, stageWithSuppliedText, suppliedStageText } =
    ofStages;
  const { interfaceTextAsShown, withInterfaceText } = ofInterfaceText;

  /**
   * `protocol` as it is stored: holding, of the wording Network Canvas
   * supplies, only what its author changed. Each stage holds only its own
   * wording for the settings Network Canvas words (`stageWithoutSuppliedText`),
   * and the protocol holds only its own wording for the interface text it
   * shows (`withInterfaceText`). The interview shows Network Canvas's wording
   * for everything not held, so the two read the same to a participant. Every
   * tool that writes a protocol writes this form. The same protocol when it is
   * already stored this way, so a caller can tell nothing changed.
   */
  const withoutSuppliedWording = <Protocol extends ProtocolDocument>(
    protocol: Protocol,
  ): Protocol => {
    const stages = mapStages(protocol.stages, stageWithoutSuppliedText);
    return withInterfaceText(
      stages === protocol.stages ? protocol : { ...protocol, stages },
    );
  };

  /**
   * `protocol` with the wording a participant is shown written out: each stage
   * setting Network Canvas words and each interface text the protocol shows
   * holds the protocol's own translation where it has one and Network Canvas's
   * wording where it does not (`stageWithSuppliedText`,
   * `interfaceTextAsShown`). What a tool reads to list, translate or print
   * every text of a protocol. It is a reading, never what is stored: a change
   * made to it is stored through `withoutSuppliedWording`, which this undoes.
   */
  const withSuppliedWording = <Protocol extends ProtocolDocument>(
    protocol: Protocol,
  ): Protocol => {
    const { localization } = protocol;
    const stages = mapStages(protocol.stages, (stage) =>
      stageWithSuppliedText(stage, localization),
    );
    return {
      ...protocol,
      stages,
      interfaceText: interfaceTextAsShown(protocol),
    };
  };

  /**
   * Network Canvas's own wording, in the protocol's languages, for the text at
   * a path of `protocol` (as `collectLocalizedStrings` gives paths): what a
   * stage setting it words, or an interface text the protocol shows, reads as
   * where the protocol holds no wording of its own. Undefined for a text
   * Network Canvas does not word, and for one it has no wording for in any of
   * the protocol's languages. What an editor puts back when a researcher clears
   * their own wording.
   */
  const suppliedWordingIn = (protocol: ProtocolDocument) => {
    // Read by group and entry names that come from a path, so any string.
    let interfaceText: InterfaceTextByName | undefined;
    const ofInterface = (): InterfaceTextByName => {
      interfaceText ??= interfaceTextAsShown({
        ...protocol,
        interfaceText: undefined,
      });
      return interfaceText;
    };
    const stageText = new Map<number, ReadonlyMap<string, LocalizedString>>();

    const ofStage = (index: number) => {
      const known = stageText.get(index);
      if (known !== undefined) return known;
      const stage = protocol.stages?.[index];
      const wording = new Map(
        isStage(stage)
          ? suppliedStageText(stage.type, protocol.localization).map(
              ({ path, value }) => [JSON.stringify(path), value],
            )
          : [],
      );
      stageText.set(index, wording);
      return wording;
    };

    return (
      path: readonly (string | number)[],
    ): LocalizedString | undefined => {
      const [root, first, ...rest] = path;
      const wording =
        root === 'stages' && typeof first === 'number'
          ? ofStage(first).get(JSON.stringify(rest))
          : root === 'interfaceText' &&
              typeof first === 'string' &&
              rest.length === 1 &&
              typeof rest[0] === 'string'
            ? ofInterface()[first]?.[rest[0]]
            : undefined;
      return wording === undefined || Object.keys(wording).length === 0
        ? undefined
        : wording;
    };
  };

  /**
   * A Family Pedigree stage's `wording`, every setting as Network Canvas
   * words it in the given languages (English by default): what a stage holds
   * when it holds all of its wording itself, as a fixture or an example may.
   */
  const familyPedigreeWordingIn = (
    locales: readonly LocaleTag[] = ['en'],
  ): FamilyPedigreeWording =>
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- keys are the wording settings the Family Pedigree's table names, which FamilyPedigreeWording lists
    Object.fromEntries(
      suppliedStageText('FamilyPedigree', {
        defaultLocale: locales[0] ?? 'en',
        locales: [...locales],
      }).flatMap(({ path: [group, key], value }) =>
        group === 'wording' && key !== undefined ? [[key, value]] : [],
      ),
    ) as FamilyPedigreeWording;

  return {
    ...ofStages,
    ...ofInterfaceText,
    familyPedigreeWordingIn,
    withoutSuppliedWording,
    withSuppliedWording,
    suppliedWordingIn,
  };
};

/**
 * The functions that read a protocol against Network Canvas's wording, given
 * that wording: the interview's catalogues, one for each language. The schema
 * fixes which texts Network Canvas words and in which languages; the words
 * are the interview's, so every tool that shows, compares or strips them gets
 * these functions from the interview (`@codaco/interview/supplied-wording`),
 * which binds them to its catalogues.
 */
export const suppliedWordingFrom = (catalogues: SuppliedWordingCatalogues) =>
  suppliedWordingWith(wordingFromCatalogues(catalogues));

/**
 * The same functions with no words to hand, only where Network Canvas has
 * them (`wordingPresence`): enough to tell which texts a protocol shows and
 * whether each has words in a language, which is all validation asks. Text
 * read through these stands in for the wording and is never shown or stored.
 */
export const wordingPresent = suppliedWordingWith(wordingPresence);

/**
 * `protocol` without the wording it holds for a text it does not show: a
 * stage setting whose configuration is switched off, and an interface text
 * no stage shows. What a tool with no catalogue to hand can remove. It cannot
 * tell a translation that reads exactly as Network Canvas words it, which
 * `withoutSuppliedWording` also removes. The same protocol when there is
 * nothing to remove.
 */
export const withoutUnshownWording = wordingPresent.withoutSuppliedWording;

/**
 * `protocol` without the interface text it holds for a text no stage shows
 * (see `withoutUnshownWording`), and with no `interfaceText` at all when that
 * leaves none.
 */
export const withoutUnshownInterfaceText = wordingPresent.withInterfaceText;

/**
 * `stage` without the wording it holds for a setting its configuration does
 * not show (see `withoutUnshownWording`).
 */
export const stageWithoutUnshownWording =
  wordingPresent.stageWithoutSuppliedText;

/** A text Network Canvas words, with where a protocol holds it. */
export type SuppliedTextSite = SuppliedText &
  Readonly<
    | { kind: 'interfaceText'; group: string; key: string }
    | { kind: 'stageSetting'; stageType: string; path: readonly string[] }
  >;

/**
 * Every text Network Canvas words for this schema version: each interface
 * text and each stage setting, with the interview message that words it and
 * the regional variants it is also worded in. The set is closed, and so is
 * the list of languages (`SUPPLIED_LANGUAGES`). What the interview's
 * catalogues are held to: every text has words in every supplied language and
 * in each of its variants, and no catalogue words anything else.
 */
export const SUPPLIED_TEXTS: readonly SuppliedTextSite[] = [
  ...INTERFACE_TEXT_ENTRIES.map(
    ({ group, key, entry: { wording, variants } }): SuppliedTextSite => ({
      kind: 'interfaceText',
      group,
      key,
      wording,
      ...(variants !== undefined && { variants }),
    }),
  ),
  ...SUPPLIED_STAGE_SETTINGS.map(
    ({
      stageType,
      setting: { path, wording, variants },
    }): SuppliedTextSite => ({
      kind: 'stageSetting',
      stageType,
      path,
      wording,
      ...(variants !== undefined && { variants }),
    }),
  ),
];
