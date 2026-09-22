import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';

import {
  getValidationLabel,
  isValidationMap,
  rulesSurvivingTypeChange,
} from '../codebook/variableValidation.ts';
import { isCollectableType } from './collectableTypes.ts';

/**
 * No rules were taken off the draft — held as one value so that saying so
 * twice is the same value twice, and a state that has not changed is not a
 * render.
 */
const NOTHING_DROPPED: readonly string[] = [];

const messages = defineMessages({
  rulesDroppedForNewKind: {
    id: 'protocolBuilder.attributeCodebookControls.rulesDroppedForNewKind',
    defaultMessage:
      '{ruleCount, plural, one {Changing the kind of answer removed a rule that does not carry over: {ruleNames}.} other {Changing the kind of answer removed rules that do not carry over: {ruleNames}.}}',
    description:
      'Shown after the researcher changes the kind of answer an attribute they are inventing holds, when rules they had already written for it cannot be kept — either the new kind does not accept them, or they compare this answer with another attribute that is no longer comparable. ruleNames is the list of rule names, already translated.',
  },
});

/**
 * A value of the row dialog's OWN form, live.
 *
 * `useStageValue` deliberately reads past the dialog to the stage behind it,
 * which is right for everything a row needs to know about its surroundings and
 * wrong for the row itself: the picker's current choice only exists in the
 * dialog's store until the row is saved, so a row editor reading the stage
 * would never see the researcher choose anything.
 */
export function useRowValue(name: string): unknown {
  const storeApi = useContext(FormStoreContext);

  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      storeApi === undefined
        ? () => undefined
        : storeApi.subscribe(onStoreChange),
    [storeApi],
  );
  const getSnapshot = useCallback((): unknown => {
    if (storeApi === undefined) return undefined;
    const state = storeApi.getState();
    return state.hasValue(name) ? state.getValue(name) : undefined;
  }, [name, storeApi]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export type AttributeCodebookControlsProps = Readonly<{
  inventing?: Readonly<{
    type: string;
    rulesField: string;
  }>;
}>;

export default function AttributeCodebookControls({
  inventing,
}: AttributeCodebookControlsProps) {
  const intl = useAppIntl();
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const heldDraftRules = useRowValue(inventing?.rulesField ?? '');
  const [rulesDropped, setRulesDropped] =
    useState<readonly string[]>(NOTHING_DROPPED);
  const inventedType =
    inventing !== undefined && isCollectableType(inventing.type)
      ? inventing.type
      : undefined;
  const rulesField = inventing?.rulesField;
  const kindTheDraftWasWrittenFor = useRef(inventedType);
  /**
   * The draft this component last narrowed, so the researcher's own edits can
   * be told from its own write.
   *
   * The notice ends at the act that answers it — the researcher going back to
   * the rules and looking at what is left against the kind the row holds now —
   * and the only signal of that act is the rules draft changing for a reason
   * other than this effect writing it.
   */
  const rulesWeWrote = useRef<unknown>(undefined);
  useEffect(() => {
    const previousKind = kindTheDraftWasWrittenFor.current;
    kindTheDraftWasWrittenFor.current = inventedType;
    // The row is no longer inventing anything: the create landed, or an
    // attribute the codebook already holds was picked instead. The draft the
    // notice is about went with the invention, so there is nothing left for it
    // to report. Asked before the kind is compared, because a row that leaves
    // the invention with no kind chosen leaves it without moving one.
    if (rulesField === undefined) {
      setRulesDropped(NOTHING_DROPPED);
      return;
    }
    if (previousKind === inventedType) {
      // The researcher has been back to the rules since the change of kind
      // that took some away: the draft they are looking at is the one the
      // notice is about, so the notice has nothing left to report.
      if (heldDraftRules !== rulesWeWrote.current) {
        setRulesDropped(NOTHING_DROPPED);
      }
      return;
    }
    if (inventedType === undefined) return;
    if (!isValidationMap(heldDraftRules)) return;
    const { kept, dropped } = rulesSurvivingTypeChange(
      heldDraftRules,
      inventedType,
    );
    // A change of kind that takes nothing away has shown the researcher
    // nothing, so it cannot stand in for the record: the notice about the
    // earlier change stands until they have looked at the draft against the
    // kind it is now for (the rules editor's save) or the row has left the
    // invention. One that takes more away replaces the list, because what it
    // names is the rules that have just gone.
    if (dropped.length === 0) return;
    setRulesDropped(dropped);
    rulesWeWrote.current = kept;
    setFieldValue(rulesField, kept);
  }, [heldDraftRules, inventedType, rulesField, setFieldValue]);

  if (inventing === undefined && rulesDropped.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={rulesDropped.length === 0 ? undefined : 'mb-8'}
    >
      {rulesDropped.length > 0 && (
        <Alert variant="info" role="presentation">
          <AlertDescription>
            {intl.formatMessage(messages.rulesDroppedForNewKind, {
              ruleCount: rulesDropped.length,
              ruleNames: intl.formatList(
                rulesDropped.map((rule) => getValidationLabel(rule, intl)),
              ),
            })}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
