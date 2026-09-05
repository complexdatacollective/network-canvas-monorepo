import { useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import APIKeyThumbnail from '~/components/Thumbnail/APIKey';

import ResourcePicker, { type FileInputProps } from '../File';
import APIKeyBrowser from './APIKeyBrowser';
const extraMessages = defineMessages({
  select: {
    id: 'architect.geoApiKey.select',
    defaultMessage: 'Select API key',
    description: 'Researcher-facing Architect control or feedback.',
  },
  update: {
    id: 'architect.geoApiKey.update',
    defaultMessage: 'Update API key',
    description: 'Researcher-facing Architect control or feedback.',
  },
  selected: {
    id: 'architect.geoApiKey.selected',
    defaultMessage:
      'API key {name} {created, select, true {created and selected.} other {selected.}}',
    description: 'Researcher-facing Architect control or feedback.',
  },
});

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
  const intl = useAppIntl();
  const [selectionStatus, setSelectionStatus] = useState<{
    name: string;
    created: boolean;
  } | null>(null);

  return (
    <ResourcePicker
      {...props}
      name={name}
      type="apikey"
      selectButtonLabel={intl.formatMessage(extraMessages.select)}
      updateButtonLabel={intl.formatMessage(extraMessages.update)}
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
          {selectionStatus &&
            intl.formatMessage(extraMessages.selected, {
              name: selectionStatus.name,
              created: String(selectionStatus.created),
            })}
        </div>
      }
      renderBrowser={({ open, close, select, selected }) => (
        <APIKeyBrowser
          show={open}
          close={close}
          onSelect={(selection) => {
            select(selection.id);
            setSelectionStatus({
              name: selection.name,
              created: selection.created,
            });
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
