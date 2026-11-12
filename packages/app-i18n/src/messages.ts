import { parse } from '@formatjs/icu-messageformat-parser';
import type { MessageFormatElement } from '@formatjs/icu-messageformat-parser';
// The public server entry is universal: unlike react-intl's default entry,
// it has no client directive or context hooks, and preserves rich React nodes.
import {
  createIntl,
  createIntlCache,
  defineMessage as defineIntlMessage,
  defineMessages as defineIntlMessages,
} from 'react-intl/server';
import type {
  IntlConfig,
  IntlShape,
  MessageDescriptor,
} from 'react-intl/server';

import { textDirectionOf } from '@codaco/shared-consts';
import type { TextDirection } from '@codaco/shared-consts';

import { isolateArguments, isolatedArgumentNames } from './bidi.ts';
import type { CatalogMessages } from './locales.ts';

/**
 * react-intl 11+ gives every helper result an ICU argument contract, and a
 * call without explicit generics gets the empty one — so a descriptor whose
 * message has placeholders could no longer be formatted with its values.
 * Contracts are opt-in upstream (written by eslint-plugin-formatjs's
 * `enforce-message-types` autofix, which only recognises react-intl's own
 * modules), so the curated API pins react-intl's untyped helper signatures:
 * readonly descriptors, values checked at runtime and by the
 * `formatjs/enforce-placeholders` lint rule rather than by the type system.
 *
 * Re-typed, not wrapped: the bindings stay react-intl's own functions, so the
 * build transform and extraction see the same calls they always did.
 */
type DefineMessages = <
  K extends PropertyKey,
  T = MessageDescriptor,
  U extends Record<K, T> = Record<K, T>,
>(
  messages: U,
) => { readonly [P in keyof U]: Readonly<U[P]> };
type DefineMessage = <T extends MessageDescriptor>(message: T) => Readonly<T>;

export const defineMessages: DefineMessages = defineIntlMessages;
export const defineMessage: DefineMessage = defineIntlMessage;
export type { IntlShape, MessageDescriptor };
export { createMessageError, formatMessageError } from './messageErrors.ts';
export {
  FIRST_STRONG_ISOLATE,
  POP_DIRECTIONAL_ISOLATE,
  isolateArguments,
  isolatedArgumentNames,
  withoutIsolates,
} from './bidi.ts';
export type { MessageErrorValues } from './messageErrors.ts';

export type AppIntlErrorHandler = NonNullable<IntlConfig['onError']>;

/**
 * Missing translations are the designed fallback path — override locales are
 * sparse by policy and every descriptor carries its English defaultMessage, so
 * a locale would report on nearly every message it does not override. That
 * class is dropped before anyone sees it, including a host handler.
 *
 * Every other class is a real defect: a value the message did not expect, ICU
 * a translation broke. Those keep react-intl's own behaviour of reporting to
 * the console, because configuring `onError` at all replaces its default
 * reporter — filtering without putting something back is how a formatting
 * failure ends up visible nowhere, in development included.
 */
export const makeOnError =
  (onError?: AppIntlErrorHandler): AppIntlErrorHandler =>
  (error) => {
    const code: string = error.code;
    if (code === 'MISSING_TRANSLATION') return;
    if (onError === undefined) {
      // oxlint-disable-next-line no-console -- Restores the reporting react-intl does by default; hosts that want the error routed elsewhere pass `onError`.
      console.error(error);
      return;
    }
    onError(error);
  };

type FormatMessage = IntlShape['formatMessage'];
type MessageSource = string | MessageFormatElement[];

/**
 * A non-React formatter for servers, scripts, and tests — the same shape the
 * provider serves to components. Next.js hosts use this on the server;
 * `AppI18nProvider` is its client-side counterpart.
 *
 * Text interpolated into a message is bidi-isolated (see `isolateArguments`)
 * whenever it could otherwise reorder with the sentence around it: every text
 * value in a right-to-left language, and in a left-to-right one only a value
 * with right-to-left text in it. A left-to-right message whose values are all
 * left-to-right text formats exactly as react-intl would.
 */
export function createAppIntl(options: {
  locale: string;
  messages?: CatalogMessages;
  onError?: AppIntlErrorHandler;
  /**
   * IANA zone for `{…, date}` and `{…, time}` arguments. Left unset each
   * formatter uses the zone of whatever process it runs in, which is a
   * hydration mismatch waiting to happen on a Next host: the server renders a
   * timestamp in the container's zone and the browser re-renders it in the
   * reader's, so a message near midnight changes date between the two.
   * Fresco is the host this matters for; a Vite SPA has only one process and
   * can leave it alone.
   */
  timeZone?: string;
  /**
   * The direction the formatted text is shown in, which decides which values
   * are isolated. Defaults to the locale's own; `AppI18nProvider` passes the
   * direction it shows the language in, which `AppDirectionOverride` can
   * change.
   */
  direction?: TextDirection;
}): IntlShape {
  const messages = options.messages ?? {};
  const direction = options.direction ?? textDirectionOf(options.locale);
  const intl = createReactIntl(options.locale, messages, options);

  // A rewritten message is formatted by a second formatter whose catalog
  // holds, for the one call, the rewritten translation under the message's
  // id. Its descriptor carries the rewritten default message. react-intl then
  // does what it always does: formats the translation, and if that fails,
  // reports it and falls back to the default. The catalog is cleared after
  // each call (formatting is synchronous), so a translation never answers for
  // a later message.
  const isolatedCatalog: Record<string, MessageSource | undefined> = {};
  let isolating: IntlShape | undefined;
  const rewritten = new Map<
    MessageSource,
    Map<string, MessageFormatElement[]>
  >();

  const isolatedMessage = (
    source: MessageSource,
    names: ReadonlySet<string>,
  ): MessageFormatElement[] => {
    let byNames = rewritten.get(source);
    if (byNames === undefined) {
      byNames = new Map();
      rewritten.set(source, byNames);
    }
    const key = [...names].toSorted().join('\u0000');
    let message = byNames.get(key);
    if (message === undefined) {
      message = isolateArguments(
        typeof source === 'string' ? parse(source) : source,
        names,
      );
      byNames.set(key, message);
    }
    return message;
  };

  // react-intl 11+ overloads formatMessage per argument contract, which no
  // longer types an implementation's parameters contextually; these are the
  // untyped overload's, the one every curated descriptor resolves to.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- FormatMessage is an overload set that no single implementation signature satisfies; this one serves its untyped overload
  const formatMessage = ((
    descriptor: MessageDescriptor,
    values?: Parameters<FormatMessage>[1],
    opts?: Parameters<FormatMessage>[2],
  ) => {
    const names = isolatedArgumentNames(values, direction);
    const id = descriptor.id;
    const translation = id === undefined ? undefined : messages[id];
    const fallback = descriptor.defaultMessage;
    if (
      names.size === 0 ||
      id === undefined ||
      (translation === undefined && fallback === undefined)
    ) {
      return intl.formatMessage(descriptor, values, opts);
    }
    let isolatedTranslation: MessageSource | undefined;
    let isolatedFallback: MessageFormatElement[] | undefined;
    try {
      // An empty translation stays as it is: react-intl reads it as missing
      // and falls back, which an empty parsed message would not do.
      isolatedTranslation =
        translation === undefined || translation === ''
          ? translation
          : isolatedMessage(translation, names);
      isolatedFallback =
        fallback === undefined ? undefined : isolatedMessage(fallback, names);
    } catch {
      // Unparseable ICU is react-intl's error to report, with the id and the
      // message in hand, and its fallback to make.
      return intl.formatMessage(descriptor, values, opts);
    }
    isolating ??= createReactIntl(options.locale, isolatedCatalog, options);
    isolatedCatalog[id] = isolatedTranslation;
    try {
      const isolated = { ...descriptor, defaultMessage: isolatedFallback };
      return isolating.formatMessage(isolated, values, opts);
    } finally {
      isolatedCatalog[id] = undefined;
    }
  }) as FormatMessage;

  return { ...intl, formatMessage, $t: formatMessage };
}

function createReactIntl(
  locale: string,
  messages: Readonly<
    Record<string, string | MessageFormatElement[] | undefined>
  >,
  options: Readonly<{ onError?: AppIntlErrorHandler; timeZone?: string }>,
): IntlShape {
  return createIntl(
    {
      locale,
      timeZone: options.timeZone,
      // The reader's locale, NOT 'en'. react-intl formats a message through
      // `defaultLocale` whenever it falls back to the descriptor's
      // `defaultMessage` — which, with the sparse override catalogs this
      // design is built on, is nearly every message an en-GB reader sees.
      // Pinned to 'en' it made `{when, date, short}` render as `1/2/20`
      // rather than `02/01/20` for exactly the messages en-GB does not
      // override, so a locale's dates and numbers came out right only where
      // somebody had happened to translate the words around them.
      //
      // It also stops react-intl reporting MISSING_TRANSLATION, which is what
      // we want and already the case: a sparse override catalog is missing
      // most ids by design, so that error carries no signal here.
      defaultLocale: locale,
      // Catalog values are ICU strings in dev/tests and pre-parsed AST in
      // production builds; react-intl accepts both, but its option type only
      // names the string form.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- react-intl accepts the pre-parsed AST form at run time; only its option type is narrower
      messages: messages as Record<string, string>,
      onError: makeOnError(options.onError),
    },
    createIntlCache(),
  );
}
