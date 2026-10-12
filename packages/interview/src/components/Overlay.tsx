import Dialog, { type DialogProps } from '@codaco/fresco-ui/dialogs/Dialog';

type OverlayProps = {
  children: React.ReactNode;
  onClose: () => void;
  show: boolean;
  title: string;
  footer?: React.ReactNode;
  className?: string;
  finalFocus?: DialogProps['finalFocus'];
  dismissible?: DialogProps['dismissible'];
};

const Overlay = (props: OverlayProps) => {
  const {
    children,
    onClose,
    show,
    title,
    footer,
    className,
    finalFocus,
    dismissible,
  } = props;

  return (
    <Dialog
      open={show}
      closeDialog={onClose}
      title={title}
      className={className}
      footer={footer}
      finalFocus={finalFocus}
      dismissible={dismissible}
    >
      {children}
    </Dialog>
  );
};

export default Overlay;
