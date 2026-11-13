import type { ReactNode } from 'react';

import { type IntlShape, defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { getValidationLabel } from '@codaco/protocol-builder/codebook/variableValidation';
import { nameLocalizedText } from '@codaco/protocol-builder/localization/localizedTextNames';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import { useLanguageName } from '~/components/Localization/useLanguageName';
import Markdown from '~/components/Markdown';
import { useAppSelector } from '~/ducks/hooks';
import type { FixTextEdit } from '~/protocolReview/describeFix';
import { getProtocol } from '~/selectors/protocol';
import { cx } from '~/utils/cva';

export const fixEditMessages = defineMessages({
  notSet: {
    id: 'architect.protocolReview.problem.notSet',
    defaultMessage: 'Not set',
    description:
      'Shown in the Now box for a number setting, such as a limit on answers, that the protocol does not have yet.',
  },
  numberSetting: {
    id: 'architect.protocolReview.problem.numberSetting',
    defaultMessage: '{setting} · {name}',
    description:
      'Names a number a fix changes, above its Now and After the fix boxes. {setting} is the setting, such as "Maximum selected"; {name} is the attribute or stage it belongs to. The dot is a separator.',
  },
  textInLanguage: {
    id: 'architect.protocolReview.problem.textInLanguage',
    defaultMessage: '{name} · {language}',
    description:
      'Names a text a fix changes, above its Now and After the fix boxes, when the fix changes it in several languages. {name} is where the stage or codebook editor shows the text, such as "Page content › Page heading"; {language} is the language’s name. The dot is a separator.',
  },
  minNodes: {
    id: 'architect.protocolReview.problem.minNodes',
    defaultMessage: 'Minimum nodes on stage',
    description:
      'Names the number setting for the fewest nodes a participant must add on a stage, above a fix that changes it.',
  },
  maxNodes: {
    id: 'architect.protocolReview.problem.maxNodes',
    defaultMessage: 'Maximum nodes on stage',
    description:
      'Names the number setting for the most nodes a participant may add on a stage, above a fix that changes it.',
  },
  concentricCircles: {
    id: 'architect.protocolReview.problem.concentricCircles',
    defaultMessage: 'Number of concentric circles',
    description:
      'Names the number setting for how many circles a sociogram background shows, above a fix that changes it.',
  },
  now: {
    id: 'architect.protocolReview.problem.now',
    defaultMessage: 'Now',
    description:
      'Label over a piece of text as it is in the protocol now, shown beside the same text as the suggested fix would change it.',
  },
  afterFix: {
    id: 'architect.protocolReview.problem.afterFix',
    defaultMessage: 'After the fix',
    description:
      'Label over a piece of text as the suggested fix would change it.',
  },
});

export const FixText = ({
  text,
  markdown,
}: {
  text: string;
  markdown: boolean;
}) =>
  markdown ? (
    <Markdown label={text} className="wrap-break-word" />
  ) : (
    <span className="wrap-break-word whitespace-pre-wrap">{text}</span>
  );

const settingName = (intl: IntlShape, setting: string): string => {
  if (setting === 'minNodes') {
    return intl.formatMessage(fixEditMessages.minNodes);
  }
  if (setting === 'maxNodes') {
    return intl.formatMessage(fixEditMessages.maxNodes);
  }
  if (setting === 'concentricCircles') {
    return intl.formatMessage(fixEditMessages.concentricCircles);
  }
  return getValidationLabel(setting, intl);
};

const TEXT_NAME_SEPARATOR = ' › ';

const editContext = (
  intl: IntlShape,
  protocol: CurrentProtocol | null,
  edit: FixTextEdit,
  languageName: (locale: string) => string,
  severalLanguages: boolean,
): string | null => {
  if (edit.kind === 'number') {
    const setting = settingName(intl, edit.setting);
    return edit.owner === null
      ? setting
      : intl.formatMessage(fixEditMessages.numberSetting, {
          setting,
          name: edit.owner,
        });
  }
  const steps =
    protocol && edit.textPath
      ? nameLocalizedText(intl, protocol, edit.textPath)
      : undefined;
  const name = steps?.map(({ label }) => label).join(TEXT_NAME_SEPARATOR);
  const language =
    edit.locale !== null && severalLanguages ? languageName(edit.locale) : null;
  if (name && language) {
    return intl.formatMessage(fixEditMessages.textInLanguage, {
      name,
      language,
    });
  }
  return name || language;
};

/**
 * What each of a fix's edits is, by its path: where the editor shows a text
 * (with its language when the fix changes several), or a number's setting
 * and what it belongs to. Null where there is nothing to say.
 */
export const useFixEditContexts = (
  textEdits: readonly FixTextEdit[],
): Readonly<Record<string, string | null>> => {
  const intl = useAppIntl();
  const protocol = useAppSelector(getProtocol);
  const languageName = useLanguageName();
  const severalLanguages =
    new Set(textEdits.map((edit) => edit.locale)).size > 1;
  return Object.fromEntries(
    textEdits.map((edit) => [
      edit.path,
      editContext(intl, protocol, edit, languageName, severalLanguages),
    ]),
  );
};

/** The small heading over one side of a change: Now, or After the fix. */
export const ChangeLabel = ({
  id,
  side,
  children,
}: {
  id?: string;
  side: 'now' | 'after';
  children: ReactNode;
}) => (
  <span
    id={id}
    className={cx(
      'flex items-center gap-2 text-xs font-bold tracking-widest uppercase',
      side === 'now' ? 'text-current/60' : 'text-primary',
    )}
  >
    <span
      aria-hidden
      className={cx(
        'size-2 shrink-0 rounded-full',
        side === 'now' ? 'bg-current/40' : 'bg-primary',
      )}
    />
    {children}
  </span>
);

/** One text or number a fix changes, as it is now; absent when it has none. */
export const NowBox = ({ id, edit }: { id?: string; edit: FixTextEdit }) => {
  const intl = useAppIntl();
  if (edit.now === null && edit.kind !== 'number') return null;
  return (
    <div id={id} className="flex flex-col gap-2">
      <ChangeLabel side="now">
        {intl.formatMessage(fixEditMessages.now)}
      </ChangeLabel>
      <div className="bg-surface border-outline rounded border p-4">
        {edit.now === null ? (
          <span>{intl.formatMessage(fixEditMessages.notSet)}</span>
        ) : (
          <FixText text={edit.now} markdown={edit.markdown} />
        )}
      </div>
    </div>
  );
};
