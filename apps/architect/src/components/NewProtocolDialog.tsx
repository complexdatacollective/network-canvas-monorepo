import { useCallback, useEffect, useId, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
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
  const inputId = useId();
  const descriptionId = useId();

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
      footer={
        <>
          <Button color="default" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} color="primary" disabled={!isValid}>
            Create Protocol
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <label htmlFor={inputId} className="text-lg font-semibold">
          Protocol Name <span className="text-destructive">*</span>
        </label>
        <p id={descriptionId} className="text-muted m-0 max-w-prose text-sm">
          Use a short, recognizable name. Include a version number or date when
          it helps distinguish drafts, but avoid long project notes.
        </p>
        <Text
          placeholder="Enter a name for your protocol..."
          input={{
            id: inputId,
            value: name,
            onChange: (e) => setName(e.target.value),
            'aria-describedby': descriptionId,
            'aria-required': true,
          }}
          meta={{
            error: !name.trim() ? 'Protocol name is required' : undefined,
            invalid: !name.trim(),
            touched: name !== '',
          }}
        />
      </div>
    </Dialog>
  );
};

export default NewProtocolDialog;
