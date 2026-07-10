import { useCallback, useEffect, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import { Row, Section } from '~/components/EditorLayout';
import Text from '~/components/Form/Fields/Text';

type NewProtocolDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { name: string }) => void;
  title?: string;
  initialName?: string;
};

const NewProtocolDialog = ({
  open,
  onOpenChange,
  onSubmit,
  title = 'Create New Protocol',
  initialName = '',
}: NewProtocolDialogProps) => {
  const [name, setName] = useState(initialName);

  // The dialog stays mounted, so reseed the field from `initialName` each time
  // it opens (different templates prefill different default names).
  useEffect(() => {
    if (open) {
      setName(initialName);
    }
  }, [open, initialName]);

  const handleConfirm = useCallback(() => {
    if (!name.trim()) return;
    onSubmit({ name: name.trim() });
    setName('');
  }, [name, onSubmit]);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        setName('');
      }
      onOpenChange(newOpen);
    },
    [onOpenChange],
  );

  const isValid = name.trim().length > 0;

  return (
    <Dialog
      open={open}
      closeDialog={() => handleOpenChange(false)}
      title={title}
      size="readable"
      footer={
        <>
          <Button onClick={() => handleOpenChange(false)}>Cancel</Button>
          <Button onClick={handleConfirm} color="primary" disabled={!isValid}>
            Create Protocol
          </Button>
        </>
      }
    >
      <Section title="Protocol Name" layout="vertical">
        <Row>
          <Text
            placeholder="Enter a name for your protocol..."
            input={{
              value: name,
              onChange: (e) => setName(e.target.value),
            }}
            meta={{
              error: !name.trim() ? 'Protocol name is required' : undefined,
              invalid: !name.trim(),
              touched: name !== '',
            }}
          />
        </Row>
      </Section>
    </Dialog>
  );
};

export default NewProtocolDialog;
