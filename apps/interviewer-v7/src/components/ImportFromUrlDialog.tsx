import { useEffect, useState } from 'react';

import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Spinner from '@codaco/fresco-ui/Spinner';
import { useToast } from '@codaco/fresco-ui/Toast';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { importProtocolFromUrl } from '~/lib/protocol/importProtocol';

type Props = {
  open: boolean;
  onClose: () => void;
  onImported?: () => void;
};

function isProbablyValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function ImportFromUrlDialog({ open, onClose, onImported }: Props) {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'working' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!open) {
      setUrl('');
      setStatus('idle');
      setError(null);
    }
  }, [open]);

  const onImport = async () => {
    if (!isProbablyValidUrl(url) || status === 'working') return;
    setStatus('working');
    setError(null);
    const result = await importProtocolFromUrl(url.trim());
    if (result.success) {
      toast.add({
        title: 'Protocol imported',
        description: result.migrated
          ? `${result.protocol.name} was migrated to the current schema.`
          : result.protocol.name,
        variant: 'success',
      });
      onImported?.();
      onClose();
      return;
    }
    setStatus('error');
    setError(result.message);
  };

  return (
    <Dialog
      open={open}
      closeDialog={status === 'working' ? undefined : onClose}
      title="Import protocol from URL"
      description="Paste the link to a .netcanvas file hosted on a server you trust."
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={status === 'working'}
          >
            {status === 'working' ? 'Working...' : 'Cancel'}
          </Button>
          <Button
            type="button"
            onClick={() => void onImport()}
            disabled={!isProbablyValidUrl(url) || status === 'working'}
          >
            Import
          </Button>
        </>
      }
    >
      <UnconnectedField
        name="url"
        label="Protocol URL"
        hint="Must start with https:// (or http:// for local servers)."
        component={InputField}
        value={url}
        onChange={(v) => setUrl(String(v ?? ''))}
        autoFocus
        disabled={status === 'working'}
      />
      {status === 'working' ? (
        <div className="flex items-center gap-2">
          <Spinner />
          <Paragraph emphasis="muted">Downloading and validating…</Paragraph>
        </div>
      ) : null}
      {status === 'error' && error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </Dialog>
  );
}
