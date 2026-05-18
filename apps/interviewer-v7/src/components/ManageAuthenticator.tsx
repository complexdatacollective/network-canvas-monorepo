import { KeyRound, ShieldOff } from 'lucide-react';

import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import TimeAgo from '@codaco/fresco-ui/TimeAgo';
import { useToast } from '@codaco/fresco-ui/Toast';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { useAuth } from '~/lib/auth/AuthContext';

function truncateCredentialId(credentialIdB64: string): string {
  if (credentialIdB64.length <= 12) return credentialIdB64;
  return `${credentialIdB64.slice(0, 8)}…${credentialIdB64.slice(-4)}`;
}

export function ManageAuthenticator() {
  const auth = useAuth();
  const { confirm } = useDialog();
  const toast = useToast();

  const credentialIdB64 = auth.credentialMetadata?.credentialIdB64;
  const enrolledAt = auth.credentialMetadata?.enrolledAt;

  const handleReEnrol = async () => {
    await confirm({
      title: 'Re-enrol authenticator?',
      description:
        'You will be prompted to authenticate with your current authenticator, then to create a new one. The previous credential remains usable if either step fails.',
      confirmLabel: 'Re-enrol',
      intent: 'default',
      onConfirm: async (signal) => {
        const result = await auth.reEnrol(signal);
        if (!result.ok) {
          toast.add({
            title: 'Re-enrolment failed',
            description:
              result.message ?? 'The previous authenticator remains in use.',
            variant: 'destructive',
          });
          throw new Error(result.message ?? 'Re-enrolment failed');
        }
        toast.add({
          title: 'Authenticator re-enrolled',
          variant: 'success',
        });
      },
    });
  };

  const handleRevoke = async () => {
    await confirm({
      title: 'Revoke authenticator?',
      description: 'This will destroy all data on this device. Continue?',
      confirmLabel: 'Destroy device data',
      intent: 'destructive',
      onConfirm: async () => {
        await auth.revoke();
      },
    });
  };

  return (
    <section className="flex flex-col gap-4">
      <Heading level="h3">Manage authenticator</Heading>
      {credentialIdB64 ? (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 font-mono text-xs">
          <dt className="text-muted-foreground">Credential</dt>
          <dd>{truncateCredentialId(credentialIdB64)}</dd>
          <dt className="text-muted-foreground">Enrolled</dt>
          <dd>
            {enrolledAt ? <TimeAgo date={enrolledAt} /> : <span>unknown</span>}
          </dd>
        </dl>
      ) : (
        <Paragraph emphasis="muted">
          No authenticator metadata available.
        </Paragraph>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => void handleReEnrol()}
          icon={<KeyRound className="size-4" />}
        >
          Re-enrol authenticator
        </Button>
        <Button
          color="destructive"
          onClick={() => void handleRevoke()}
          icon={<ShieldOff className="size-4" />}
        >
          Revoke
        </Button>
      </div>
    </section>
  );
}
