'use client';

import { type ReactNode, useCallback, useMemo } from 'react';

import {
  AppIntlOverlay,
  type AppMessageOverride,
} from '@codaco/app-i18n/react';
import {
  INTERFACE_TEXT_MESSAGES,
  type InterfaceText,
  type LocalizedString,
} from '@codaco/protocol-validation';

import type { LocalizedMessageValues } from './messageFormatter';
import { useResolveLocalizedMessage } from './ProtocolLocalizationProvider';

/**
 * The text `interfaceText` holds for each catalog message, by message id.
 */
const heldTextById = (
  interfaceText: InterfaceText | undefined,
): ReadonlyMap<string, LocalizedString> => {
  const held = new Map<string, LocalizedString>();
  for (const { group, key, id } of INTERFACE_TEXT_MESSAGES) {
    const value = interfaceText?.[group as keyof InterfaceText]?.[key];
    if (value !== undefined) held.set(id, value);
  }
  return held;
};

/**
 * `values` when every one is plain text, a number or a yes-or-no, as protocol
 * text takes them. A yes-or-no is given as `true` or `false`, the case a
 * message's `select` matches it by, as the catalog's would.
 */
const plainValues = (
  values: Readonly<Record<string, unknown>> | undefined,
): LocalizedMessageValues | undefined => {
  const plain: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(values ?? {})) {
    if (typeof value === 'boolean') {
      plain[name] = String(value);
      continue;
    }
    if (typeof value !== 'string' && typeof value !== 'number') {
      return undefined;
    }
    plain[name] = value;
  }
  return plain;
};

/**
 * Shows the interview's shared words — Back, Continue, Exit interview and the
 * like — as the protocol words them, in the interview's language, wherever
 * the interview and the controls it uses ask their catalogs for them. A
 * message the protocol holds no text for keeps its catalog wording, so a
 * protocol made before it held this text shows what it always did.
 */
export function InterfaceTextOverlay({
  interfaceText,
  children,
}: {
  interfaceText: InterfaceText | undefined;
  children: ReactNode;
}) {
  const resolve = useResolveLocalizedMessage();
  const held = useMemo(() => heldTextById(interfaceText), [interfaceText]);

  const override = useCallback<AppMessageOverride>(
    (message, values) => {
      const value = message.id === undefined ? undefined : held.get(message.id);
      if (value === undefined) return undefined;
      // A message given markup to wrap its words in keeps its catalog's
      // wording, since protocol text is plain.
      const plain = plainValues(values);
      return plain === undefined ? undefined : resolve(value, plain).text;
    },
    [held, resolve],
  );

  return <AppIntlOverlay override={override}>{children}</AppIntlOverlay>;
}
