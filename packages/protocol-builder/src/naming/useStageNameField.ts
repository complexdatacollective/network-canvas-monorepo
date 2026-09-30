import { useCallback } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import type { useField } from '@codaco/fresco-ui/form/hooks/useField';

import { useStageEditorForm } from '../form/stageEditorContext.ts';
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
    containerProps,
    fieldProps: {
      'id': id,
      'name': LABEL,
      'form': formId,
      // Normalised for RENDERING, as every connected control must: the value
      // is not a string for the one render between a structural write and the
      // effect that repairs it.
      'value': typeof fieldProps.value === 'string' ? fieldProps.value : '',
      onChange,
      placeholder,
      'characterLimit': MAX_LABEL_LENGTH,
      'disabled': fieldProps.disabled,
      'readOnly': fieldProps.readOnly,
      'aria-required': fieldProps['aria-required'],
      'aria-invalid': fieldProps['aria-invalid'],
      'aria-labelledby': fieldProps['aria-labelledby'],
      'aria-describedby': fieldProps['aria-describedby'],
    },
  };
}
