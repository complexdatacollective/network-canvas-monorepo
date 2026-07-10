import Modal from '@codaco/fresco-ui/Modal';
import Spinner from '@codaco/fresco-ui/Spinner';

const ProtocolLoadingOverlay = ({ open }: { open: boolean }) => (
  <Modal open={open} onOpenChange={() => {}}>
    <div className="fixed inset-0 z-1000 flex items-center justify-center">
      <Spinner />
    </div>
  </Modal>
);

export default ProtocolLoadingOverlay;
