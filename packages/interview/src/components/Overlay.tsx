import Dialog from '@codaco/fresco-ui/dialogs/Dialog';

type OverlayProps = {
  children: React.ReactNode;
  onClose: () => void;
  show: boolean;
  title: string;
  footer?: React.ReactNode;
  className?: string;
  dismissible?: boolean;
};

const Overlay = (props: OverlayProps) => {
  const { children, onClose, show, title, footer, className, dismissible } =
    props;

  return (
    <Dialog
      open={show}
      closeDialog={onClose}
      title={title}
      className={className}
      footer={footer}
      dismissible={dismissible}
    >
      {children}
    </Dialog>
  );
};

export default Overlay;
