import { find, get } from "es-toolkit/compat";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import Tag from "~/components/Tag";
import timelineImages from "~/images/timeline";
import { INTERFACE_TYPES, TAG_COLORS } from "./interfaceOptions";

const getTimelineImage = (type) => get(timelineImages, type);

type InterfaceThumbnailProps = {
	type: string;
	onClick: (type: string) => void;
	highlighted?: boolean;
	setHighlighted?: () => void;
	removeHighlighted?: () => void;
};

const InterfaceThumbnail = ({
	type: interfaceType,
	onClick,
	highlighted = false,
	setHighlighted = null,
	removeHighlighted = null,
}: InterfaceThumbnailProps) => {
	const ref = useRef(null);
	const meta = useMemo(() => find(INTERFACE_TYPES, ["type", interfaceType]), [interfaceType]);
	const image = getTimelineImage(interfaceType);
	const { title, tags, description } = meta;

	if (!meta) {
		throw Error(`${interfaceType} definition not found`);
	}

	const handleSelect = useCallback(
		(e) => {
			e.preventDefault();
			e.stopPropagation();

			onClick(interfaceType);
		},
		[onClick, interfaceType],
	);

	useEffect(() => {
		if (highlighted) {
			// Move element into view when it is selected
			ref.current.scrollIntoView({ block: "nearest" });
		}
	}, [highlighted]);

	return (
		<motion.div
			ref={ref}
			className={`flex-1 cursor-pointer px-16 py-4 border-b-2 border-divider ${highlighted ? "bg-action" : ""}`}
			onClick={handleSelect}
			onMouseEnter={setHighlighted}
			onMouseLeave={removeHighlighted}
		>
			<div className="mx-auto flex items-center">
				<div className="flex-none w-60 mr-6">
					<img className="w-full rounded-lg" src={image} alt={title} />
				</div>
				<div className="flex flex-col">
					<h2 className={`text-2xl font-bold mb-2 ${highlighted ? "text-white" : ""}`}>{title}</h2>
					<div className={`mb-3 ${highlighted ? "text-white" : ""}`}>{description}</div>
					<div className="flex flex-wrap gap-2">
						{tags.map((tag) => (
							<Tag key={tag} id={tag} color={get(TAG_COLORS, tag)} light>
								{tag}
							</Tag>
						))}
					</div>
				</div>
			</div>
		</motion.div>
	);
};

export default InterfaceThumbnail;
