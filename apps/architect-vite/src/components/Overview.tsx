import type { ComponentProps } from "react";
import { useEffect, useState } from "react";
import { compose } from "react-recompose";
import { connect } from "react-redux";
import { TextArea } from "~/components/Form/Fields";
import Card from "~/components/shared/Card";
import { updateProtocolDescription, updateProtocolName } from "~/ducks/modules/activeProtocol";
import type { RootState } from "~/ducks/modules/root";
import { getProtocol, getProtocolName } from "~/selectors/protocol";

type OverviewProps = {
	name?: string | null;
	description?: string;
	updateDescription?: (options: { description: string }) => void;
	updateName?: (options: { name: string }) => void;
};

const Overview = ({
	name = null,
	description = "",
	updateDescription = () => {},
	updateName = () => {},
}: OverviewProps) => {
	const [localName, setLocalName] = useState(name ?? "");

	useEffect(() => {
		setLocalName(name ?? "");
	}, [name]);

	return (
		<Card padding="lg">
			<input
				type="text"
				value={localName}
				onChange={(e) => setLocalName(e.target.value)}
				onBlur={() => {
					const trimmed = localName.trim();
					trimmed ? updateName({ name: trimmed }) : setLocalName(name ?? "");
				}}
				placeholder="Enter protocol name…"
				className="w-full border-0 bg-transparent font-heading text-4xl font-extrabold leading-tight tracking-tight outline-none"
				style={{ color: "hsl(240 35% 17%)" }}
			/>
			<TextArea
				placeholder="Enter a description for your protocol…"
				input={{
					value: description,
					onChange: ({ target: { value } }) => updateDescription({ description: value }),
				}}
			/>
		</Card>
	);
};

const mapDispatchToProps = {
	updateDescription: updateProtocolDescription,
	updateName: updateProtocolName,
};

const mapStateToProps = (state: RootState) => {
	const protocol = getProtocol(state);
	const name = getProtocolName(state);

	return {
		name,
		description: protocol?.description || "",
		codebook: protocol?.codebook,
	};
};

export default compose<ComponentProps<typeof Overview>, typeof Overview>(connect(mapStateToProps, mapDispatchToProps))(
	Overview,
);
