'use client';

import { useEffect, useMemo, useReducer } from 'react';
import { useSelector } from 'react-redux';

import { useAppIntl } from '@codaco/app-i18n/react';
import { entityPrimaryKeyProperty, type NcNode } from '@codaco/shared-consts';

import { runtimeMessages } from '../../i18n/runtimeMessages';
import { useResolveLocalizedString } from '../../localization/ProtocolLocalizationProvider';
import { makeGetCodebookForNodeType } from '../../selectors/protocol';
import { decryptInScope, readCachedOutcome } from './decryptionScope';
import { nodeLabelText, readNodeLabelSource } from './nodeLabel';
import { useDecryptionScope } from './useDecryptionScope';
import { usePassphrase } from './usePassphrase';
import { useReportUnreadable } from './useReportUnreadable';

export function useNodeLabel(node: NcNode | undefined) {
  const intl = useAppIntl();
  const getCodebookForNodeType = useSelector(makeGetCodebookForNodeType);
  const codebook = node ? getCodebookForNodeType(node.type) : undefined;
  const resolve = useResolveLocalizedString();
  const typeLabel = codebook ? resolve(codebook.label).text : '';
  const scope = useDecryptionScope();
  const { requirePassphrase, encryptionUnavailable } = usePassphrase();
  const reportUnreadable = useReportUnreadable();

  // Read synchronously, so every label that needs no decrypting is available
  // on the FIRST committed render. Resolving plain labels through the async
  // effect below left a window where a node's accessible name was still the
  // type fallback; under a starved event loop (loaded CI) that window
  // stretched long enough for name-based queries and assistive tech to see
  // the wrong name.
  const source = useMemo(
    () =>
      node ? readNodeLabelSource(node, codebook?.variables ?? {}) : undefined,
    [node, codebook],
  );
  const encrypted = source?.status === 'encrypted' ? source.value : undefined;

  const [, rerender] = useReducer((count: number) => count + 1, 0);

  useEffect(() => {
    if (source?.status === 'unreadable') {
      reportUnreadable(source.reason);
      return;
    }
    if (!encrypted) return;

    if (!scope) {
      requirePassphrase();
      return;
    }

    const cached = readCachedOutcome(scope, encrypted);
    if (cached) {
      if (!cached.readable) reportUnreadable('decryption-failed');
      return;
    }

    let current = true;
    void decryptInScope(scope, encrypted).then((result) => {
      if (!result.readable) reportUnreadable('decryption-failed');
      if (current) rerender();
    });
    return () => {
      current = false;
    };
  }, [source, encrypted, scope, requirePassphrase, reportUnreadable]);

  if (!node || !source) return undefined;

  // Plaintext is read from the key's decryption scope on every render rather
  // than copied into component state, so it disappears from the label the
  // moment that key stops being in force.
  return nodeLabelText(source, {
    fallback:
      typeLabel.trim() === '' ? node[entityPrimaryKeyProperty] : typeLabel,
    unavailable: intl.formatMessage(runtimeMessages.answerUnavailable),
    scope,
    encryptionUnavailable,
  });
}
