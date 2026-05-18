import { Icon } from '~/lib/legacy-ui/components';

type ProtocolCardProps = {
  name: string;
  description?: string | null;
  lastModified: string | null;
  schemaVersion: number;
};

const formatDate = (timeString: string | null) => {
  if (!timeString) return null;
  const date = new Date(timeString);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined);
};

const ProtocolCard = ({
  name,
  description = null,
  lastModified,
  schemaVersion,
}: ProtocolCardProps) => (
  <div className="bg-platinum text-navy-taupe relative flex min-h-(--space-6xl) max-w-[12cm] zoom-120 flex-col-reverse overflow-hidden rounded">
    <div className="bg-slate-blue-dark text-accent-foreground flex min-h-0 shrink-0 flex-row items-center justify-center px-(--space-xl) py-(--space-md)">
      <div className="flex h-full flex-[0_0_var(--space-xl)] [&_.icon]:size-full! [&_.icon]:flex-[0_1_auto]">
        <Icon name="protocol-card" />
      </div>
      <div className="flex flex-1 flex-col justify-center">
        <h6 className="m-(--space-xs) flex items-center justify-end text-xs tracking-widest uppercase">
          Last Modified:
          {formatDate(lastModified)}
        </h6>
        <h6 className="m-(--space-xs) flex items-center justify-end text-xs tracking-widest uppercase">
          Schema Version:
          {schemaVersion}
        </h6>
      </div>
    </div>
    <div className="flex min-h-0 flex-1 flex-col justify-center px-(--space-xl) pt-(--space-lg) pb-(--space-md)">
      <h2 className="m-0 flex-none hyphens-auto">{name}</h2>
      {description && (
        <div className="flex-1 overflow-y-auto scroll-smooth pt-(--space-md) text-sm [-webkit-overflow-scrolling:touch]">
          {description}
        </div>
      )}
    </div>
  </div>
);

export default ProtocolCard;
