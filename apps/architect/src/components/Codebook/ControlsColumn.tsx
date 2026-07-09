import { DeleteIcon } from 'lucide-react';

import Button from '@codaco/fresco-ui/Button';

type ControlsColumnProps = {
  id: string;
  inUse: boolean;
  onDelete: (id: string) => void;
};

const ControlsColumn = ({ id, inUse, onDelete }: ControlsColumnProps) => {
  const label = inUse ? 'In use — cannot be deleted' : 'Delete variable';

  // The title lives on the wrapping span rather than the Button: a disabled
  // Button gets `pointer-events-none`, so a `title` on it would never show on
  // hover. `disabled` already blocks the click, so no extra guard is needed.
  return (
    <span title={label} className="inline-block">
      <Button
        color="destructive"
        icon={<DeleteIcon />}
        onClick={() => onDelete(id)}
        disabled={inUse}
        aria-label={label}
      />
    </span>
  );
};

export default ControlsColumn;
