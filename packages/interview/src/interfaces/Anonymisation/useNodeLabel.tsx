'use client';

import { useEffect, useMemo, useReducer } from 'react';
import { useSelector } from 'react-redux';

import { useAppIntl } from '@codaco/app-i18n/react';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { runtimeMessages } from '../../i18n/runtimeMessages';
import { useResolveLocalizedString } from '../../localization/ProtocolLocalizationProvider';
import { makeGetCodebookForNodeType } from '../../selectors/protocol';
import { getNodeLabelAttribute } from '../../utils/getNodeLabelAttribute';
import {
  decryptInScope,
  readCachedOutcome,
  readEncryptedAttribute,
} from './decryptionScope';
import { useDecryptionScope } from './useDecryptionScope';
import { usePassphrase } from './usePassphrase';
import { useReportUnreadable } from './useReportUnreadable';

const LOCKED_LABEL = '🔒';

export function useNodeLabel(node: NcNode | undefined) {
  const intl = useAppIntl();
  const getCodebookForNodeType = useSelector(makeGetCodebookForNodeType);
  const codebook = node ? getCodebookForNodeType(node.type) : undefined;
  const resolve = useResolveLocalizedString();
  const typeLabel = codebook ? resolve(codebook.label).text : '';
  const fallback =
    typeLabel.trim() === '' ? node?.[entityPrimaryKeyProperty] : typeLabel;
  const scope = useDecryptionScope();
  const { requirePassphrase, encryptionUnavailable } = usePassphrase();
  const reportUnreadable = useReportUnreadable();

  // The variables as this node stores them: one whose value its record says is
  // encrypted counts as encrypted when choosing the label, as when reading it,
  // so a name stored encrypted under a variable the codebook no longer
  // encrypts is still decrypted and shown as the name.
  const labelVariables = useMemo(() => {
    const variables = codebook?.variables ?? {};
    if (!node) return variables;
    return Object.fromEntries(
      Object.entries(variables).map(([variableId, variable]) => [
        variableId,
        !variable.encrypted &&
        readEncryptedAttribute(node, variableId, variables)
          ? { ...variable, encrypted: true }
          : variable,
      ]),
    );
  }, [node, codebook]);

  const labelAttributeId = getNodeLabelAttribute(
    labelVariables,
    node?.[entityAttributesProperty] ?? {},
  );

  const stored = useMemo(
    () =>
      node && labelAttributeId
        ? readEncryptedAttribute(
            node,
            labelAttributeId,
            codebook?.variables ?? {},
          )
        : undefined,
    [node, labelAttributeId, codebook],
  );
  const encrypted = stored?.status === 'encrypted' ? stored.value : undefined;

  // Synchronous label for every non-decrypt case, available on the FIRST
  // committed render. Resolving plain labels through the async effect below
  // left a window where a node's accessible name was still the type fallback;
  // under a starved event loop (loaded CI) that window stretched long enough
  // for name-based queries and assistive tech to see the wrong name.
  const syncLabel = useMemo(() => {
    if (!node) return undefined;
    if (stored) return undefined;
    if (!labelAttributeId) return fallback;
    const value = node[entityAttributesProperty]?.[labelAttributeId];
    // getNodeLabelAttribute only nominates text/number-valued attributes;
    // anything else (stale codebook, ciphertext arrays) falls back.
    return typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : fallback;
  }, [node, stored, fallback, labelAttributeId]);

  // Plaintext is read from the key's decryption scope on every render rather
  // than copied into component state, so it disappears from the label the
  // moment that key stops being in force.
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  const outcome =
    encrypted && scope ? readCachedOutcome(scope, encrypted) : undefined;

  useEffect(() => {
    if (stored?.status === 'unreadable') {
      reportUnreadable(stored.reason);
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
  }, [stored, encrypted, scope, requirePassphrase, reportUnreadable]);

  if (syncLabel !== undefined) return syncLabel;
  if (
    stored?.status === 'unreadable' ||
    outcome?.readable === false ||
    (encrypted && encryptionUnavailable)
  ) {
    return intl.formatMessage(runtimeMessages.answerUnavailable);
  }
  if (encrypted && !scope) return LOCKED_LABEL;
  return outcome?.readable ? outcome.plaintext : undefined;
}
