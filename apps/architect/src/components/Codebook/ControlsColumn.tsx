import { Trash2 } from 'lucide-react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { IconButton } from '@codaco/fresco-ui/Button';
import { useProtocolReadOnly } from '~/hooks/useProtocolReadOnly';
const chromeMessages = defineMessages({
  inUseCannotBeDeleted: {
    id: 'architect.chrome.codebook.controlsColumn.inUseCannotBeDeleted',
    defaultMessage: 'In use — cannot be deleted',
    description:
      'Tooltip and accessible name of the disabled delete button in a row of the codebook variables table, shown when a stage uses the variable so it cannot be deleted.',
  },
  deleteAttribute: {
    id: 'architect.chrome.codebook.controlsColumn.deleteAttribute',
    defaultMessage: 'Delete attribute',
    description:
      'Tooltip and accessible name of the button in a row of the codebook variables table that deletes the variable (attribute). Delete is a verb.',
  },
});

type ControlsColumnProps = {
  id: string;
  inUse: boolean;
  onDelete: (id: string) => void;
};

const ControlsColumn = ({ id, inUse, onDelete }: ControlsColumnProps) => {
  const intl = useAppIntl();
  const readOnly = useProtocolReadOnly();
  const label = inUse
    ? intl.formatMessage(chromeMessages.inUseCannotBeDeleted)
    : intl.formatMessage(chromeMessages.deleteAttribute);

  return (
    <span className="inline-flex items-center">
      {/*
        The delete title lives on the wrapping span rather than the IconButton:
        a disabled button gets `pointer-events-none`, so a `title` on it would
        never show on hover. `disabled` already blocks the click, so no extra
        guard is needed.
      */}
      <span title={label} className="inline-block">
        <IconButton
          color="destructive"
          variant="text"
          icon={<Trash2 />}
          onClick={() => onDelete(id)}
          disabled={inUse || readOnly}
          aria-label={label}
        />
      </span>
    </span>
  );
};

export default ControlsColumn;
