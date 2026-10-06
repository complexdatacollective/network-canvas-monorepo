import { skipToken, useQuery } from '@tanstack/react-query';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert } from '@codaco/fresco-ui/Alert';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';

import { rpcKey, rpcQuery } from '../runtime/rpc.ts';

const messages = defineMessages({
  codeOnly: {
    id: 'studio.updateNotice.codeOnly',
    defaultMessage:
      'Studio {version} is available, released {releasedAt}. This release does not change the database.',
    description:
      'Shown above every screen to the person who owns this Studio when a newer release is out and it needs no database change: going back means running the previous version again.',
  },
  schemaChange: {
    id: 'studio.updateNotice.schemaChange',
    defaultMessage:
      'Studio {version} is available, released {releasedAt}. This release changes the database: rolling back means restoring the backup taken during the upgrade.',
    description:
      'Shown above every screen to the person who owns this Studio when a newer release is out and it changes the database, which is what makes going back a restore rather than a redeploy.',
  },
  releaseNotes: {
    id: 'studio.updateNotice.releaseNotes',
    defaultMessage: 'Release notes',
    description:
      'The link, beside the update notice, to what the newer release changes.',
  },
  upgradeGuide: {
    id: 'studio.updateNotice.upgradeGuide',
    defaultMessage: 'Upgrade guide',
    description:
      'The link, beside the update notice, to the steps for upgrading a self-hosted Studio.',
  },
});

/**
 * Where the self-host upgrade guide is published. A constant, not a value the
 * server supplies: the guide is a page in this repository, and it is the same
 * page for every self-hosted instance whichever release it is on.
 */
const UPGRADE_GUIDE_URL =
  'https://github.com/complexdatacollective/network-canvas-monorepo/blob/main/apps/studio/docs/self-host/upgrade.md';

/**
 * Tells the owner of this Studio that a newer release is out (#1901).
 *
 * **It renders nothing at all unless the server says there is something to
 * say.** `status.updateAvailable` answers `null` for everyone but the owner
 * and for an instance already on the newest release, and "nothing yet" is also
 * how a read that is pending or has failed looks from here: the notice is an
 * aside to whatever the researcher came to do, so it must never surface an
 * error of its own or hold a place open while it waits. Whether the caller is
 * the owner is the server's to decide, not something this component infers.
 *
 * It is persistent by design (one `Alert` in the shell's header slot, no
 * dismissal, no screen of its own): it goes away when the instance is
 * upgraded, which is the thing it asks for.
 *
 * "Which upgrade form applies" is the release's kind. Every upgrade is the
 * same sequence and takes a backup; what differs is how it is undone, so the
 * copy says that, and nothing about whether to take a backup.
 */
export default function UpdateNotice({
  className = 'm-0 rounded-none',
}: {
  className?: string;
}) {
  const intl = useAppIntl();
  const update = useQuery(rpcQuery('status.updateAvailable', undefined));
  const available = update.data ?? null;
  // The mode is asked only once there is a notice to show, so a shell with no
  // update to announce makes no second request. It is the same immutable
  // answer the route guards read, and is usually already cached.
  const status = useQuery(
    available === null
      ? { queryKey: rpcKey('status'), queryFn: skipToken }
      : rpcQuery('status', undefined, { staleTime: Infinity }),
  );

  if (available === null) return null;

  const copy = available.schemaChange
    ? messages.schemaChange
    : messages.codeOnly;
  return (
    <Alert variant="info" density="compact" className={className}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          {intl.formatMessage(copy, {
            version: available.version,
            releasedAt: intl.formatDate(available.releasedAt, {
              dateStyle: 'medium',
            }),
          })}
        </span>
        <NativeLink
          href={available.notesUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {intl.formatMessage(messages.releaseNotes)}
        </NativeLink>
        {status.data?.deployment.mode === 'self-hosted' && (
          <NativeLink
            href={UPGRADE_GUIDE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            {intl.formatMessage(messages.upgradeGuide)}
          </NativeLink>
        )}
      </div>
    </Alert>
  );
}
