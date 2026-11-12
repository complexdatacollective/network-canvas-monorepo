import type { LocalizationDeclaration } from '../../localization/localeTag.ts';
import { interfaceTextAsShown, withInterfaceText } from './interface-text.ts';
import type { LocalizedString } from './localized-string.ts';
import {
  stageWithoutSuppliedText,
  stageWithSuppliedText,
  suppliedStageText,
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
export const withoutSuppliedWording = <Protocol extends ProtocolDocument>(
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
export const withSuppliedWording = <Protocol extends ProtocolDocument>(
  protocol: Protocol,
): Protocol => {
  const { localization } = protocol;
  const stages = mapStages(protocol.stages, (stage) =>
    stageWithSuppliedText(stage, localization),
  );
  return { ...protocol, stages, interfaceText: interfaceTextAsShown(protocol) };
};

type InterfaceTextByName = Readonly<
  Record<
    string,
    Readonly<Record<string, LocalizedString | undefined>> | undefined
  >
>;

/**
 * Network Canvas's own wording, in the protocol's languages, for the text at
 * a path of `protocol` (as `collectLocalizedStrings` gives paths): what a
 * stage setting it words, or an interface text the protocol shows, reads as
 * where the protocol holds no wording of its own. Undefined for a text
 * Network Canvas does not word, and for one it has no wording for in any of
 * the protocol's languages. What an editor puts back when a researcher clears
 * their own wording.
 */
export const suppliedWordingIn = (protocol: ProtocolDocument) => {
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

  return (path: readonly (string | number)[]): LocalizedString | undefined => {
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
