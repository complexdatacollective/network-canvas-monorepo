import type { StageType } from "@codaco/protocol-validation";
import { get } from "es-toolkit/compat";
import { Text } from "~/components/Form/Fields";
import Badge from "~/components/shared/Badge";
import Card from "~/components/shared/Card";
import { getStageDisplayMeta } from "~/components/shared/stageMeta";
import { useFormContext } from "../Editor";
import ValidatedField from "../Form/ValidatedField";
import { getInterface } from "./Interfaces";

const StageHeading = () => {
	const { values } = useFormContext();

	const type = get(values, "type") as string;

	if (!type) {
		return null;
	}

	const meta = getStageDisplayMeta(type);
	const documentationLink = get(getInterface(type as StageType), "documentation", null);

	return (
		<Card padding="lg">
			<div className="mb-3 flex items-center gap-3">
				<Badge color={meta.color}>{type}</Badge>
				{documentationLink && (
					<a
						href={documentationLink}
						target="_blank"
						rel="noreferrer"
						className="text-xs underline"
						style={{ color: "hsl(220 4% 44%)" }}
					>
						Documentation
					</a>
				)}
			</div>
			<ValidatedField
				name="label"
				component={Text}
				placeholder="Enter your stage name here"
				maxLength={50}
				validation={{ required: true }}
				autoFocus
			/>
		</Card>
	);
};

export default StageHeading;
