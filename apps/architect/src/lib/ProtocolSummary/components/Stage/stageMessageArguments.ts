import {
  collectLocalizedStrings,
  type MessageArguments,
} from '@codaco/protocol-validation';

/**
 * The arguments each of a stage's messages may use, by the message's dotted
 * path in the stage. They come from the protocol schema, as the stage editor's
 * and the translation table's do, so the summary shows a message as the same
 * versions they show.
 */
export const stageMessageArguments = (
  stage: Readonly<Record<string, unknown>>,
): ReadonlyMap<string, MessageArguments> =>
  new Map(
    collectLocalizedStrings({ stages: [stage] }).flatMap(
      ({ path, arguments: declaration }) =>
        declaration === undefined || path[0] !== 'stages'
          ? []
          : [[path.slice(2).join('.'), declaration] as const],
    ),
  );
