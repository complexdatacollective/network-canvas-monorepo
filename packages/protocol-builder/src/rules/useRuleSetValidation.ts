import { useEffect, useMemo } from 'react';
import { z } from 'zod/mini';

import { useAppIntl } from '@codaco/app-i18n/react';
import type { CustomFieldValidation } from '@codaco/fresco-ui/form/store/types';

import { useStageEditorForm } from '../form/stageEditorContext.ts';
import { useStageValue } from '../form/stageFormHooks.ts';
import { useProtocolContext } from '../state/protocolContext.ts';
import { useLatest } from '../state/useLatest.ts';
import {
  ruleSetAllowsEncryptedAttributes,
  type RuleSetVariant,
  ruleSetTargets,
  ruleSetValidationMessage,
} from './ruleSet.ts';

/**
 * The rule set's own verdict, expressed as the field's validation.
 *
 * A rule set can be wrong in ways no control inside it can see: two rules that
 * never said how they combine, a set emptied down to nothing, a rule whose
 * attribute a collaborator has since deleted or retyped. The protocol schema
 * refuses every one of them, but only when the whole stage is saved, and in
 * its own words — "Too big: expected array to have <=1 items" is a sentence
 * about a Zod array, not about the rules on screen. Running the same verdict
 * as this field's validation is what puts the authored message on the control
 * that holds the problem, marks it invalid, blocks the submit before the
 * schema is reached, and lets the section outline say the section has a
 * problem rather than that it is finished.
 *
 * Returned rather than declared by the control itself because validation
 * belongs to the `Field`, not to what it renders: the section that mounts the
 * rule builder is the thing that can state it.
 */
export function useRuleSetValidation(
  name: string,
  /**
   * Which rule set this is, which decides what its rules may be about. Named
   * by the section rather than inferred from the field, because the section is
   * what mounts the matching control.
   */
  variant: RuleSetVariant,
): CustomFieldValidation {
  const { storeApi } = useStageEditorForm();
  const protocolContext = useProtocolContext();
  const intl = useAppIntl();
  const codebook = protocolContext.codebook;
  const value = useStageValue(name);
  const targets = ruleSetTargets(variant);
  const allowEncryptedAttributes = ruleSetAllowsEncryptedAttributes(variant);

  // `useField` memoises its validation function on `JSON.stringify` of the
  // validation props, and a function does not survive that serialisation: a
  // rule rebuilt each render would serialise identically every time and pin
  // the first closure — and its first codebook — forever. One entry for the
  // field's lifetime, reading the current codebook through a getter, keeps the
  // verdict live without ever re-registering the field. The set this field is
  // for and the reader's own formatter are read the same way, so that the one
  // registered validation judges the set this field is for now and states its
  // verdict in the language the researcher is reading right now, not the ones
  // it was registered with.
  const judgeAgainst = useLatest({
    codebook,
    targets,
    allowEncryptedAttributes,
    intl,
  });
  const validation = useMemo<CustomFieldValidation>(
    () => ({
      // The rules are not a shape that can be summarised as an up-front
      // constraint, and no rule-set field asks for validation hints.
      hint: '',
      schema: () =>
        z.unknown().check(
          z.superRefine((fieldValue, ctx) => {
            const current = judgeAgainst();
            const message = ruleSetValidationMessage(
              fieldValue,
              current.codebook,
              current.targets,
              {
                intl: current.intl,
                allowEncryptedAttributes: current.allowEncryptedAttributes,
              },
            );
            if (message === undefined) return;
            ctx.addIssue({
              code: 'custom',
              input: fieldValue,
              message,
              path: [],
            });
          }),
        ),
    }),
    [judgeAgainst],
  );

  const message = ruleSetValidationMessage(value, codebook, targets, {
    intl,
    allowEncryptedAttributes,
  });

  // Field validation runs when the researcher touches a field, and on submit.
  // Neither covers the two ways a rule set goes wrong on its own: an edit made
  // somewhere else in the protocol, and a change to the rules that leaves the
  // field's own value looking answered. Re-running the field's validation
  // whenever this verdict changes is what lets the outline report a problem
  // the moment it appears rather than at the next save.
  //
  // Only when there is a verdict to report, or an error already standing that
  // it would now clear: validating an untouched empty field would write the
  // "required" error nobody has earned yet, and turn a section that is merely
  // unfinished into one with a problem.
  useEffect(() => {
    const state = storeApi.getState();
    if (message === undefined && state.getFieldErrors(name) === null) return;
    void state.validateField(name);
  }, [message, name, storeApi]);

  return validation;
}
