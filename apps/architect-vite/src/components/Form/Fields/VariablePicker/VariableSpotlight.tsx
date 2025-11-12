import cx from "classnames";
import { get } from "es-toolkit/compat";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import Search from "~/components/Form/Fields/Search";
import { Icon, Modal, Scroller } from "~/lib/legacy-ui/components";
import { allowedVariableName, uniqueByList } from "~/utils/validations";
import { getVariablesForSubject } from "../../../../selectors/codebook";
import { sortByLabel } from "../../../Codebook/helpers";
import ExternalLink from "../../../ExternalLink";
import { SimpleVariablePill } from "./VariablePill";

type ListItemProps = {
	disabled?: boolean;
	selected?: boolean;
	onSelect?: () => void;
	children?: React.ReactNode;
	setSelected?: () => void;
	removeSelected?: () => void;
};

const ListItem = ({
	disabled = false,
	selected = false,
	onSelect = null,
	children = null,
	setSelected = () => {},
	removeSelected = () => {},
}: ListItemProps) => {
	const ref = useRef(null);

	useEffect(() => {
		if (selected) {
			// Move element into view when it is selected
			ref.current.scrollIntoView({ block: "nearest" });
		}
	}, [selected]);

	const classes = cx(
		"spotlight-list-item",
		{ "spotlight-list-item--selected": selected },
		{ "spotlight-list-item--clickable": onSelect },
		{ "spotlight-list-item--disabled": disabled },
	);

	return (
		<li onMouseEnter={setSelected} onMouseLeave={removeSelected} ref={ref}>
			<div className={classes} onClick={onSelect}>
				{children}
				{selected && <kbd>Enter&nbsp;&#8629;</kbd>}
			</div>
		</li>
	);
};

type DividerProps = {
	legend: string;
};

const Divider = ({ legend }: DividerProps) => (
	<ListItem>
		<fieldset className="divider-header">
			<legend>{legend}</legend>
		</fieldset>
	</ListItem>
);

type VariableSpotlightProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	disallowCreation?: boolean;
	onSelect: (value: string) => void;
	entity: string;
	type?: string;
	onCancel: () => void;
	onCreateOption: (value: string) => void;
	options: Array<{
		value: string;
		label: string;
		type?: string;
	}>;
};

const VariableSpotlight = ({
	open,
	onOpenChange,
	entity,
	type = null,
	onSelect,
	onCancel,
	onCreateOption,
	options,
	disallowCreation = false,
}: VariableSpotlightProps) => {
	const [filterTerm, setFilterTerm] = useState("");

	// Cursor positions:
	// -2: Search input
	// -1: Create option (if visible)
	// 0-n: Existing variables
	const [cursor, setCursor] = useState(-2);
	const [showCursor, setShowCursor] = useState(false);

	const handleCreateOption = () => {
		setFilterTerm(""); // Clear search term so the user doesn't see a flash of invalid text
		onCreateOption(filterTerm);
	};

	const sortedAndFilteredItems = useMemo(() => {
		options.sort(sortByLabel);

		if (!filterTerm) {
			return options;
		}
		return options.filter((item) => item.label.toLowerCase().includes(filterTerm.toLowerCase()));
	}, [filterTerm, options]);

	const existingVariables = useSelector((state) => getVariablesForSubject(state, { entity, type }));

	const hasOptions = useMemo(() => options.length > 0, [options]);
	const hasFilterTerm = useMemo(() => filterTerm.length > 0, [filterTerm]);
	const hasFilterResults = useMemo(() => sortedAndFilteredItems.length > 0, [sortedAndFilteredItems]);

	const existingVariableNames = Object.keys(existingVariables).map((variable) =>
		get(existingVariables[variable], "name"),
	);

	const invalidVariableName = useMemo(() => {
		const unique = uniqueByList(existingVariableNames)(filterTerm);
		const allowed = allowedVariableName()(filterTerm);

		return unique || allowed || undefined;
	}, [filterTerm, existingVariableNames]);

	const renderResults = () => (
		<Scroller>
			<ol>
				{filterTerm && options.filter((item) => item.label === filterTerm).length !== 1 && (
					<>
						{disallowCreation && hasFilterTerm && !hasFilterResults && (
							<div className="variable-spotlight__empty">
								<Icon name="warning" />
								<div>
									<p>
										You cannot create a new variable from here. Please create one or more variables elsewhere in your
										protocol, and return here to select them.
									</p>
								</div>
							</div>
						)}
						{!disallowCreation && (
							<>
								<Divider legend="Create" />
								{!invalidVariableName ? (
									<ListItem
										onSelect={handleCreateOption}
										selected={showCursor && cursor === -1}
										setSelected={() => {
											setShowCursor(true);
											setCursor(-1);
										}}
										removeSelected={() => setCursor(0)}
									>
										<div className="create-new">
											<Icon name="add" color="charcoal" />
											<span>
												Create new variable called &quot;
												{filterTerm}
												&quot;.
											</span>
										</div>
									</ListItem>
								) : (
									<ListItem disabled>
										<div className="create-new">
											<Icon name="warning" />
											<span>
												Cannot create variable named &quot;
												{filterTerm}
												&quot;&nbsp;&mdash;&nbsp;
												{invalidVariableName}.
											</span>
										</div>
									</ListItem>
								)}
							</>
						)}
					</>
				)}
				{hasFilterResults && (
					<Divider legend={hasFilterTerm ? `Existing Variables Containing "${filterTerm}"` : "Existing Variables"} />
				)}
				{sortedAndFilteredItems.map(({ value, label, type: optionType }, index) => (
					<ListItem
						key={value}
						onSelect={() => onSelect(value)}
						selected={showCursor && (cursor === index || label === filterTerm)}
						setSelected={() => {
							setShowCursor(true);
							setCursor(index);
						}}
						removeSelected={() => setCursor(-1)}
					>
						<SimpleVariablePill label={label} type={optionType} />
					</ListItem>
				))}
			</ol>
		</Scroller>
	);

	// Reset cursor position when list is filtered
	useEffect(() => {
		// Set cursor to create if there are no other options
		if (!hasFilterResults) {
			setCursor(-1);
			setShowCursor(true);
			return;
		}

		// If we are beyond the end, wrap to the end of the list
		if (cursor > sortedAndFilteredItems.length - 1) {
			setCursor(sortedAndFilteredItems.length - 1);
		}
	}, [sortedAndFilteredItems, filterTerm, cursor, hasFilterResults]);

	const handleFilter = (e) => {
		// throw new Error();
		const value = get(e, "target.value", "");
		setFilterTerm(value);
	};

	// Navigate within the list of results using the keyboard
	const handleKeyDown = (e) => {
		// Close the picker when pressing escape
		if (e.key === "Escape") {
			onCancel();
		}

		if (e.key === "ArrowUp" || e.key === "ArrowDown") {
			e.preventDefault(); // Prevent moving cursor within search input

			// Show the cursor only when either arrow key is pressed for the first time
			if (!showCursor) {
				setShowCursor(true);
			}
		}

		if (e.key === "ArrowUp") {
			// If there are items and the cursor is not at the top,
			// or if there are no items and the cursor is not at the top
			// move the cursor up
			if ((hasFilterTerm && cursor > -1) || cursor > 0) {
				setCursor(cursor - 1);
			}
		} else if (e.key === "ArrowDown") {
			// If there is no filterTerm and the cursor is in the search input,
			// or if the filterterm is invalid and the cursor is in the search input,
			// move the cursor to the first item
			if ((filterTerm.length === 0 && cursor === -2) || (cursor === -2 && invalidVariableName)) {
				setCursor(0);
				return;
			}

			// If the cursor is not at the bottom
			// Or there are no items and the cursor is in the search input
			// move the cursor down
			if (cursor < sortedAndFilteredItems.length - 1 || (filterTerm.length === 0 && cursor === -2)) {
				setCursor(cursor + 1);
			}
		} else if (e.key === "Enter") {
			// If the cursor is within the list of results, select the value
			if (cursor > -1) {
				onSelect(sortedAndFilteredItems[cursor].value);
				return;
			}

			// If the cursor is in the create option,
			// and there is a filter term,
			// create a new variable with that value
			if (!disallowCreation && !invalidVariableName && hasFilterTerm && cursor === -1) {
				handleCreateOption();
			}
		}
	};

	const containerVariants = {
		visible: {
			y: 0,
		},
		hidden: {
			y: -50,
		},
	};

	const resultsVariants = {
		visible: { height: "auto", transitionEnd: { display: "flex" } },
		hidden: { height: 0 },
	};

	return (
		<Modal open={open} onOpenChange={onOpenChange}>
			<motion.div
				className="w-xl bg-surface-1 text-surface-1-foreground fixed top-10 left-1/2 max-w-[calc(100vw-3rem)] -translate-x-1/2 rounded-lg overflow-hidden"
				variants={containerVariants}
				initial="hidden"
				animate="visible"
				exit="hidden"
				transition={{
					type: "spring",
				}}
			>
				<header className="variable-spotlight__header">
					<Search
						autoFocus
						placeholder={disallowCreation ? "Find a variable..." : "Create or find a variable..."}
						input={{
							value: filterTerm,
							onChange: handleFilter,
							onKeyDown: handleKeyDown,
						}}
					/>
				</header>
				<motion.main
					className="variable-spotlight__list"
					variants={resultsVariants}
					transition={{ duration: 0.2, ease: "easeInOut" }}
				>
					{!disallowCreation && !hasOptions && (
						<div className="variable-spotlight__empty">
							<Icon name="info" />
							<div>
								<p>
									To create your first variable of this type, type a name above and press enter. See our&nbsp;
									<ExternalLink href="https://documentation.networkcanvas.com/reference/variable-naming/">
										documentation on variable naming
									</ExternalLink>
									&nbsp;for more information.
								</p>
							</div>
						</div>
					)}
					{disallowCreation && !hasFilterTerm && !hasOptions && (
						<div className="variable-spotlight__empty">
							<Icon name="warning" />
							<div>
								<p>
									No variables exist for you to select, and you cannot create a new variable from here. Please create
									one or more variables elsewhere in your protocol, and return here to select them.
								</p>
							</div>
						</div>
					)}
					{renderResults()}
				</motion.main>
			</motion.div>
		</Modal>
	);
};

export default VariableSpotlight;
