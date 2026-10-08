import Dialog, { type DialogProps } from '@codaco/fresco-ui/dialogs/Dialog';

type OverlayProps = {
  children: React.ReactNode;
  onClose: () => void;
  show: boolean;
  title: string;
  footer?: React.ReactNode;
  className?: string;
  dismissible?: boolean;
  finalFocus?: DialogProps['finalFocus'];
};

const Overlay = (props: OverlayProps) => {
  const {
    children,
    onClose,
    show,
    title,
    footer,
    className,
    dismissible,
    finalFocus,
  } = props;

  return (
    <Dialog
      open={show}
      closeDialog={onClose}
      title={title}
      className={className}
      footer={footer}
      dismissible={dismissible}
      finalFocus={finalFocus}
    >
      {children}
    </Dialog>
  );
};

export default Overlay;
