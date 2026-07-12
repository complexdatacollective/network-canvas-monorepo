import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import type { WrappedFieldProps } from 'redux-form';

import Button from '@codaco/fresco-ui/Button';
import { cx } from '~/utils/cva';

import AssetBrowserWindow from '../../AssetBrowser/AssetBrowserWindow';
import FrescoReduxField from '../FrescoReduxField';

type ResourcePickerControlProps = {
  'id'?: string;
  'name'?: string;
  'value'?: string;
  'onChange'?: (value: string) => void;
  'onBlur'?: React.FocusEventHandler;
  'onFocus'?: React.FocusEventHandler;
  'showBrowser'?: boolean;
  'onCloseBrowser'?: () => void;
  'type'?: string;
  'selected'?: string;
  'className'?: string;
  'children'?: (id: string) => ReactNode;
  'disabled'?: boolean;
  'readOnly'?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-labelledby'?: string;
};

const ResourcePickerControl = ({
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
  'aria-labelledby': ariaLabelledBy,
}: ResourcePickerControlProps) => {
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

export type FileInputPropsWithoutHOC = WrappedFieldProps & {
  showBrowser?: boolean;
  onCloseBrowser?: () => void;
  label?: string;
  type?: string;
  selected?: string;
  className?: string;
  children?: (id: string) => ReactNode;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
};

export type FileInputProps = FileInputPropsWithoutHOC;

const FrescoResourcePickerControl = ResourcePickerControl as ComponentType<
  Record<string, unknown>
>;
const ReduxFieldAdapter = FrescoReduxField as unknown as ComponentType<
  Record<string, unknown>
>;

const getDefaultLabel = (type?: string) => {
  switch (type) {
    case 'audio':
      return 'Audio resource';
    case 'geojson':
      return 'Geospatial data file';
    case 'image':
      return 'Image resource';
    case 'network':
      return 'Network data file';
    case 'video':
      return 'Video resource';
    default:
      return 'Resource';
  }
};

const FileInput = ({ label, type, ...props }: FileInputPropsWithoutHOC) => (
  <ReduxFieldAdapter
    {...props}
    type={type}
    label={label ?? getDefaultLabel(type)}
    fieldComponent={FrescoResourcePickerControl}
  />
);

export default FileInput;
