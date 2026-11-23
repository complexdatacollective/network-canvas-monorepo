import { useCallback, useContext, useMemo } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';

import { useProtocolContext } from '../state/protocolContext.ts';
import { useLatest } from '../state/useLatest.ts';
import {
  ruleSetAllowsEncryptedAttributes,
  ruleSetRules,
  ruleSetTargets,
  ruleSetValidationMessage,
  type RuleSetVariant,
} from './ruleSet.ts';

/** The field a row holds its own filter at: a side panel's, a preset's. */
const ROW_FILTER_FIELD = 'filter';

/**
 * A row's filter held to the codebook as it stands NOW.
 *
 * A rule set is validated against the types and attributes the rules may
 * name, and a collaborator can delete either while the row's dialog is open.
 * Read through a getter rather than closed over, for the reason
 * `useRuleSetValidation` gives: a field's validation is registered once, so a
 * closure would judge every later value against the codebook it was
 * registered with. The variant is read the same way — a rule that is fine
 * over the interview's own network is not fine over an imported file — and so
 * is the reader's formatter, so the verdict is stated in the language they
 * are reading now.
 *
 * The stage-level counterpart is `useRuleSetValidation`, which reads the
 * stage's form; this one is for a filter inside a row's own dialog form.
 */
export function useRowFilterValidation(variant: RuleSetVariant) {
  const protocolContext = useProtocolContext();
  const intl = useAppIntl();
  const codebook = useLatest(protocolContext.codebook);
  const currentVariant = useLatest(variant);
  const currentIntl = useLatest(intl);

  return useMemo(
    () => ({
      custom: messageRuleValidation([
        (value: unknown) =>
          value === undefined
            ? undefined
            : ruleSetValidationMessage(
                value,
                codebook(),
                ruleSetTargets(currentVariant()),
                {
                  intl: currentIntl(),
                  allowEncryptedAttributes:
                    ruleSetAllowsEncryptedAttributes(currentVariant()),
                },
              ),
      ]),
    }),
    [codebook, currentIntl, currentVariant],
  );
}

/** What switching a row's filter off destroys, in the row's own words. */
export type RowFilterClearWords = Readonly<{
  title: MessageDescriptor;
  description: MessageDescriptor;
  confirmLabel: MessageDescriptor;
}>;

/**
 * A row's own filter switch: on when there is something to switch off, and
 * asking before it throws anything away.
 *
 * The stage-level counterpart is `NetworkFilterSection`'s capability, and
 * reads the same: a researcher who has narrowed a stage meets the same
 * question when they narrow a panel or a preset.
 *
 * Cleared here rather than left to the collapsed group's unmount, for the
 * reason `BuilderSection` states: a field parked behind a closed group is not
 * unmounted again, so its value would survive and be written back with the
 * row.
 */
export function useRowFilterCapability(
  committed: unknown,
  words: RowFilterClearWords,
) {
  const intl = useAppIntl();
  const storeApi = useContext(FormStoreContext);
  const { confirm } = useDialog();
  // The row as it was opened, not as it stands: this decides whether the
  // switch STARTS on, and a live read would reopen the group under the
  // researcher the moment they cleared it.
  const hasRules = ruleSetRules(committed).length > 0;

  const requestFilterOpenChange = useCallback(
    async (open: boolean) => {
      if (open) return true;
      const state = storeApi?.getState();
      const filter = state?.hasValue(ROW_FILTER_FIELD)
        ? state.getValue(ROW_FILTER_FIELD)
        : undefined;
      if (ruleSetRules(filter).length > 0) {
        const confirmed = await confirm({
          title: intl.formatMessage(words.title),
          description: intl.formatMessage(words.description),
          confirmLabel: intl.formatMessage(words.confirmLabel),
          cancelLabel: intl.formatMessage(commonMessages.cancel),
          intent: 'warning' as const,
          onConfirm: () => undefined,
        });
        if (confirmed !== true) return false;
      }
      // Absent rather than an empty rule set: the schema has no way to say
      // "filtered by nothing", and an empty one is refused.
      state?.setFieldValue(ROW_FILTER_FIELD, undefined);
      return true;
    },
    [confirm, intl, storeApi, words],
  );

  return { hasRules, requestFilterOpenChange };
}
