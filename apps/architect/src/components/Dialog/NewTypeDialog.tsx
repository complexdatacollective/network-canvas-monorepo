import { useState } from 'react';

import EntityTypeDialog from '../Codebook/EntityTypeDialog';

type NewTypeDialogProps = {
  show?: boolean;
  entityType: 'node' | 'edge';
  onComplete?: (newTypeId?: string) => void;
  onCancel?: () => void;
};

const NewTypeDialog = ({
  show = false,
  entityType,
  onComplete = () => {},
  onCancel: _onCancel = () => {},
}: NewTypeDialogProps) => {
  const [showEditor, setShowEditor] = useState(false);

  // Open the editor when `show` becomes true. The editor closes itself
  // (`handleCloseEditor`) rather than being closed by the prop, so this owns
  // its own open state and only adopts the prop on the rising edge — compared
  // during render, because `show` is a prop we already have.
  // Seeded to match `showEditor` above rather than to `show`, so a component
  // mounted with `show` already true still opens.
  const [previousShow, setPreviousShow] = useState(false);
  if (show !== previousShow) {
    setPreviousShow(show);
    if (show) {
      setShowEditor(true);
    }
  }

  const handleCloseEditor = (newTypeId?: string) => {
    setShowEditor(false);
    onComplete(newTypeId);
  };

  return (
    <EntityTypeDialog
      show={showEditor}
      entity={entityType}
      onClose={handleCloseEditor}
    />
  );
};

export default NewTypeDialog;
