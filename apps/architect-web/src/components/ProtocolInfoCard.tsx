import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { TextArea } from "~/components/Form/Fields";
import { useAppDispatch } from "~/ducks/hooks";
import { updateProtocolDescription, updateProtocolName } from "~/ducks/modules/activeProtocol";
import { getProtocol, getProtocolName } from "~/selectors/protocol";

const ProtocolInfoCard = () => {
	const dispatch = useAppDispatch();
	const name = useSelector(getProtocolName);
	const protocol = useSelector(getProtocol);
	const description = protocol?.description ?? "";

	const [localName, setLocalName] = useState(name ?? "");

	useEffect(() => {
		setLocalName(name ?? "");
	}, [name]);

	return (
		<div className="w-full max-w-4xl mx-auto bg-surface-1 flex flex-col rounded relative overflow-hidden shadow-md">
			<div className="py-(--space-md) px-(--space-lg)">
				<input
					type="text"
					className="h1 my-0 mb-(--space-sm) w-full bg-transparent border-none outline-none p-0 text-inherit focus:outline-none"
					value={localName}
					onChange={(e) => setLocalName(e.target.value)}
					onBlur={() => {
						const trimmed = localName.trim();
						if (trimmed) {
							dispatch(updateProtocolName({ name: trimmed }));
						} else {
							setLocalName(name ?? "");
						}
					}}
					placeholder="Enter protocol name..."
					aria-label="Protocol name"
				/>
				<TextArea
					placeholder="Enter a description for your protocol..."
					input={{
						value: description,
						onChange: (event) => dispatch(updateProtocolDescription({ description: event.target.value })),
					}}
				/>
			</div>
		</div>
	);
};

export default ProtocolInfoCard;
