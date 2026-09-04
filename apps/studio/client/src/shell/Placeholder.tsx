import type { ReactNode } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { routeFocusTargetProps } from '@codaco/fresco-ui/navigation/RouteFocus';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

const messages = defineMessages({
  unbuilt: {
    id: 'studio.placeholder.unbuilt',
    defaultMessage:
      'This screen has not been built yet. It is specified in {issue}.',
    description:
      'Shown on every not-yet-built screen; {issue} is a GitHub issue reference like #1253.',
  },
});

export type PlaceholderProps = {
  /**
   * The screen's name, as it appears in the navigation that reached it.
   * A message descriptor, resolved at render through `useAppIntl`.
   */
  title: MessageDescriptor;
  /**
   * What this screen will do, in a sentence a researcher would understand —
   * not an implementation note. It is the only thing on the page, so it has to
   * be worth reading.
   */
  description: MessageDescriptor;
  /** The issue that builds it, so the reader can go and look. */
  issue: `#${number}`;
  /**
   * Something the researcher can actually do here, for the rare route that
   * owes them one before its screen exists — `/no-team`'s sign-out and its
   * language choice, the two things a session the whole app redirects there
   * (§6.4) can otherwise reach nowhere else.
   *
   * The exception proves the rule below rather than weakening it: these are
   * working controls the shell owns, not a preview of the unbuilt screen's.
   */
  action?: ReactNode;
};

/**
 * A screen the shell can reach but nobody has built yet.
 *
 * The shell's job is that every destination the product will have exists and
 * is addressable. A route that will be built therefore exists NOW, and says so
 * — which is a different thing from a broken link, and a different thing again
 * from a navigation edited down to only what happens to work today. Hiding an
 * unbuilt destination misdescribes the product; linking to nothing misleads
 * about it.
 *
 * It carries the same route contract every real screen does: its own `<h1>` is
 * the route's landing point, so focus lands here on arrival and the
 * destination is announced. A placeholder that skipped that would teach the
 * shell a habit each real screen inherits when it replaces one.
 *
 * Deliberately not a mock: no fake data, no controls that do nothing. A
 * disabled button is a promise about a shape nobody has designed yet.
 */
export default function Placeholder({
  title,
  description,
  issue,
  action,
}: PlaceholderProps) {
  const intl = useAppIntl();

  return (
    <div className="mx-auto flex w-full max-w-prose flex-col gap-3 p-6">
      <Heading level="h1" {...routeFocusTargetProps}>
        {intl.formatMessage(title)}
      </Heading>
      <Paragraph>{intl.formatMessage(description)}</Paragraph>
      <Paragraph className="text-text/60 text-sm">
        {intl.formatMessage(messages.unbuilt, { issue })}
      </Paragraph>
      {action}
    </div>
  );
}
