import { Icon } from "~/lib/legacy-ui/components";

type ProtocolCardProps = {
	name: string;
	description?: string | null;
	lastModified: string | null;
	schemaVersion: number;
};

const formatDate = (timeString: string | null) => timeString && new Date(timeString).toLocaleString(undefined);

const ProtocolCard = ({ name, description = null, lastModified, schemaVersion }: ProtocolCardProps) => (
	<div className="relative flex min-h-(--space-6xl) max-w-[12cm] flex-col-reverse overflow-hidden rounded bg-platinum text-navy-taupe [zoom:120%]">
		<div className="flex min-h-0 shrink-0 flex-row items-center justify-center bg-slate-blue-dark px-(--space-xl) py-(--space-md) text-white">
			<div className="flex h-full flex-[0_0_var(--space-xl)] [&_.icon]:flex-[0_1_auto] [&_.icon]:size-full!">
				<Icon name="protocol-card" />
			</div>
			<div className="flex flex-1 flex-col justify-center">
				<h6 className="m-(--space-xs) flex items-center justify-end text-xs uppercase tracking-widest">
					Last Modified:
					{formatDate(lastModified)}
				</h6>
				<h6 className="m-(--space-xs) flex items-center justify-end text-xs uppercase tracking-widest">
					Schema Version:
					{schemaVersion}
				</h6>
			</div>
		</div>
		<div className="flex min-h-0 flex-1 flex-col justify-center px-(--space-xl) pt-(--space-lg) pb-(--space-md)">
			<h2 className="m-0 flex-none hyphens-auto">{name}</h2>
			{description && (
				<div className="flex-1 overflow-y-auto pt-(--space-md) text-sm [-webkit-overflow-scrolling:touch] scroll-smooth">
					{description}
				</div>
			)}
		</div>
	</div>
);

export default ProtocolCard;
