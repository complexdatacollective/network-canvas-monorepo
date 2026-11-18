import { useAppIntl } from '@codaco/app-i18n/react';
import { stageWordingSettings } from '@codaco/protocol-builder/localization/localizedTextNames';
import { stageWordingMessages } from '@codaco/protocol-builder/sections/supplied-wording/stageWordingMessages';
import type { LocalizedString } from '@codaco/protocol-validation';

import MiniTable from '../MiniTable';
import { SummaryMessage, SummaryText } from '../SummaryText';
import SectionFrame from './SectionFrame';
import { stageMessageArguments } from './stageMessageArguments';

/** A stage as the summary reads it: its type and its settings. */
export type SummaryStage = Readonly<{ type: string }> &
  Readonly<Record<string, unknown>>;

/** The text a stage holds at a path, or undefined where it holds none. */
const textAt = (
  stage: SummaryStage,
  path: readonly string[],
): LocalizedString | undefined => {
  let current: unknown = stage;
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = Reflect.get(current, key);
  }
  return typeof current === 'object' && current !== null
    ? // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the path names a localized text setting, which the schema holds as a locale-to-string record
      (current as LocalizedString)
    : undefined;
};

type StageWordingProps = {
  stage: SummaryStage;
  /**
   * Leaves out a setting the stage holds, by its dotted path. Unset, the
   * summary prints every setting the stage holds.
   */
  omits?: (path: string) => boolean;
};

/**
 * The stage's Customize built-in wording section: each setting its editor
 * lists there, in the editor's order and under the editor's label, that the
 * stage holds. A stage that holds none prints nothing.
 */
const StageWording = ({ stage, omits }: StageWordingProps) => {
  const intl = useAppIntl();
  const declarations = stageMessageArguments(stage);
  const rows = stageWordingSettings(stage.type).flatMap(({ path, label }) => {
    const key = path.join('.');
    if (omits?.(key)) return [];
    const value = textAt(stage, path);
    if (value === undefined) return [];
    const declaration = declarations.get(key);
    return [
      [
        intl.formatMessage(label),
        declaration === undefined ? (
          <SummaryText key={key} value={value} />
        ) : (
          <SummaryMessage
            key={key}
            value={value}
            messageArguments={declaration}
          />
        ),
      ],
    ];
  });
  if (rows.length === 0) return null;
  return (
    <SectionFrame title={intl.formatMessage(stageWordingMessages.title)}>
      <MiniTable rotated rows={rows} />
    </SectionFrame>
  );
};

export default StageWording;
