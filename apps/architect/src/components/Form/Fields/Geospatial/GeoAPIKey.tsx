import { useState } from 'react';

import APIKeyThumbnail from '~/components/Thumbnail/APIKey';

import ResourcePicker, { type FileInputProps } from '../File';
import APIKeyBrowser from './APIKeyBrowser';

type GeoAPIKeyProps = Omit<
  FileInputProps,
  | 'children'
  | 'renderBrowser'
  | 'selectButtonLabel'
  | 'selected'
  | 'supplementaryContent'
  | 'type'
  | 'updateButtonLabel'
>;

/**
 * Picks a stored Mapbox API key. Labelling belongs to the surrounding field —
 * pass it through `ArchitectField`'s `label`/`hint`.
 */
const GeoAPIKey = ({ name, ...props }: GeoAPIKeyProps) => {
  const [statusMessage, setStatusMessage] = useState('');

  return (
    <ResourcePicker
      {...props}
      name={name}
      type="apikey"
      selectButtonLabel="Select API key"
      updateButtonLabel="Update API key"
      supplementaryContent={
        // Mounted with the field, not with the message, so its first update is
        // announced after the browser closes rather than arriving together
        // with a newly-created live region inside the dialog.
        <div
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
          data-testid="api-key-status"
        >
          {statusMessage}
        </div>
      }
      renderBrowser={({ open, close, select, selected }) => (
        <APIKeyBrowser
          show={open}
          close={close}
          onSelect={(selection) => {
            select(selection.id);
            setStatusMessage(
              selection.created
                ? `API key ${selection.name} created and selected.`
                : `API key ${selection.name} selected.`,
            );
          }}
          selected={selected}
        />
      )}
    >
      {(id) => <APIKeyThumbnail id={id} />}
    </ResourcePicker>
  );
};

export default GeoAPIKey;
