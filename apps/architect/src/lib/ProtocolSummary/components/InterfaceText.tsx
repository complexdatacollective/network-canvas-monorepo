import { useContext } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { nameLocalizedText } from '@codaco/protocol-builder/localization/localizedTextNames';
import {
  collectLocalizedStrings,
  type CurrentProtocol,
  INTERFACE_TEXT_MESSAGES,
  type LocalizedString,
  type MessageArguments,
} from '@codaco/protocol-validation';

import MiniTable from './MiniTable';
import SectionFrame from './Stage/SectionFrame';
import SummaryContext from './SummaryContext';
import { SummaryMessage, SummaryText } from './SummaryText';

const messages = defineMessages({
  title: {
    id: 'architect.protocolSummary.interfaceText.title',
    defaultMessage: 'Interview text',
    description:
      'Heading of the printable protocol summary section that lists the words the interview itself shows, such as its buttons and messages, rather than text written for a stage or codebook entry.',
  },
});

/** Where the summary section starts, which the contents links to. */
export const INTERFACE_TEXT_ANCHOR = 'interface-text';

/**
 * The arguments each of the protocol's interface texts may use, by group and
 * name. They come from the protocol schema, as the translation table's do, so
 * the summary shows a message as the same versions the table shows.
 */
const interfaceTextArguments = (
  interfaceText: unknown,
): ReadonlyMap<string, MessageArguments> =>
  new Map(
    collectLocalizedStrings({ interfaceText }).flatMap(
      ({ path, arguments: declaration }) =>
        declaration === undefined || path[0] !== 'interfaceText'
          ? []
          : [[path.slice(1).join('.'), declaration] as const],
    ),
  );

type Entry = Readonly<{ group: string; key: string; value: LocalizedString }>;

/**
 * The interface text a protocol holds, the groups and the entries within them
 * in the order the wording is defined in, whatever order the protocol stores
 * them in.
 */
export const heldInterfaceText = (
  interfaceText: CurrentProtocol['interfaceText'],
): readonly Entry[] => {
  const held: Readonly<
    Record<
      string,
      Readonly<Record<string, LocalizedString | undefined>> | undefined
    >
  > = interfaceText ?? {};
  return INTERFACE_TEXT_MESSAGES.flatMap(({ group, key }): Entry[] => {
    const value = held[group]?.[key];
    return value === undefined ? [] : [{ group, key, value }];
  });
};

const InterfaceText = () => {
  const intl = useAppIntl();
  const { protocol } = useContext(SummaryContext);
  const entries = heldInterfaceText(protocol.interfaceText);
  if (entries.length === 0) return null;

  const declarations = interfaceTextArguments(protocol.interfaceText);
  const groups = Map.groupBy(entries, ({ group }) => group);

  // The names the translation table gives them: the group, then the entry.
  const namesOf = (group: string, key: string) => {
    const [groupName, entryName] =
      nameLocalizedText(intl, protocol, ['interfaceText', group, key]) ?? [];
    return {
      group: groupName?.label ?? group,
      entry: entryName?.label ?? key,
    };
  };

  return (
    <div
      id={INTERFACE_TEXT_ANCHOR}
      // oxlint-disable-next-line tailwindcss/no-unknown-classes -- print stylesheet + e2e selector hook
      className="page-break-marker flex break-before-page flex-col gap-6"
    >
      <Heading level="h1">{intl.formatMessage(messages.title)}</Heading>
      {[...groups].map(([group, groupEntries]) => (
        <SectionFrame
          key={group}
          title={namesOf(group, groupEntries[0]?.key ?? '').group}
        >
          <MiniTable
            rotated
            rows={groupEntries.map(({ key, value }) => {
              const declaration = declarations.get(`${group}.${key}`);
              return [
                namesOf(group, key).entry,
                declaration === undefined ? (
                  <SummaryText key={key} value={value} />
                ) : (
                  <SummaryMessage
                    key={key}
                    value={value}
                    messageArguments={declaration}
                  />
                ),
              ];
            })}
          />
        </SectionFrame>
      ))}
    </div>
  );
};

export default InterfaceText;
