import type { ReactNode } from 'react';

import { routeFocusTargetProps } from '@codaco/fresco-ui/navigation/RouteFocus';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

export type PlaceholderProps = {
  /** The screen's name, as it appears in the navigation that reached it. */
  title: string;
  /**
   * What this screen will do, in a sentence a researcher would understand —
   * not an implementation note. It is the only thing on the page, so it has to
   * be worth reading.
   */
  description: string;
  /** The issue that builds it, so the reader can go and look. */
  issue: `#${number}`;
  /**
   * Something the researcher can actually do here, for the rare route that
   * owes them one before its screen exists — `/no-team`'s sign-out, which is
   * the only way off a screen the whole app redirects to (§6.4).
   *
   * The exception proves the rule below rather than weakening it: this is a
   * working control the shell owns, not a preview of the unbuilt screen's.
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
  return (
    <div className="mx-auto flex w-full max-w-prose flex-col gap-3 p-6">
      <Heading level="h1" {...routeFocusTargetProps}>
        {title}
      </Heading>
      <Paragraph>{description}</Paragraph>
      <Paragraph className="text-text/60 text-sm">
        This screen has not been built yet. It is specified in {issue}.
      </Paragraph>
      {action}
    </div>
  );
}
