import { get } from "es-toolkit/compat";
import Fuse from "fuse.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { connect, useSelector } from "react-redux";
import { useLocation } from "wouter";
import Search from "~/components/Form/Fields/Search";
import Dialog from "~/components/NewComponents/Dialog";
import Tag from "~/components/Tag";
import { Button } from "~/lib/legacy-ui/components";
import { getExperiments, getTimelineLocus } from "~/selectors/protocol";
import InterfaceList from "./InterfaceList";
import { INTERFACE_TYPES, TAG_COLORS, TAGS } from "./interfaceOptions";

const fuseOptions = {
	threshold: 0.25,
	shouldSort: true,
	findAllMatches: true,
	includeScore: true,
	distance: 10000, // Needed because keywords are long strings
	keys: ["title", "description", "keywords"],
};

// Using existing getTimelineLocus selector instead of custom selector

const fuse = new Fuse(INTERFACE_TYPES, fuseOptions);

const interfaceHasAllSelectedTags = (selectedTags, interfaceTags) => {
	if (selectedTags.length === 0) {
		return true;
	}
	return selectedTags.every((tag) => interfaceTags.includes(tag));
};

const search = (query) => {
	if (query.length === 0) {
		return INTERFACE_TYPES;
	}
	const result = fuse.search(query);
	return result.sort((a, b) => a.score - b.score).map((item) => item.item);
};

type NewStageScreenProps = {
	insertAtIndex?: number;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	experiments?: {
		encryptedVariables?: boolean;
	};
};

const NewStageScreen = ({ insertAtIndex, open, onOpenChange, experiments = {} }: NewStageScreenProps) => {
	const [, setLocation] = useLocation();
	const [selectedTags, setSelectedTags] = useState([]);
	const [query, setQuery] = useState("");
	const [cursor, setCursor] = useState(0);
	const [cursorActive, setCursorActive] = useState(false);
	const [mouseMoved, setMouseMoved] = useState(false);

	const _locus = useSelector(getTimelineLocus);

	const filteredInterfaces = useMemo(() => {
		let interfaces = search(query, selectedTags).filter(({ tags: interfaceTags }) =>
			// eslint-disable-next-line implicit-arrow-linebreak
			interfaceHasAllSelectedTags(selectedTags, interfaceTags),
		);

		if (!experiments.encryptedVariables) {
			interfaces = interfaces.filter(({ type }) => type !== "Anonymisation");
		}

		return interfaces;
	}, [query, selectedTags, experiments]);

	const filteredInterfaceTags = useMemo(
		() =>
			filteredInterfaces.reduce((acc, { tags }) => {
				acc.push(...tags);
				return acc;
			}, []),
		[filteredInterfaces],
	);

	const tags = useMemo(
		() =>
			Object.values(TAGS).map((value) => ({
				value,
				selected: selectedTags.includes(value),
				disabled: !filteredInterfaceTags.includes(value),
			})),
		[selectedTags, filteredInterfaceTags],
	);

	const handleTagClick = useCallback(
		(tag) => {
			if (selectedTags.includes(tag)) {
				setSelectedTags(selectedTags.filter((t) => t !== tag));
				return;
			}

			setSelectedTags([...selectedTags, tag]);
		},
		[selectedTags],
	);

	// Don't fire card enter/exit events until the mouse has moved
	const handleMouseMove = useCallback(() => {
		if (!mouseMoved) {
			setMouseMoved(true);
		}
	}, [mouseMoved]);

	const handleUpdateQuery = useCallback((eventOrValue) => {
		const newQuery = get(eventOrValue, ["target", "value"], eventOrValue);
		setQuery(newQuery);
	}, []);

	const handleSelectInterface = useCallback(
		(interfaceType) => {
			onOpenChange(false); // Close the dialog

			const params = new URLSearchParams();
			params.set("type", interfaceType);
			if (insertAtIndex !== undefined) {
				params.set("insertAtIndex", insertAtIndex.toString());
			}
			setLocation(`/protocol/stage/new?${params.toString()}`);
		},
		[insertAtIndex, onOpenChange, setLocation],
	);

	// Navigate within the list of results using the keyboard
	const handleKeyDown = useCallback(
		(e) => {
			if (e.key === "ArrowUp" || e.key === "ArrowDown") {
				e.preventDefault(); // Prevent moving cursor within search input
				if (!cursorActive) {
					setCursorActive(true);
					return;
				}

				setMouseMoved(false);
			}

			if (cursor > filteredInterfaces.length - 1) {
				setCursor(filteredInterfaces.length - 1);
				return;
			}

			if (e.key === "Enter") {
				handleSelectInterface(filteredInterfaces[cursor].type);
				return;
			}

			if (e.key === "ArrowUp") {
				if (cursor === 0) {
					return;
				}
				setCursor(cursor - 1);
			} else if (e.key === "ArrowDown") {
				if (cursor + 1 > filteredInterfaces.length - 1) {
					return;
				}
				setCursor(cursor + 1);
			}
		},
		[cursor, cursorActive, filteredInterfaces, handleSelectInterface],
	);

	const handleRemoveHighlight = useCallback(() => {
		if (!mouseMoved) {
			return;
		}
		setCursorActive(false);
		setCursor(0);
	}, [mouseMoved]);

	const handleSetHighlight = useCallback(
		(index) => {
			if (!mouseMoved) {
				return;
			}
			setCursorActive(true);
			setCursor(index);
		},
		[mouseMoved],
	);

	const handleClearSearchAndFilter = useCallback(() => {
		setQuery("");
		setSelectedTags([]);
	});

	const hasQuery = query !== "";

	// Once we get a search string, show the cursor at index 0
	useEffect(() => {
		if (!hasQuery) {
			return;
		}
		setCursor(0);
		setCursorActive(true);
		setMouseMoved(false);
	}, [hasQuery]);

	useEffect(() => {
		window.addEventListener("mousemove", handleMouseMove);

		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
		};
	}, [handleMouseMove]);

	if (insertAtIndex === undefined) return null;

	return (
		<Dialog
			open={open}
			onOpenChange={onOpenChange}
			header={
				<div className="flex flex-col gap-4">
					<h2 className="m-0">Select an Interface Type</h2>
					<div className="flex flex-col gap-4">
						<div className="w-full">
							<Search
								placeholder="Search interfaces by name or keyword..."
								input={{
									value: query,
									onChange: handleUpdateQuery,
									onKeyDown: handleKeyDown,
								}}
								autoFocus
							/>
						</div>
						<div className="flex items-center gap-4">
							<div className="flex-shrink-0 text-white">
								<h4 className="text-sm font-semibold">Filter by capabilities:</h4>
							</div>
							<div className="flex flex-wrap gap-1 text-navy-taupe">
								{tags.map(({ value, selected, disabled }) => (
									<Tag
										key={value}
										id={value}
										selected={selected}
										onClick={handleTagClick}
										color={get(TAG_COLORS, value)}
										disabled={disabled}
									>
										{value}
									</Tag>
								))}
							</div>
						</div>
					</div>
				</div>
			}
			footer={
				<Button onClick={() => onOpenChange(false)} color="platinum">
					Cancel
				</Button>
			}
			className="h-[80%]"
		>
			<InterfaceList
				items={filteredInterfaces}
				onSelect={handleSelectInterface}
				highlightedIndex={cursorActive ? cursor : undefined}
				handleClearSearchAndFilter={handleClearSearchAndFilter}
				setHighlighted={handleSetHighlight}
				removeHighlighted={handleRemoveHighlight}
			/>
		</Dialog>
	);
};

const mapStateToProps = (state) => ({
	experiments: getExperiments(state),
});

export default connect(mapStateToProps)(NewStageScreen);
