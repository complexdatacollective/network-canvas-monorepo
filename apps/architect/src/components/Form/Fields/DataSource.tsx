import type { ComponentProps } from 'react';
import { compose, withState } from 'react-recompose';
import type { WrappedFieldProps } from 'redux-form';

import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import NetworkThumbnail from '~/components/Thumbnail/Network';

import type { FileInputPropsWithoutHOC } from './File';
import File from './File';

type BaseDataSourceProps = WrappedFieldProps & {
  canUseExisting?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
};

type DataSourcePropsWithState = BaseDataSourceProps & {
  setSelectNetworkAsset: (value: boolean) => void;
  selectNetworkAsset: boolean;
};

const withSelectNetworkAsset = withState<
  BaseDataSourceProps,
  boolean,
  'selectNetworkAsset',
  'setSelectNetworkAsset'
>('selectNetworkAsset', 'setSelectNetworkAsset', false);

const DataSource = (props: DataSourcePropsWithState) => {
  const {
    input,
    setSelectNetworkAsset,
    canUseExisting = false,
    selectNetworkAsset,
    meta,
    disabled = false,
    readOnly = false,
    required = false,
  } = props;

  const handleDataSourceChange = (value: string | number | undefined) => {
    if (disabled || readOnly) return;

    if (value === 'existing') {
      if (input.value !== 'existing') {
        input.onChange('existing');
      }
      return;
    }

    if (value === 'asset') {
      setSelectNetworkAsset(true);
    }
  };

  const handleCloseBrowser = () => {
    setSelectNetworkAsset(false);
  };

  const handleBlur = () => {
    input.onBlur?.(input.value);
  };

  const isInterviewNetwork = input.value === 'existing';
  const showNetworkAssetInput = selectNetworkAsset || !isInterviewNetwork;

  const fileProps: FileInputPropsWithoutHOC = {
    input,
    meta,
    type: 'network',
    selected: input.value,
    disabled,
    readOnly,
    required,
  };

  return canUseExisting ? (
    <div>
      <RadioGroupField
        name={`${input.name ?? 'dataSource'}-type`}
        aria-label="Data source"
        value={
          input.value ? (isInterviewNetwork ? 'existing' : 'asset') : undefined
        }
        onChange={handleDataSourceChange}
        onBlur={handleBlur}
        onFocus={input.onFocus}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        aria-required={required || undefined}
        options={[
          {
            value: 'existing',
            label: 'Use the network from the in-progress interview',
          },
          { value: 'asset', label: 'Use a network data file' },
        ]}
      />
      {showNetworkAssetInput && (
        <div>
          <File
            {...fileProps}
            showBrowser={selectNetworkAsset}
            onCloseBrowser={handleCloseBrowser}
          >
            {(id: string) => <NetworkThumbnail id={id} />}
          </File>
        </div>
      )}
    </div>
  ) : (
    <File {...fileProps}>{(id: string) => <NetworkThumbnail id={id} />}</File>
  );
};

export default compose<ComponentProps<typeof DataSource>, typeof DataSource>(
  withSelectNetworkAsset,
)(DataSource);
