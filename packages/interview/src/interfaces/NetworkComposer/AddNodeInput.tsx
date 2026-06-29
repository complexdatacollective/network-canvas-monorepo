'use client';

import { useState } from 'react';

import InputField from '@codaco/fresco-ui/form/fields/InputField';

type AddNodeInputProps = {
  /** Protocol label for the entity being added, e.g. "Person". */
  entityLabel: string;
  /** Create a node with the given name. The input stays open for the next one. */
  onCreate: (name: string) => void;
};

/**
 * Inline name entry for adding nodes. Lives in a popover next to the Add button
 * (see the tool palette). Each Enter creates a node and clears the field so
 * several can be added in a row; Escape closes the popover (handled by the
 * popover itself, which returns the palette to select mode).
 */
export default function AddNodeInput({
  entityLabel,
  onCreate,
}: AddNodeInputProps) {
  const [value, setValue] = useState('');

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const name = value.trim();
    if (name === '') return;
    onCreate(name);
    setValue('');
  };

  return (
    <div className="flex w-72 flex-col">
      <InputField
        // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: the
        // popover exists to capture a name, so focus belongs here on open.
        autoFocus
        aria-label={`${entityLabel} name`}
        placeholder="Type a name, then press Enter"
        value={value}
        onChange={(next) => setValue(next ?? '')}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
