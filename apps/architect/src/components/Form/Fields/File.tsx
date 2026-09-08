import { Plus } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import {
  controlVariants,
  groupSpacingVariants,
  inputControlVariants,
  stateVariants,
} from '@codaco/fresco-ui/styles/controlVariants';
import { compose } from '@codaco/fresco-ui/utils/cva';
import { cx } from '~/utils/cva';

import AssetBrowserWindow from '../../AssetBrowser/AssetBrowserWindow';
const defaultMessages = defineMessages({
  selectButtonLabel: {
    id: 'architect.defaults.components.Form.Fields.File.selectButtonLabel',
    defaultMessage: 'Select resource',
    description:
      'Default researcher-facing copy when the caller does not supply its own selectButtonLabel.',
  },
  updateButtonLabel: {
    id: 'architect.defaults.components.Form.Fields.File.updateButtonLabel',
    defaultMessage: 'Update resource',
    description:
      'Default researcher-facing copy when the caller does not supply its own updateButtonLabel.',
  },
});
const messages = defineMessages({
  noResourceSelected: {
    id: 'architect.form.fields.file.noResourceSelected',
    defaultMessage: 'No resource selected.',
    description: 'Visible text in components / Form / Fields / File.',
  },
});

export type FileInputProps = CreateFormFieldProps<
  string,
  'fieldset',
  {
    /** Externally forces the resource browser open (see `DataSource`). */
    showBrowser?: boolean;
    onCloseBrowser?: () => void;
    /** Asset type the browser is filtered to. */
    type?: string;
    /** Asset highlighted in the browser; defaults to the field's value. */
    selected?: string;
    children?: (id: string) => ReactNode;
    /** Replaces the standard resource browser while retaining this field's presentation and state wiring. */
    renderBrowser?: (props: {
      open: boolean;
      close: () => void;
      select: (assetId: string) => void;
      selected: string;
    }) => ReactNode;
    /** Content that must remain mounted inside the fieldset, such as an aria-live status region. */
    supplementaryContent?: ReactNode;
    selectButtonLabel?: string;
    updateButtonLabel?: string;
  }
>;

/**
 * Picks a protocol asset from the resource browser. Labelling belongs to the
 * surrounding field — pass it through `ArchitectField`'s `label`/`hint`.
 */
const ResourcePicker = ({
  id,
  name,
  value = '',
  onChange,
  onBlur,
  onFocus,
  showBrowser,
  onCloseBrowser,
  type,
  selected,
  className,
  children,
  renderBrowser,
  supplementaryContent,
  selectButtonLabel: providedSelectButtonLabel,
  updateButtonLabel: providedUpdateButtonLabel,
  disabled = false,
  readOnly = false,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: FileInputProps) => {
  const intl = useAppIntl();
  const selectButtonLabel =
    providedSelectButtonLabel ??
    intl.formatMessage(defaultMessages.selectButtonLabel);
  const updateButtonLabel =
    providedUpdateButtonLabel ??
    intl.formatMessage(defaultMessages.updateButtonLabel);

  const [browserOpen, setBrowserOpen] = useState(Boolean(showBrowser));

  useEffect(() => {
    if (showBrowser !== undefined) setBrowserOpen(showBrowser);
  }, [showBrowser]);

  const closeBrowser = () => {
    setBrowserOpen(false);
    onCloseBrowser?.();
  };

  const handleSelectAsset = (assetId: string) => {
    setBrowserOpen(false);
    onChange?.(assetId);
    onCloseBrowser?.();
  };

  const variants = compose(
    controlVariants,
    inputControlVariants,
    groupSpacingVariants,
    stateVariants,
  );

  const getState = () => {
    if (disabled) return 'disabled';
    if (readOnly) return 'readOnly';
    if (ariaInvalid) return 'invalid';
    return 'normal';
  };

  return (
    <>
      <fieldset
        id={id}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy ?? (id ? `${id}-label` : undefined)}
        aria-describedby={ariaDescribedBy}
        aria-disabled={readOnly || undefined}
        disabled={disabled}
        onBlur={onBlur}
        onFocus={onFocus}
        className={cx(
          variants({
            state: getState(),
          }),
          'mb-4',
          className,
        )}
        data-name={name}
      >
        {value && (
          <div className="relative overflow-hidden">{children?.(value)}</div>
        )}
        {!value && (
          <div className="flex h-full w-full items-center justify-center">
            <div className="text-text/70 flex h-32 w-full items-center justify-center text-center font-semibold italic">
              {intl.formatMessage(messages.noResourceSelected)}
            </div>
          </div>
        )}

        {supplementaryContent}
        {renderBrowser ? (
          renderBrowser({
            open: browserOpen,
            close: closeBrowser,
            select: handleSelectAsset,
            selected: selected ?? value,
          })
        ) : (
          <AssetBrowserWindow
            show={browserOpen}
            type={type}
            selected={selected ?? value}
            onSelect={handleSelectAsset}
            onCancel={closeBrowser}
          />
        )}
      </fieldset>
      <Button
        type="button"
        onClick={() => setBrowserOpen(true)}
        color="primary"
        disabled={disabled || readOnly}
        className="self-start"
        icon={<Plus aria-hidden />}
      >
        {!value ? selectButtonLabel : updateButtonLabel}
      </Button>
    </>
  );
};

export default ResourcePicker;
