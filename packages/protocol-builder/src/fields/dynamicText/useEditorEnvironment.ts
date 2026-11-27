import { useMemo, useState } from 'react';

import { useAppDirection, useAppIntl } from '@codaco/app-i18n/react';
import { presentationalTextValue } from '@codaco/fresco-ui/PresentationalText';
import {
  dynamicAttributeMayShow,
  type LocaleTag,
} from '@codaco/protocol-validation';

import {
  asConditionDraft,
  type ConditionDraft,
  conditionAboutChoices,
  conditionCodebook,
  conditionSentence,
} from '../../localization/conditionText.ts';
import {
  type DynamicValueChoice,
  dynamicValueChoices,
} from '../../localization/dynamicValueCatalog.ts';
import {
  resolveStoredTranslation,
  resolveTranslation,
} from '../../localization/localizedText.ts';
import { useEditingLanguage } from '../../localization/ProtocolLocalization.tsx';
import type { ConditionScope } from '../../rules/ConditionRulesControl.tsx';
import type {
  DynamicTextEnvironment,
  WordingEditors,
} from './editorEnvironment.ts';
import type { DynamicMessageSite } from './messageSite.ts';
import { namingFor, type ValueNaming } from './valueNaming.ts';

const NOTHING: Readonly<Record<string, unknown>> = Object.freeze({});
const ONE_PLACE = () => 1;
const EVERY_ONE = () => true;

type EditorEnvironmentOptions = Readonly<{
  site: DynamicMessageSite;
  locale: LocaleTag;
  readOnly: boolean;
  disabled?: boolean | undefined;
  /** For the text of a form: the attribute each of its fields collects. */
  formFieldVariable?: ((fieldId: string) => string | undefined) | undefined;
  /**
   * For the wording of a version of a dynamic attribute: its id. The
   * Attribute menu then offers only the dynamic attributes that it may show
   * (`dynamicAttributeMayShow`): not itself, and not one whose wording shows
   * it.
   */
  ownDynamicAttribute?: string | undefined;
  /** The editors of a dynamic attribute's wording. */
  editors: WordingEditors;
}>;

export type EditorEnvironmentState = Readonly<{
  environment: DynamicTextEnvironment;
  naming: ValueNaming;
  choices: readonly DynamicValueChoice[];
  /**
   * What every pill says, so a renamed attribute, a changed dynamic
   * attribute or another language redraws the pills of a document already
   * open.
   */
  pillLabelsKey: string;
}>;

/**
 * What the views of a text's editor know about where the text is
 * (`DynamicTextEnvironment`), from the text's site: how its values are
 * named, what it can show, the conditions and dynamic attributes declared
 * beside it and what writes them. Every editor of researcher text that shows
 * values builds it here: a text's own editor and the editor of number
 * wording.
 */
export function useEditorEnvironment({
  site,
  locale,
  readOnly,
  disabled,
  formFieldVariable,
  ownDynamicAttribute,
  editors,
}: EditorEnvironmentOptions): EditorEnvironmentState {
  const intl = useAppIntl();
  const appDirection = useAppDirection();
  const { localization } = useEditingLanguage();
  const { context } = site;
  const conditionValues = site.conditions?.values ?? NOTHING;
  const dynamicAttributes = site.dynamicAttributes?.values ?? NOTHING;
  const setConditions = readOnly ? undefined : site.conditions?.set;
  const setDynamicAttributes = readOnly
    ? undefined
    : site.dynamicAttributes?.set;
  const subject = site.conditions?.subject;
  const codebook = site.conditions?.codebook;
  const aboutChoices = conditionAboutChoices(context, subject);
  const allowEgoRules =
    site.conditions?.allowEgoRules === true && context.roles.has('ego');
  // An “If” can be written where conditions can be, and where there is
  // something for its rules to be about.
  const writesConditions =
    setConditions !== undefined && (aboutChoices.length > 0 || allowEgoRules);
  const [pendingLogicBlock, setPendingLogicBlock] =
    useState<HTMLElement | null>(null);

  const labelText = (label: unknown): string =>
    label === undefined
      ? ''
      : resolveTranslation(label, localization, locale).text;
  const naming = namingFor(intl, {
    context,
    codebook,
    conditions: conditionValues,
    dynamicAttributes,
    labelText,
    wordingOf: (wording) =>
      resolveStoredTranslation(wording, localization, locale),
    interfaceLanguage: { lang: intl.locale, dir: appDirection },
  });
  const choices = dynamicValueChoices(context);
  const scope: ConditionScope = {
    aboutChoices,
    codebook,
    subject,
    allowEgoRules,
  };
  const sentenceOf = (condition: ConditionDraft): string =>
    conditionSentence(condition, {
      codebook: conditionCodebook(
        codebook,
        subject,
        condition.about ?? aboutChoices[0],
        allowEgoRules,
      ),
      intl,
      localization,
      locale,
    });

  const environment: DynamicTextEnvironment = {
    owner: site.owner ?? 'stage',
    site,
    editors,
    locale,
    defaultLocale: localization?.defaultLocale ?? locale,
    naming,
    choices,
    conditions: {
      values: conditionValues,
      ...(setConditions !== undefined && { set: setConditions }),
      scope,
      writes: writesConditions,
    },
    dynamicAttributes: {
      values: dynamicAttributes,
      ...(setDynamicAttributes !== undefined && { set: setDynamicAttributes }),
      usageCount: site.dynamicAttributeUsage ?? ONE_PLACE,
      mayShow:
        ownDynamicAttribute === undefined
          ? EVERY_ONE
          : (id) =>
              dynamicAttributeMayShow(
                ownDynamicAttribute,
                id,
                dynamicAttributes,
              ),
    },
    isForm: formFieldVariable !== undefined,
    ...(formFieldVariable !== undefined && { formFieldVariable }),
    editable: !readOnly && disabled !== true,
    labelText,
    sentenceOf,
    conditionSentence: (conditionId) =>
      sentenceOf(
        asConditionDraft(
          Object.hasOwn(conditionValues, conditionId)
            ? conditionValues[conditionId]
            : undefined,
        ),
      ),
    pendingLogicBlock,
    setPendingLogicBlock,
  };

  const pillLabelsKey = useMemo(
    () =>
      JSON.stringify([
        locale,
        intl.locale,
        appDirection,
        choices.map((choice) => [
          choice.name,
          presentationalTextValue(naming.valueLabel(choice)),
        ]),
        dynamicAttributes,
      ]),
    [locale, intl.locale, appDirection, choices, naming, dynamicAttributes],
  );

  return { environment, naming, choices, pillLabelsKey };
}
