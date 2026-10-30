import { createElement } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import {
  headingTagBelow,
  useEnclosingHeadingLevel,
} from '@codaco/fresco-ui/typography/EnclosingHeadingLevel';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  interfaceTextArguments,
  type STAGE_TYPE_INTERFACE_TEXT,
} from '@codaco/protocol-validation';

import { LocalizedMessageVersionsSummary } from '../../fields/LocalizedMessageField.tsx';
import {
  nameInterfaceText,
  nameInterfaceTextGroup,
} from '../../localization/interfaceTextNames.ts';
import { useEditingLanguage } from '../../localization/ProtocolLocalization.tsx';
import { useProtocolContext } from '../../state/protocolContext.ts';

const messages = defineMessages({
  sharedHeading: {
    id: 'protocolBuilder.stageWording.sharedHeading',
    defaultMessage: 'Shared by every stage of this kind',
    description:
      'Heading, inside a stage’s Wording section, above the words that every stage of the same type shows alike, such as the zoom buttons of every Family Pedigree stage. The protocol holds them once, for all those stages.',
  },
  sharedDescription: {
    id: 'protocolBuilder.stageWording.sharedDescription',
    defaultMessage:
      'These words are the same on every stage of this kind. Change or translate them in the protocol’s translations.',
    description:
      'Explains the words listed under the heading “Shared by every stage of this kind” in a stage’s Wording section: they are shown here but not edited here, because the protocol holds them once for every such stage; the researcher edits them in the protocol’s translations table.',
  },
  noTranslation: {
    id: 'protocolBuilder.stageWording.noTranslation',
    defaultMessage: 'Not translated yet',
    description:
      'Shown in place of a shared word of the interview, in a stage’s Wording section, when the protocol holds no text for it in the language the researcher is editing in.',
  },
});

/**
 * The words every stage of a kind shows alike, as the protocol holds them in
 * the editing language. Shown, not edited: the protocol holds them once, and
 * changing them here would change every other such stage too, so they are
 * edited with the rest of the protocol's translations. Rendered inside the
 * section, so its heading counts from the section's own.
 */
export default function SharedStageWording({
  groups,
}: Readonly<{ groups: (typeof STAGE_TYPE_INTERFACE_TEXT)[string] }>) {
  const intl = useAppIntl();
  const { interfaceText } = useProtocolContext();
  const { locale } = useEditingLanguage();
  const headingTag = headingTagBelow(useEnclosingHeadingLevel() ?? 'h3');
  const asCounted =
    headingTag === 'h4' ? {} : { render: createElement(headingTag) };

  const held = groups.flatMap((group) => {
    const entries = Object.entries(interfaceText?.[group] ?? {});
    return entries.length === 0 ? [] : [{ group, entries }];
  });
  if (held.length === 0) return null;

  return (
    <div className="mt-8">
      <Heading level="h4" {...asCounted}>
        {intl.formatMessage(messages.sharedHeading)}
      </Heading>
      <Paragraph>{intl.formatMessage(messages.sharedDescription)}</Paragraph>
      {held.map(({ group, entries }) => (
        <section
          key={group}
          aria-label={nameInterfaceTextGroup(intl, group)}
          className="not-last:mb-6"
        >
          {held.length > 1 && (
            <p className="mb-2 text-sm font-semibold">
              {nameInterfaceTextGroup(intl, group)}
            </p>
          )}
          <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-6 gap-y-2 text-sm">
            {entries.map(([key, value]) => {
              const text = locale === undefined ? undefined : value?.[locale];
              const declaration = interfaceTextArguments(group, key);
              return (
                <div key={key} className="contents">
                  <dt className="font-semibold">
                    {nameInterfaceText(intl, key)}
                  </dt>
                  {text === undefined || text === '' ? (
                    <dd className="text-current/70 italic">
                      {intl.formatMessage(messages.noTranslation)}
                    </dd>
                  ) : (
                    <dd lang={locale}>
                      {declaration === undefined || locale === undefined ? (
                        text
                      ) : (
                        // Its placeholders as the pills the editor draws.
                        <LocalizedMessageVersionsSummary
                          message={text}
                          declaration={declaration}
                          locale={locale}
                        />
                      )}
                    </dd>
                  )}
                </div>
              );
            })}
          </dl>
        </section>
      ))}
    </div>
  );
}
