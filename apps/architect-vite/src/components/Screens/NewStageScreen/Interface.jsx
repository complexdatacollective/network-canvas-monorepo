import cx from "classnames";
import { find, get } from "es-toolkit/compat";
import { motion } from "motion/react";
import PropTypes from "prop-types";
import { useCallback, useEffect, useMemo, useRef } from "react";
import Tag from "~/components/Tag";
import timelineImages from "~/images/timeline";
import { INTERFACE_TYPES, TAG_COLORS } from "./interfaceOptions";

const getTimelineImage = (type) => get(timelineImages, type);

const InterfaceThumbnail = ({ type: interfaceType, onClick, highlighted, setHighlighted, removeHighlighted }) => {
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

InterfaceThumbnail.propTypes = {
	type: PropTypes.string.isRequired,
	onClick: PropTypes.func.isRequired,
	highlighted: PropTypes.bool,
	setHighlighted: PropTypes.func,
	removeHighlighted: PropTypes.func,
};

InterfaceThumbnail.defaultProps = {
	highlighted: false,
	setHighlighted: null,
	removeHighlighted: null,
};

export default InterfaceThumbnail;
