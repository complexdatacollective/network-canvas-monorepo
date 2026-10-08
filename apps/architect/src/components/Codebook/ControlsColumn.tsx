import { Tag, Trash2 } from 'lucide-react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { IconButton } from '@codaco/fresco-ui/Button';
import { useProtocolReadOnly } from '~/hooks/useProtocolReadOnly';
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
  editAttributeLabel: {
    id: 'architect.chrome.codebook.controlsColumn.editAttributeLabel',
    defaultMessage: 'Edit attribute label: {name}',
    description:
      'Accessible name and tooltip of the button that opens the editor for the words participants are shown for an attribute, in each of the protocol’s languages. name is the attribute’s name.',
  },
});

type ControlsColumnProps = {
  id: string;
  name: string;
  inUse: boolean;
  onDelete: (id: string) => void;
  onEditLabel: (id: string) => void;
};

const ControlsColumn = ({
  id,
  name,
  inUse,
  onDelete,
  onEditLabel,
}: ControlsColumnProps) => {
  const intl = useAppIntl();
  const readOnly = useProtocolReadOnly();
  const label = inUse
    ? intl.formatMessage(chromeMessages.inUseCannotBeDeleted)
    : intl.formatMessage(chromeMessages.deleteAttribute);
  const editLabel = intl.formatMessage(chromeMessages.editAttributeLabel, {
    name,
  });

  return (
    <span className="inline-flex items-center">
      <IconButton
        variant="text"
        icon={<Tag />}
        onClick={() => onEditLabel(id)}
        disabled={readOnly}
        aria-haspopup="dialog"
        aria-label={editLabel}
        title={editLabel}
      />
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
