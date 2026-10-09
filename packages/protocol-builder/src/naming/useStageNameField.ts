import { useCallback } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import type { useField } from '@codaco/fresco-ui/form/hooks/useField';
import type { LocalizedString } from '@codaco/protocol-validation';

import { useStageEditorForm } from '../form/stageEditorContext.ts';
import {
  asLocalizedString,
  localeDirection,
  translationText,
} from '../localization/localizedText.ts';
import { useEditingLanguage } from '../localization/ProtocolLocalization.tsx';
import { MAX_LABEL_LENGTH } from './generateStageLabel.ts';
import {
  LABEL,
  stageNameMessages,
  useStageNameRegistration,
  useStageNameWriter,
} from './stageNameInternals.ts';

/** Put on the element that wraps the control and the refusal beneath it. */
export type StageNameContainerProps = ReturnType<
  typeof useField
>['containerProps'];

/**
 * Everything a single-line text control needs to BE the stage's name, shaped
 * for `fields/StageNameInput`.
 */
export type StageNameFieldProps = Readonly<{
  'id': string;
  'name': string;
  /**
   * The form this control belongs to, as the `form` attribute. A title is
   * drawn outside the `<form>` element, and a control with no form owner has
   * no implicit submission: Enter does nothing at all, with no newline and no
   * save.
   */
  'form': string;
  /** The editing language, which the name's text is written in. */
  'lang': string | undefined;
  'dir': 'ltr' | 'rtl' | undefined;
  /** The name's translation in the editing language, as plain text. */
  'value': string;
  'onChange': (value: string) => void;
  /** `useAutoStageName().onBlur`, for a host that proposes names. */
  'onFieldBlur'?: (() => void) | undefined;
  'placeholder': string;
  'characterLimit': number;
  'disabled': boolean;
  'readOnly': boolean;
  'aria-required': boolean;
  'aria-invalid': boolean;
  'aria-labelledby': string | undefined;
  'aria-describedby': string | undefined;
}>;

export type StageNameField = Readonly<{
  /** The id `fieldElementIds` derives the label's and the refusal's from. */
  id: string;
  /** What a control naming the field calls it, in the reader's language. */
  label: string;
  /**
   * What the editor refuses about the name, once it is worth saying, as an
   * encoded descriptor a host decodes with `formatMessageError`. One sentence,
   * because the only rule this package puts on a name is that there has to be
   * one.
   */
  error: string | undefined;
  /** Every translation of the name, for a control that shows which are missing. */
  translations: LocalizedString | undefined;
  containerProps: StageNameContainerProps;
  fieldProps: StageNameFieldProps;
}>;

/**
 * Binds a control to the stage's name.
 *
 * One caller per CONTROL — `fields/StageNameField` is that caller for a host
 * that wants the markup too. A host that only READS or WRITES the name calls
 * `useStageName`; both hold the registration, and holders are counted, so
 * neither disturbs the other.
 */
export function useStageNameField(): StageNameField {
  const { formId } = useStageEditorForm();
  const { locale } = useEditingLanguage();
  const intl = useAppIntl();
  const write = useStageNameWriter();
  const { id, containerProps, fieldProps, meta } = useStageNameRegistration();

  const onChange = useCallback(
    (next: string) => {
      write(next, 'chosen');
    },
    [write],
  );

  const label = intl.formatMessage(stageNameMessages.stageName);
  const placeholder = intl.formatMessage(stageNameMessages.placeholder);
  // `shouldShowError` keeps "you have not answered this" from appearing before
  // the researcher has had a chance to.
  const error = meta.shouldShowError ? meta.errors?.[0] : undefined;

  return {
    id,
    label,
    error,
    translations: asLocalizedString(fieldProps.value),
    containerProps,
    fieldProps: {
      'id': id,
      'name': LABEL,
      'form': formId,
      'lang': locale,
      'dir': locale === undefined ? undefined : localeDirection(locale),
      'value':
        locale === undefined ? '' : translationText(fieldProps.value, locale),
      onChange,
      placeholder,
      'characterLimit': MAX_LABEL_LENGTH,
      'disabled': fieldProps.disabled,
      // Nothing can be written until the protocol's languages are known.
      'readOnly': fieldProps.readOnly || locale === undefined,
      'aria-required': fieldProps['aria-required'],
      'aria-invalid': fieldProps['aria-invalid'],
      'aria-labelledby': fieldProps['aria-labelledby'],
      'aria-describedby': fieldProps['aria-describedby'],
    },
  };
}
