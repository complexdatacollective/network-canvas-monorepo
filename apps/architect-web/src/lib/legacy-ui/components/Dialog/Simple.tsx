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
        'border-l-primary bg-surface-1 text-foreground flex max-w-240 flex-col rounded-lg border-l-8',
        className,
      )}
      style={style}
    >
      <div className="flex max-h-[70vh] shrink grow basis-full flex-row px-(--space-xl) pt-(--space-xl)">
        <div className="order-1 flex-auto overflow-y-auto px-(--space-xl)">
          <h2 className="mb-(--space-md) font-bold uppercase">{title}</h2>
          {children}
        </div>
      </div>
      <footer className="mx-(--space-2xl) my-(--space-xl) flex flex-[1_0_auto] justify-end gap-(--space-md)">
        {options}
      </footer>
    </div>
  </Modal>
);

export default SimpleDialog;
