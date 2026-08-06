import { useState } from 'react';

import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import NetworkThumbnail from '~/components/Thumbnail/Network';

import ResourcePicker from './File';

type DataSourceProps = CreateFormFieldProps<
  string,
  'div',
  {
    /** Offers "the in-progress interview network" alongside a network asset. */
    canUseExisting?: boolean;
    /** Only reaches the control through `UnconnectedField`; `Field` strips
     * validation props and signals the same thing via `aria-required`. */
    required?: boolean;
  }
>;

const EXISTING_NETWORK = 'existing';

/**
 * Chooses the network a stage reads from: either the in-progress interview
 * network or an uploaded network asset. One field, one value — the radio group
 * and the resource picker are two views of it, so the field's label and hint
 * come from the call site through `ArchitectField`.
 */
const DataSource = ({
  id,
  name,
  value,
  onChange,
  onBlur,
  onFocus,
  canUseExisting = false,
  disabled = false,
  readOnly = false,
  required = false,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': ariaLabelledBy,
  'aria-required': ariaRequired,
}: DataSourceProps) => {
  const [selectNetworkAsset, setSelectNetworkAsset] = useState(false);

  const isRequired = required || Boolean(ariaRequired);
  const isInterviewNetwork = value === EXISTING_NETWORK;
  const showNetworkAssetInput = selectNetworkAsset || !isInterviewNetwork;

  const handleDataSourceChange = (nextValue: string | number | undefined) => {
    if (disabled || readOnly) return;

    if (nextValue === EXISTING_NETWORK) {
      if (!isInterviewNetwork) {
        onChange?.(EXISTING_NETWORK);
      }
      return;
    }

    if (nextValue === 'asset') {
      setSelectNetworkAsset(true);
    }
  };

  const picker = (
    <ResourcePicker
      type="network"
      value={value}
      selected={value}
      onChange={onChange}
      disabled={disabled}
      readOnly={readOnly}
      showBrowser={canUseExisting ? selectNetworkAsset : undefined}
      onCloseBrowser={
        canUseExisting ? () => setSelectNetworkAsset(false) : undefined
      }
      // Only the sole control in a field owns the field's id and labelling; in
      // the two-control layout the radio group takes them.
      id={canUseExisting ? undefined : id}
      name={name}
      onBlur={canUseExisting ? undefined : onBlur}
      onFocus={canUseExisting ? undefined : onFocus}
      aria-labelledby={canUseExisting ? undefined : ariaLabelledBy}
      aria-describedby={canUseExisting ? undefined : ariaDescribedBy}
      aria-invalid={canUseExisting ? undefined : ariaInvalid}
    >
      {(assetId: string) => <NetworkThumbnail id={assetId} />}
    </ResourcePicker>
  );

  if (!canUseExisting) {
    return picker;
  }

  return (
    <div>
      <RadioGroupField
        id={id}
        name={`${name ?? 'dataSource'}-type`}
        value={
          value ? (isInterviewNetwork ? EXISTING_NETWORK : 'asset') : undefined
        }
        onChange={handleDataSourceChange}
        onBlur={onBlur}
        onFocus={onFocus}
        disabled={disabled}
        readOnly={readOnly}
        required={isRequired}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-required={isRequired || undefined}
        options={[
          {
            value: EXISTING_NETWORK,
            label: 'Use the network from the in-progress interview',
          },
          { value: 'asset', label: 'Use a network data file' },
        ]}
      />
      {showNetworkAssetInput && <div>{picker}</div>}
    </div>
  );
};

export default DataSource;
