import { Database, Globe, KeyRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { Badge } from '@codaco/fresco-ui/Badge';
import InterfacePicture from '@codaco/interface-images/InterfacePicture';
import manifest, {
  type InterfaceType,
} from '@codaco/interface-images/manifest';
import type { InterfaceCompatibility } from '~/lib/interfaceCompatibility';

const isInterfaceType = (type: string): type is InterfaceType =>
  Object.hasOwn(manifest, type);

export const InterfaceSummary = ({
  type,
  children,
}: {
  /** Manifest key for the interface; renders its generated screenshot as the
   * hero image (square on narrow screens, 16:9 otherwise). */
  type: string;
  children: ReactNode;
}) => {
  const t = useTranslations('InterfaceSummary');
  const tName = useTranslations('InterfaceNames');
  if (!isInterfaceType(type)) {
    throw new Error(
      `<InterfaceSummary> received unknown interface type "${type}"`,
    );
  }
  const name = tName.has(type) ? tName(type) : type;
  return (
    <div className="phone-landscape:flex-row phone-landscape:items-center mb-4 flex flex-col gap-6">
      <div className="my-6 min-w-0 flex-1">
        <InterfacePicture
          type={type}
          ratio="16:9"
          artDirection={[{ media: '(max-width: 40rem)', ratio: '1:1' }]}
          sizes="(min-width: 40rem) 32rem, 100vw"
          alt={t('screenshotAlt', { name })}
          className="w-full rounded"
        />
      </div>
      {children}
    </div>
  );
};

const SpecField = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <div>
    <dt className="text-xs font-semibold tracking-wide text-current/70 uppercase">
      {label}
    </dt>
    <dd className="mt-1 text-base">{children}</dd>
  </div>
);

// Requirements are written in the page's own language, so each kind lists its
// keywords in every documentation language.
const REQUIREMENT_KEYWORDS = [
  { icon: Globe, keywords: ['internet', 'connection', 'conexión'] },
  {
    icon: KeyRound,
    keywords: ['account', 'api key', 'token', 'cuenta', 'clave de api'],
  },
  { icon: Database, keywords: ['roster', 'data', 'lista', 'datos'] },
] as const;

const iconForRequirement = (requirement: string) => {
  const normalized = requirement.toLowerCase();
  const match = REQUIREMENT_KEYWORDS.find(({ keywords }) =>
    keywords.some((keyword) => normalized.includes(keyword)),
  );
  return match ? <match.icon className="h-4 w-4" aria-hidden /> : null;
};

const RequiresPill = ({ requirement }: { requirement: string }) => (
  <Badge
    size="lg"
    icon={iconForRequirement(requirement)}
    className="gap-1.5 rounded-lg py-1"
  >
    {requirement}
  </Badge>
);

export const InterfaceMeta = ({
  type,
  creates,
  usesprompts,
  requires,
  compatibility,
}: {
  type: string;
  creates: string;
  usesprompts: string;
  /** Comma-separated external prerequisites (e.g. "Internet, Mapbox account").
   * Each entry renders as a pill with a matching icon. */
  requires?: string;
  compatibility?: InterfaceCompatibility | null;
}) => {
  const t = useTranslations('InterfaceSummary');
  const usesPromptsLabel = usesprompts === 'true' ? t('yes') : t('no');
  const supportedApps = compatibility?.apps.filter((app) => app.supported);
  const requirements = requires
    ?.split(',')
    .map((requirement) => requirement.trim())
    .filter(Boolean);

  return (
    <dl className="phone-landscape:w-64 phone-landscape:pl-6 flex shrink-0 flex-col gap-5">
      <SpecField label={t('type')}>{type}</SpecField>
      <SpecField label={t('creates')}>{creates}</SpecField>
      <div className="grid grid-cols-2 gap-5">
        <SpecField label={t('usesPrompts')}>{usesPromptsLabel}</SpecField>
        {compatibility && (
          <SpecField label={t('schema')}>
            <Badge size="lg" className="rounded-lg py-1">
              v{compatibility.introducedIn}+
            </Badge>
          </SpecField>
        )}
      </div>
      {supportedApps && supportedApps.length > 0 && (
        <SpecField label={t('availableIn')}>
          <span className="flex flex-wrap gap-1.5">
            {supportedApps.map((app) => (
              <Badge
                key={app.id}
                size="lg"
                title={
                  app.role === 'configure'
                    ? t('configureIn', { app: app.label })
                    : t('runIn', { app: app.label })
                }
                className="rounded-lg py-1"
              >
                {app.label}
              </Badge>
            ))}
          </span>
        </SpecField>
      )}
      {requirements && requirements.length > 0 && (
        <SpecField label={t('requires')}>
          <span className="flex flex-wrap gap-1.5">
            {requirements.map((requirement) => (
              <RequiresPill key={requirement} requirement={requirement} />
            ))}
          </span>
        </SpecField>
      )}
    </dl>
  );
};
