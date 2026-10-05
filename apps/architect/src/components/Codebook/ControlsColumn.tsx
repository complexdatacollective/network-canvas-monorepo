import { Trash2 } from 'lucide-react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { IconButton } from '@codaco/fresco-ui/Button';
const chromeMessages = defineMessages({
  inUseCannotBeDeleted: {
    id: 'architect.chrome.codebook.controlsColumn.inUseCannotBeDeleted',
    defaultMessage: 'In use — cannot be deleted',
    description:
      'Researcher-facing explanatory text in components / Codebook / ControlsColumn.',
  },
  deleteAttribute: {
    id: 'architect.chrome.codebook.controlsColumn.deleteAttribute',
    defaultMessage: 'Delete attribute',
    description:
      'Researcher-facing explanatory text in components / Codebook / ControlsColumn.',
  },
});

type ControlsColumnProps = {
  id: string;
  inUse: boolean;
  onDelete: (id: string) => void;
};

const ControlsColumn = ({ id, inUse, onDelete }: ControlsColumnProps) => {
  const intl = useAppIntl();
  const label = inUse
    ? intl.formatMessage(chromeMessages.inUseCannotBeDeleted)
    : intl.formatMessage(chromeMessages.deleteAttribute);

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
