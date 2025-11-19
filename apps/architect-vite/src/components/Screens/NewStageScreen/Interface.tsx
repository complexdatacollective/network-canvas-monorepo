import { find, get } from "es-toolkit/compat";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import Tag from "~/components/Tag";
import timelineImages from "~/images/timeline";
import { INTERFACE_TYPES, TAG_COLORS } from "./interfaceOptions";

const getTimelineImage = (type: string) => get(timelineImages, type);

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
	setHighlighted,
	removeHighlighted,
}: InterfaceThumbnailProps) => {
	const ref = useRef<HTMLDivElement>(null);
	const meta = useMemo(() => find(INTERFACE_TYPES, ["type", interfaceType]), [interfaceType]);
	const image = getTimelineImage(interfaceType);
	const { title, tags, description } = meta ?? { title: "", tags: [], description: "" };

	if (!meta) {
		throw Error(`${interfaceType} definition not found`);
	}

	const handleSelect = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();

			onClick(interfaceType);
		},
		[onClick, interfaceType],
	);

	useEffect(() => {
		if (highlighted && ref.current) {
			// Move element into view when it is selected
			ref.current.scrollIntoView({ block: "nearest" });
		}
	}, [highlighted]);

	return (
		<motion.div
			ref={ref}
			className={`flex-1 cursor-pointer py-4 border-b-2 border-divider ${highlighted ? "bg-action" : ""}`}
			onClick={handleSelect}
			onMouseEnter={setHighlighted}
			onMouseLeave={removeHighlighted}
		>
			<div className="flex items-center gap-10 mx-6">
				<img className="w-40 h-auto shrink-0 rounded-lg" src={image} alt={title} />
				<div className="flex flex-col">
					<h4 className={`mb-2 mt-0 ${highlighted ? "text-white" : ""}`}>{title}</h4>
					<div className={`mb-3 ${highlighted ? "text-white" : ""}`}>{description}</div>
					<div className="flex flex-wrap gap-2">
						{tags.map((tag: string) => (
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
