import { useEffect, useState, type ReactNode } from 'react';

import Button from '@codaco/fresco-ui/Button';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
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

  return (
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
        'bg-input text-input-contrast flex w-full flex-col gap-4 rounded border-2 border-transparent p-4',
        ariaInvalid && 'border-destructive',
        disabled && 'opacity-50',
        readOnly && 'opacity-70',
        className,
      )}
      data-name={name}
    >
      {value && (
        <div className="relative overflow-hidden">{children?.(value)}</div>
      )}
      <Button
        type="button"
        onClick={() => setBrowserOpen(true)}
        color="primary"
        disabled={disabled || readOnly}
        className="self-start"
      >
        {!value ? 'Select resource' : 'Update resource'}
      </Button>
      <AssetBrowserWindow
        show={browserOpen}
        type={type}
        selected={selected ?? value}
        onSelect={handleSelectAsset}
        onCancel={closeBrowser}
      />
    </fieldset>
  );
};

export default ResourcePicker;
