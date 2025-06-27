import cx from "classnames";
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

	const classes = cx("new-stage-screen__interface", {
		"new-stage-screen__interface--highlighted": highlighted,
	});

	useEffect(() => {
		if (highlighted) {
			// Move element into view when it is selected
			ref.current.scrollIntoView({ block: "nearest" });
		}
	}, [highlighted]);

	return (
		<motion.div
			ref={ref}
			className={classes}
			onClick={handleSelect}
			onMouseEnter={setHighlighted}
			onMouseLeave={removeHighlighted}
		>
			<div className="new-stage-screen__interface-content">
				<div className="new-stage-screen__interface-image">
					<img className="new-stage-screen__interface-preview" src={image} alt={title} />
				</div>
				<div className="new-stage-screen__interface-info">
					<h2>{title}</h2>
					<div className="new-stage-screen__interface-description">{description}</div>
					<div className="new-stage-screen__interface-tags">
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
