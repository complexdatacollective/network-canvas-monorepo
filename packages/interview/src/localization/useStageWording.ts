'use client';

import { invariant } from 'es-toolkit';
import { useMemo } from 'react';

import {
  type LocalizationDeclaration,
  type LocalizedString,
} from '@codaco/protocol-validation';

import { stageWordingShown } from '../wording/suppliedWording';
import { useProtocolLocalization } from './ProtocolLocalizationProvider';

type WordedStage = Parameters<typeof stageWordingShown>[0];

/**
 * The wording Network Canvas supplies for a stage's settings, as the
 * interview shows it: the stage's own text in each language it holds, and
 * Network Canvas's wording in each language it does not (see
 * `stageWordingShown`). A setting is named by its path in the stage.
 */
export type StageWording = Readonly<{
  /** The text of a setting, whether or not the stage shows it. */
  text: (...path: readonly string[]) => LocalizedString;
  /** The text of a setting, or undefined where the stage does not show it. */
  shown: (...path: readonly string[]) => LocalizedString | undefined;
  /** Every setting below `path`, by the rest of its path, joined with a dot. */
  below: (
    ...path: readonly string[]
  ) => Readonly<Record<string, LocalizedString>>;
}>;

export const stageWordingOf = (
  stage: WordedStage,
  localization: LocalizationDeclaration,
): StageWording => {
  const settings = stageWordingShown(stage, localization);
  const byPath = new Map(
    settings.map((setting) => [JSON.stringify(setting.path), setting]),
  );
  const at = (path: readonly string[]) => {
    const setting = byPath.get(JSON.stringify(path));
    invariant(
      setting,
      `Network Canvas supplies no wording for "${path.join('.')}" of a ${stage.type} stage`,
    );
    return setting;
  };
  return {
    text: (...path) => at(path).value,
    shown: (...path) => {
      const setting = at(path);
      return setting.shown ? setting.value : undefined;
    },
    below: (...path) =>
      Object.fromEntries(
        settings
          .filter(
            (setting) =>
              setting.path.length > path.length &&
              path.every((part, index) => setting.path[index] === part),
          )
          .map((setting) => [
            setting.path.slice(path.length).join('.'),
            setting.value,
          ]),
      ),
  };
};

/** The wording of the stage an interface is showing (see `StageWording`). */
export function useStageWording(stage: WordedStage): StageWording {
  const localization = useProtocolLocalization();
  return useMemo(
    () => stageWordingOf(stage, localization),
    [stage, localization],
  );
}
