import { DeleteIcon } from 'lucide-react';

import Button from '~/lib/legacy-ui/components/Button';

type ControlsColumnProps = {
  id: string;
  inUse: boolean;
  onDelete: (id: string) => void;
};

const ControlsColumn = ({ id, inUse, onDelete }: ControlsColumnProps) => {
  const title = inUse ? 'In use — cannot be deleted' : 'Delete variable';

  return (
    <Button
      color="neon-coral"
      icon={<DeleteIcon />}
      onClick={() => {
        if (!inUse) {
          onDelete(id);
        }
      }}
      disabled={inUse}
      title={title}
      aria-label={title}
    />
  );
};

export default ControlsColumn;
