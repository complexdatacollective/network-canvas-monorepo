import { Trash2 } from 'lucide-react';

import { IconButton } from '@codaco/fresco-ui/Button';

type ControlsColumnProps = {
  id: string;
  inUse: boolean;
  onDelete: (id: string) => void;
};

const ControlsColumn = ({ id, inUse, onDelete }: ControlsColumnProps) => {
  const label = inUse ? 'In use — cannot be deleted' : 'Delete variable';

  // The title lives on the wrapping span rather than the IconButton: a disabled
  // button gets `pointer-events-none`, so a `title` on it would never show on
  // hover. `disabled` already blocks the click, so no extra guard is needed.
  return (
    <span title={label} className="inline-block">
      <IconButton
        color="destructive"
        variant="text"
        icon={<Trash2 />}
        onClick={() => onDelete(id)}
        disabled={inUse}
        aria-label={label}
      />
    </span>
  );
};

export default ControlsColumn;
