import type { ReactNode } from 'react';

import InterfacePicture from '@codaco/interface-images/InterfacePicture';
import manifest, {
  type InterfaceType,
} from '@codaco/interface-images/manifest';
import type { InterfaceCompatibility } from '~/lib/interfaceCompatibility';

const isInterfaceType = (type: string): type is InterfaceType =>
  Object.hasOwn(manifest, type);

// "NameGeneratorRoster" -> "Name Generator Roster" for alt text.
const humanizeType = (type: string) => type.replace(/([a-z])([A-Z])/g, '$1 $2');

export const InterfaceSummary = ({
  type,
  children,
}: {
  /** Manifest key for the interface; renders its generated screenshot as the
   * hero image (square on narrow screens, 16:9 otherwise). */
  type: string;
  children: ReactNode;
}) => {
  if (!isInterfaceType(type)) {
    throw new Error(
      `<InterfaceSummary> received unknown interface type "${type}"`,
    );
  }
  return (
    <div className="mb-4 flex flex-col gap-6 sm:flex-row sm:items-center">
      <div className="my-6 min-w-0 flex-1">
        <InterfacePicture
          type={type}
          ratio="16:9"
          artDirection={[{ media: '(max-width: 40rem)', ratio: '1:1' }]}
          sizes="(min-width: 40rem) 32rem, 100vw"
          alt={`${humanizeType(type)} interface`}
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
    <dt className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
      {label}
    </dt>
    <dd className="mt-1 text-base">{children}</dd>
  </div>
);

export const InterfaceMeta = ({
  type,
  creates,
  usesprompts,
  compatibility,
}: {
  type: string;
  creates: string;
  usesprompts: string;
  compatibility?: InterfaceCompatibility | null;
}) => {
  const usesPromptsLabel = usesprompts === 'true' ? 'Yes' : 'No';
  const supportedApps = compatibility?.apps.filter((app) => app.supported);

  return (
    <dl className="flex shrink-0 flex-col gap-5 sm:w-64 sm:pl-6">
      <SpecField label="Type">{type}</SpecField>
      <SpecField label="Creates">{creates}</SpecField>
      <div className="grid grid-cols-2 gap-5">
        <SpecField label="Uses Prompts">{usesPromptsLabel}</SpecField>
        {compatibility && (
          <SpecField label="Schema">
            <span className="bg-primary text-primary-foreground inline-block rounded-md px-3 py-1 text-sm font-semibold">
              v{compatibility.introducedIn}+
            </span>
          </SpecField>
        )}
      </div>
      {supportedApps && supportedApps.length > 0 && (
        <SpecField label="Available In">
          <span className="flex flex-wrap gap-1.5">
            {supportedApps.map((app) => (
              <span
                key={app.id}
                title={`${app.role === 'configure' ? 'Configure' : 'Run'} in ${app.label}`}
                className="bg-primary text-primary-foreground inline-block rounded-md px-3 py-1 text-sm font-semibold"
              >
                {app.label}
              </span>
            ))}
          </span>
        </SpecField>
      )}
    </dl>
  );
};
