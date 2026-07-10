import { TriangleAlert } from 'lucide-react';
import type React from 'react';
import { compose, withState } from 'react-recompose';

import Button from '@codaco/fresco-ui/Button';
import { cx } from '~/utils/cva';

import AssetBrowserWindow from '../../AssetBrowser/AssetBrowserWindow';
import MarkdownLabel from './MarkdownLabel';

type InputProps = {
  value: string;
  onChange: (value: string) => void;
};

type MetaProps = {
  error?: string;
  invalid?: boolean;
  touched?: boolean;
};

// Props injected by withState HOC
type InjectedStateProps = {
  showBrowser: boolean;
  setShowBrowser: (show: boolean) => void;
};

// Props that the user passes to the component
export type FileInputPropsWithoutHOC = {
  input: InputProps;
  meta: MetaProps;
  showBrowser?: boolean;
  onCloseBrowser?: () => void;
  label?: string;
  type?: string;
  selected?: string;
  className?: string;
  children?: (id: string) => React.ReactNode;
};

// Full props that the internal component receives (original + injected)
export type FileInputProps = FileInputPropsWithoutHOC & InjectedStateProps;

const withShowBrowser = withState<
  FileInputPropsWithoutHOC,
  boolean,
  'showBrowser',
  'setShowBrowser'
>('showBrowser', 'setShowBrowser', ({ showBrowser }) => !!showBrowser);

const FileInput = ({
  setShowBrowser,
  input: { value, onChange },
  meta: { error, invalid, touched },
  showBrowser,
  onCloseBrowser,
  label,
  type,
  selected,
  className,
  children,
}: FileInputProps) => {
  const closeBrowser = () => {
    setShowBrowser(false);
    onCloseBrowser?.();
  };

  const openBrowser = () => {
    setShowBrowser(true);
  };

  const handleBrowseLibrary = (e: React.MouseEvent) => {
    e.stopPropagation();
    openBrowser();
  };

  const handleBlurBrowser = () => {
    closeBrowser();
  };

  const handleSelectAsset = (assetId: string) => {
    closeBrowser();
    onChange(assetId);
  };

  return (
    <div className={cx('m-0 block [&>h4]:m-0', className)}>
      {label && <MarkdownLabel label={label} />}
      <div className="form-field relative">
        {invalid && touched && (
          <div className="text-destructive flex items-center px-1 py-2.5 [&_.icon]:mr-2.5 [&_.icon]:size-5">
            <TriangleAlert aria-hidden />
            {error}
          </div>
        )}
        <div
          className={cx('relative overflow-hidden', value ? 'block' : 'hidden')}
        >
          {children?.(value)}
        </div>
        <div className="mt-5">
          <Button onClick={handleBrowseLibrary} color="primary">
            {!value ? 'Select resource' : 'Update resource'}
          </Button>
        </div>
      </div>
      <AssetBrowserWindow
        show={showBrowser}
        type={type}
        selected={selected}
        onSelect={handleSelectAsset}
        onCancel={handleBlurBrowser}
      />
    </div>
  );
};

export default compose<FileInputProps, FileInputPropsWithoutHOC>(
  withShowBrowser,
)(FileInput);
