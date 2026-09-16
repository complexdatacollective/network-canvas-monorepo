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
 * Everything a single-line text control needs to BE the stage's name.
 *
 * Shaped for `fields/StageNameInput`, which is the control this package
 * publishes for the job, and satisfied by any control that takes the same
 * props.
 */
export type StageNameFieldProps = Readonly<{
  'id': string;
  'name': string;
  /**
   * The form this control belongs to, as the `form` attribute.
   *
   * Load-bearing rather than decorative: a host draws the stage's title
   * wherever its page has room, which is outside the `<form>` element, and a
   * control with no form owner has no implicit submission — Enter in the name
   * became a key that did nothing at all, with no newline and no save. The
   * attribute is what re-associates a control rendered outside its form, and
   * it is handed over here because the form id is the editor's to know.
   */
  'form': string;
  'value': string;
  'onChange': (value: string) => void;
  /**
   * Blur hook for a host that also proposes names (`useAutoStageName`).
   * `undefined` when nothing does, which is a host that never writes a name
   * nobody asked for. The form's own blur handling is on the container.
   */
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
  /**
   * The field's own DOM id, which everything drawn around the control is named
   * from. `fieldElementIds` derives the label's and the refusal region's ids
   * from it, and `fieldProps` already points the control at those.
   */
  id: string;
  /** What a control naming the field calls it, in the reader's language. */
  label: string;
  /**
   * What the editor refuses about the name, once it is worth saying, as an
   * encoded descriptor a host decodes with `formatMessageError`.
   *
   * One sentence rather than a list: the only rule this package puts on a
   * stage name is that there has to be one. A host that adds a rule of its own
   * brings its own words for it.
   */
  error: string | undefined;
  containerProps: StageNameContainerProps;
  fieldProps: StageNameFieldProps;
}>;

/**
 * Binds a control to the stage's name.
 *
 * One caller per CONTROL: a second one would be a second control bound to the
 * same name, which is two boxes showing one value. `fields/StageNameField` is
 * that caller for a host that wants the markup as well; a host drawing its own
 * control calls this instead. A host that wants only to READ or WRITE the name
 * — from a menu, a dialog, a breadcrumb — calls `useStageName`.
 *
 * Both hooks hold the registration, and holders are counted, so neither
 * mounting nor unmounting one disturbs the other.
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
  // A refusal the field is not showing yet is not one a host should print:
  // `shouldShowError` is what keeps "you have not answered this" from
  // appearing before the researcher has had a chance to.
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
      // Normalised for RENDERING, as every connected control must: the store
      // owns the value and hands back whatever is at the path, which is not a
      // string for the one render between a structural write and the effect
      // that repairs it.
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
