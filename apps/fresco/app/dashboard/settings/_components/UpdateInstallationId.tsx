'use client';

import { Loader2, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod/mini';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import { regenerateInstallationId } from '~/actions/appSettings';

import UpdateSettingsValue from '../../_components/UpdateSettingsValue';

const messages = defineMessages({
  regenerate: {
    id: 'fresco.settings.installationId.regenerate',
    defaultMessage: 'Regenerate installation ID',
    description:
      'Accessible label for the button that creates a new installation identifier.',
  },
  copyInstallationIDCannotBeEmpty: {
    id: 'fresco.settings.UpdateInstallationId.copyInstallationIDCannotBeEmpty',
    defaultMessage: 'Installation ID cannot be empty',
    description:
      'Researcher-facing settings / UpdateInstallationId: Installation ID cannot be empty',
  },
});

export default function UpdateInstallationId({
  label,
  installationId,
  readOnly,
}: {
  label: string;
  installationId?: string;
  readOnly?: boolean;
}) {
  const intl = useAppIntl();

  const [currentId, setCurrentId] = useState(installationId);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      const newId = await regenerateInstallationId();
      setCurrentId(newId);
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <UpdateSettingsValue
      label={label}
      settingsKey="installationId"
      initialValue={currentId}
      readOnly={readOnly}
      schema={z
        .string()
        .check(
          z.minLength(
            1,
            intl.formatMessage(messages.copyInstallationIDCannotBeEmpty),
          ),
        )}
      suffixComponent={
        <Button
          aria-label={intl.formatMessage(messages.regenerate)}
          disabled={readOnly ?? isRegenerating}
          onClick={handleRegenerate}
          variant="outline"
          size="sm"
        >
          {isRegenerating ? (
            <Loader2 className="animate-spin" />
          ) : (
            <RefreshCw />
          )}
        </Button>
      }
    />
  );
}
