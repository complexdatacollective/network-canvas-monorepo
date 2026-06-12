import type { ReactNode } from 'react';

import Paragraph from '~/components/ui/typography/Paragraph';
import type { InterfaceCompatibility } from '~/lib/interfaceCompatibility';
import { cn } from '~/lib/utils';

export const InterfaceSummary = ({ children }: { children: ReactNode }) => {
  return (
    <div className="mb-4 flex flex-col sm:flex-row sm:items-center">
      {children}
    </div>
  );
};

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
  return (
    <div className="flex flex-col content-center justify-center space-y-6 sm:pl-6">
      <Paragraph>
        <strong className="uppercase">Type:</strong> <br /> {type}
      </Paragraph>
      <Paragraph>
        <strong className="uppercase">Creates:</strong> <br /> {creates}
      </Paragraph>
      <Paragraph>
        <strong className="uppercase">Uses Prompts:</strong> <br />
        {usesprompts}
      </Paragraph>
      {compatibility && (
        <>
          <Paragraph>
            <strong className="uppercase">Schema:</strong> <br />
            <span className="bg-primary text-primary-foreground mt-1 inline-block rounded-lg px-3 py-1.5 text-sm font-semibold">
              v{compatibility.introducedIn}+
            </span>
          </Paragraph>
          <Paragraph>
            <strong className="uppercase">Available In:</strong> <br />
            <span className="mt-1 flex flex-wrap gap-2">
              {compatibility.apps.map((app) => (
                <span
                  key={app.id}
                  title={
                    app.supported
                      ? `${app.role === 'configure' ? 'Configure' : 'Run'} in ${app.label}`
                      : `Not available — requires schema v${compatibility.introducedIn}`
                  }
                  className={cn(
                    'inline-block rounded-lg px-3 py-1.5 text-sm font-semibold',
                    app.supported
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground line-through opacity-70',
                  )}
                >
                  {app.label}
                </span>
              ))}
            </span>
          </Paragraph>
        </>
      )}
    </div>
  );
};
