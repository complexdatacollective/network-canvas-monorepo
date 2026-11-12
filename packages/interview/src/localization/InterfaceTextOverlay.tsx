'use client';

import { type ReactNode, useCallback, useMemo } from 'react';

import {
  AppIntlOverlay,
  type AppMessageOverride,
} from '@codaco/app-i18n/react';
import {
  INTERFACE_TEXT_MESSAGES,
  type InterfaceText,
  interfaceTextShown,
  type LocalizationDeclaration,
  type LocalizedString,
} from '@codaco/protocol-validation';

import type { LocalizedMessageValues } from './messageFormatter';
import {
  useProtocolLocalization,
  useResolveLocalizedMessage,
} from './ProtocolLocalizationProvider';

/**
 * The text the interview shows for each catalog message, by message id: the
 * protocol's own text in each language it holds, and Network Canvas's
 * wording in each language it does not (see `interfaceTextShown`).
 */
const shownTextById = (
  interfaceText: InterfaceText | undefined,
  localization: LocalizationDeclaration,
): ReadonlyMap<string, LocalizedString> => {
  const shown = new Map<string, LocalizedString>();
  for (const { group, key, id } of INTERFACE_TEXT_MESSAGES) {
    const value = interfaceTextShown(interfaceText, group, key, localization);
    if (value !== undefined) shown.set(id, value);
  }
  return shown;
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
 * like — in the interview's language, wherever the interview and the controls
 * it uses ask their catalogs for them: as the protocol words them where it
 * holds them, and as Network Canvas words them where it does not. A message
 * with no text in any of the protocol's languages keeps its catalog wording.
 */
export function InterfaceTextOverlay({
  interfaceText,
  children,
}: {
  interfaceText: InterfaceText | undefined;
  children: ReactNode;
}) {
  const resolve = useResolveLocalizedMessage();
  const localization = useProtocolLocalization();
  const shown = useMemo(
    () => shownTextById(interfaceText, localization),
    [interfaceText, localization],
  );

  const override = useCallback<AppMessageOverride>(
    (message, values) => {
      const value =
        message.id === undefined ? undefined : shown.get(message.id);
      // Text with no words in any language keeps the catalog's wording: only
      // a protocol still being written in a language Network Canvas has no
      // wording in, which Architect previews, has it.
      if (value === undefined || Object.keys(value).length === 0) {
        return undefined;
      }
      // A message given markup to wrap its words in keeps its catalog's
      // wording, since protocol text is plain.
      const plain = plainValues(values);
      return plain === undefined ? undefined : resolve(value, plain).text;
    },
    [shown, resolve],
  );

  return <AppIntlOverlay override={override}>{children}</AppIntlOverlay>;
}
