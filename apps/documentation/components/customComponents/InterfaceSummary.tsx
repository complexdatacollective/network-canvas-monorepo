import { Check, Database, Globe, KeyRound, Minus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { cx } from '@codaco/fresco-ui/utils/cva';
import InterfacePicture from '@codaco/interface-images/InterfacePicture';
import manifest, {
  type InterfaceType,
} from '@codaco/interface-images/manifest';
import Link from '~/components/Link';
import type {
  AppCompatibility,
  AppRole,
  InterfaceCompatibility,
} from '~/lib/interfaceCompatibility';

const isInterfaceType = (type: string): type is InterfaceType =>
  Object.hasOwn(manifest, type);

// InterfaceMeta renders its facts and its availability as two grid items, so
// on a wide container the facts sit beside the screenshot and the
// availability spans the full width beneath both.
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
    <div className="@container my-8">
      <div className="grid gap-6 @2xl:grid-cols-[minmax(0,3fr)_minmax(12rem,2fr)] @2xl:gap-x-8">
        <InterfacePicture
          type={type}
          ratio="16:9"
          artDirection={[{ media: '(max-width: 40rem)', ratio: '1:1' }]}
          sizes="(min-width: 40rem) 40rem, 100vw"
          alt={t('screenshotAlt', { name })}
          className="w-full rounded"
        />
        {children}
      </div>
    </div>
  );
};

const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <dt className="text-sm font-semibold text-current/65">{label}</dt>
    <dd className="mt-0.5">{children}</dd>
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
  return match ? (
    <match.icon className="size-4 shrink-0 text-current/65" aria-hidden />
  ) : null;
};

// The success hue darkened toward `--text` so it meets contrast as an icon in
// both themes (matches the compatibility table).
const AVAILABLE_INK =
  'text-[color-mix(in_oklab,var(--success)_60%,var(--text))]';

const AppAvailability = ({ app }: { app: AppCompatibility }) => {
  const t = useTranslations('InterfaceSummary');
  if (app.supported) {
    return (
      <li className="inline-flex items-center gap-1.5 font-semibold">
        <Check
          className={cx(AVAILABLE_INK, 'size-4 shrink-0 stroke-3')}
          aria-hidden
        />
        {app.label}
      </li>
    );
  }
  return (
    <li className="inline-flex items-center gap-1.5 text-current/60">
      <Minus className="size-4 shrink-0" aria-hidden />
      <span aria-hidden>{app.label}</span>
      <span className="sr-only">{t('notAvailable', { app: app.label })}</span>
    </li>
  );
};

const schemaInformationLink = (locale: string) => (children: ReactNode) => (
  <Link href={`/${locale}/get-started/protocol-schema-information`}>
    {children}
  </Link>
);

const ROLES: { role: AppRole; label: 'configureIn' | 'runIn' }[] = [
  { role: 'configure', label: 'configureIn' },
  { role: 'run', label: 'runIn' },
];

const Availability = ({
  compatibility,
}: {
  compatibility: InterfaceCompatibility;
}) => {
  const t = useTranslations('InterfaceSummary');
  const locale = useLocale();
  return (
    <div className="border-outline bg-input rounded border px-5 py-4 @2xl:col-span-2">
      <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-3">
        {ROLES.map(({ role, label }) => (
          <div key={role} className="contents">
            <dt className="text-sm font-semibold text-current/65">
              {t(label)}
            </dt>
            <dd>
              <ul className="flex flex-wrap gap-x-5 gap-y-1">
                {compatibility.apps
                  .filter((app) => app.role === role)
                  .map((app) => (
                    <AppAvailability key={app.id} app={app} />
                  ))}
              </ul>
            </dd>
          </div>
        ))}
      </dl>
      <p className="border-outline mt-4 border-t pt-3 text-sm text-current/75">
        {t.rich('schemaRequirement', {
          version: compatibility.introducedIn,
          link: schemaInformationLink(locale),
        })}
      </p>
    </div>
  );
};

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
   * Each entry is listed with a matching icon. */
  requires?: string;
  compatibility?: InterfaceCompatibility | null;
}) => {
  const t = useTranslations('InterfaceSummary');
  const usesPromptsLabel = usesprompts === 'true' ? t('yes') : t('no');
  const requirements = requires
    ?.split(',')
    .map((requirement) => requirement.trim())
    .filter(Boolean);

  return (
    <>
      <dl className="grid content-start gap-x-8 gap-y-4 @md:grid-cols-2 @2xl:grid-cols-1">
        <Fact label={t('type')}>
          <span className="text-lg font-bold">{type}</span>
        </Fact>
        <Fact label={t('creates')}>{creates}</Fact>
        <Fact label={t('usesPrompts')}>{usesPromptsLabel}</Fact>
        {requirements && requirements.length > 0 && (
          <Fact label={t('requires')}>
            <ul className="flex flex-col gap-1">
              {requirements.map((requirement) => (
                <li
                  key={requirement}
                  className="inline-flex items-center gap-2"
                >
                  {iconForRequirement(requirement)}
                  {requirement}
                </li>
              ))}
            </ul>
          </Fact>
        )}
      </dl>
      {compatibility && <Availability compatibility={compatibility} />}
    </>
  );
};
