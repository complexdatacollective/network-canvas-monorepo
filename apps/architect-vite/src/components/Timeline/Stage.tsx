import cx from "classnames";
import { DeleteIcon } from "lucide-react";
import { motion } from "motion/react";
import { useRef } from "react";
import { Button } from "~/lib/legacy-ui/components";
import getAbsoluteBoundingRect from "~/utils/getAbsoluteBoundingRect";
import EditStageButton from "./EditStageButton";

const findPos = (node: HTMLElement): number => {
	let curtop = 0;
	let curtopscroll = 0;
	let n: HTMLElement | null = node;
	do {
		curtop += n.offsetTop;
		curtopscroll += n.offsetParent ? (n.offsetParent as HTMLElement).scrollTop : 0;
		n = n.offsetParent as HTMLElement | null;
	} while (n?.offsetParent);
	return curtop - curtopscroll;
};

const variants = {
	show: {
		scale: 1,
		opacity: 1,
		transition: { type: "spring", delay: 0.75 },
	},
	hide: {
		scale: 0,
		opacity: 0,
	},
};

type StageProps = {
	id: string;
	stageNumber: number;
	className?: string;
	label?: string;
	type: string;
	hasSkipLogic?: boolean;
	hasFilter?: boolean;
	onEditStage: (id: string, rect: { top: number; left: number; width: number; height: number }) => void;
	onDeleteStage: (id: string) => void;
};

const Stage = ({
	id,
	stageNumber,
	className = "",
	onEditStage,
	onDeleteStage,
	type,
	label = "",
	hasSkipLogic = false,
	hasFilter = false,
}: StageProps) => {
	const componentClasses = cx("timeline-stage", className);

	const previewRef = useRef();

	const handleEditStage = () => {
		if (!previewRef.current) {
			return;
		}

		const rect = getAbsoluteBoundingRect(previewRef.current);
		const find = findPos(previewRef.current);

		onEditStage(id, {
			...rect,
			top: find,
		});
	};

	const handleNotchKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			handleEditStage();
		}
	};

	return (
		<motion.div className={componentClasses} variants={variants}>
			<div
				className="timeline-stage__notch"
				onClick={handleEditStage}
				onKeyDown={handleNotchKeyDown}
				role="button"
				tabIndex={0}
				aria-label={`Edit stage ${stageNumber}`}
			>
				{stageNumber}
			</div>
			<EditStageButton
				ref={previewRef}
				onEditStage={handleEditStage}
				type={type}
				label={label}
				hasSkipLogic={hasSkipLogic}
				hasFilter={hasFilter}
			/>
			<div className="timeline-stage__controls">
				<Button color="neon-coral" icon={<DeleteIcon />} onClick={() => onDeleteStage(id)} title="Delete stage">
					Delete stage
				</Button>
			</div>
		</motion.div>
	);
};

export { Stage as UnconnectedStage };
