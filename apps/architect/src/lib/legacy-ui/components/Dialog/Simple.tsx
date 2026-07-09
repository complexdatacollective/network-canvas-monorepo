import type { CSSProperties, ReactNode } from 'react';

import { cx } from '~/utils/cva';

import Modal from '../Modal';

type SimpleDialogProps = {
  children?: ReactNode;
  show?: boolean;
  options?: React.ReactElement[];
  title: string;
  message?: ReactNode;
  onBlur?: () => void;
  className?: string;
  style?: CSSProperties;
};

/**
 * A relatively unstyled dialog for use in other kinds of modals
 */
const SimpleDialog = ({
  children,
  show = false,
  options = [],
  title,
  onBlur = () => {},
  className,
  style = {},
}: SimpleDialogProps) => (
  <Modal open={show} onOpenChange={() => onBlur()}>
    <div
      className={cx(
        'border-l-primary bg-surface-1 text-text flex max-w-240 flex-col rounded-lg border-l-8',
        className,
      )}
      style={style}
    >
      <div className="flex max-h-[70vh] shrink grow basis-full flex-row px-10 pt-10">
        <div className="order-1 flex-auto overflow-y-auto px-10">
          <h2 className="mb-5 font-bold uppercase">{title}</h2>
          {children}
        </div>
      </div>
      <footer className="mx-14 my-10 flex flex-[1_0_auto] justify-end gap-5">
        {options}
      </footer>
    </div>
  </Modal>
);

export default SimpleDialog;
