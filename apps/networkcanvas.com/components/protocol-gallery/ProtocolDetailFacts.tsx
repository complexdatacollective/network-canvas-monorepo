import { ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { Badge } from '@codaco/fresco-ui/Badge';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { Eyebrow } from '~/components/protocol-gallery/Eyebrow';
import { OverlineHeading } from '~/components/protocol-gallery/OverlineHeading';
import { NativeLink } from '~/components/ui/NativeLink';
import type { GalleryProtocol } from '~/lib/protocolGallery';

function DetailItem({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="border-outline min-w-0 border-b pb-4">
      <Eyebrow as="dt">{label}</Eyebrow>
      <dd className="mt-1.5">{children}</dd>
    </div>
  );
}

function ValueList({ values }: { values: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <Badge key={value} variant="outline">
          {value}
        </Badge>
      ))}
    </div>
  );
}

function ExternalAnchor({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <NativeLink
        href={href}
        target="_blank"
        rel="noreferrer"
        className="min-w-0 break-all"
      >
        {children}
      </NativeLink>
      <ExternalLink aria-hidden className="size-4 shrink-0" />
    </span>
  );
}

const contactEmailPattern = /[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/g;

function ProtocolContact({ contact }: { contact: string }) {
  const matches = [...contact.matchAll(contactEmailPattern)];
  if (matches.length === 0) return contact;

  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const match of matches) {
    const email = match[0];
    const index = match.index;
    if (index > cursor) parts.push(contact.slice(cursor, index));
    parts.push(
      <NativeLink key={`${index}-${email}`} href={`mailto:${email}`}>
        {email}
      </NativeLink>,
    );
    cursor = index + email.length;
  }

  if (cursor < contact.length) parts.push(contact.slice(cursor));
  return parts;
}

export function ProtocolDetailFacts({
  protocol,
  locale,
}: {
  protocol: GalleryProtocol;
  locale: string;
}) {
  const t = useTranslations('ProtocolGallery.detail');
  const dateAdded = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${protocol.dateAdded}T00:00:00Z`));
  const clinicalTrialsIsUrl =
    protocol.clinicalTrialsRegistration.startsWith('https://');

  return (
    <Surface noContainer spacing="lg" shadow="md">
      <OverlineHeading>{t('details')}</OverlineHeading>
      <dl className="tablet-portrait:grid-cols-2 mt-6 grid gap-x-8 gap-y-4">
        <DetailItem label={t('fields')}>
          <ValueList values={protocol.fields} />
        </DetailItem>
        <DetailItem label={t('population')}>{protocol.population}</DetailItem>
        <DetailItem label={t('methods')}>
          <ValueList values={protocol.edgeGeneration} />
        </DetailItem>
        <DetailItem label={t('usesRosters')}>
          {protocol.usesRosters ? t('yes') : t('no')}
        </DetailItem>
        <DetailItem label={t('studyPi')}>{protocol.studyPi}</DetailItem>
        <DetailItem label={t('contact')}>
          <ProtocolContact contact={protocol.contact} />
        </DetailItem>
        <DetailItem label={t('grantNumber')}>{protocol.grantNumber}</DetailItem>
        <DetailItem label={t('clinicalTrials')}>
          {clinicalTrialsIsUrl ? (
            <ExternalAnchor href={protocol.clinicalTrialsRegistration}>
              {protocol.clinicalTrialsRegistration}
            </ExternalAnchor>
          ) : (
            protocol.clinicalTrialsRegistration
          )}
        </DetailItem>
        <DetailItem label={t('publication')}>
          <ExternalAnchor href={protocol.publicationUrl}>
            {protocol.publicationUrl}
          </ExternalAnchor>
        </DetailItem>
        <DetailItem label={t('dateAdded')}>{dateAdded}</DetailItem>
      </dl>
    </Surface>
  );
}
