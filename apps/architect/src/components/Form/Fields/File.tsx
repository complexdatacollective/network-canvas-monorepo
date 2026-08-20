import { useEffect, useState, type ReactNode } from 'react';

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
  disabled = false,
  readOnly = false,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: FileInputProps) => {
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
              No resource selected.
            </div>
          </div>
        )}

        <AssetBrowserWindow
          show={browserOpen}
          type={type}
          selected={selected ?? value}
          onSelect={handleSelectAsset}
          onCancel={closeBrowser}
        />
      </fieldset>
      <Button
        type="button"
        onClick={() => setBrowserOpen(true)}
        color="primary"
        disabled={disabled || readOnly}
        className="self-start"
      >
        {!value ? 'Select resource' : 'Update resource'}
      </Button>
    </>
  );
};

export default ResourcePicker;
