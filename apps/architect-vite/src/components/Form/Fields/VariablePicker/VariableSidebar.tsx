import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { Heading } from "~/components/Codebook/Variables";
import Search from "~/components/Form/Fields/Search";
import { Button } from "~/lib/legacy-ui/components";
import ExternalLink from "../../../ExternalLink";
import { SimpleVariablePill } from "./VariablePill";

type SidebarProps = {
	options: Array<{ value: string; label: string; type?: string }>;
	onSelect: (value: string) => void;
	onCreateOption?: (value: string) => void;
	disallowCreation?: boolean;
};

const Sidebar = ({ options, onSelect, onCreateOption, disallowCreation = false }: SidebarProps) => {
	const [filterTerm, setFilterTerm] = useState("");
	const [isCreating, setIsCreating] = useState(false);
	const [newVariableName, setNewVariableName] = useState("");

	const sortedAndFilteredItems = useMemo(() => {
		if (!filterTerm) return options;
		return options.filter((item) => item.label.toLowerCase().includes(filterTerm.toLowerCase()));
	}, [filterTerm, options]);

	const startCreate = () => {
		setNewVariableName(filterTerm || "");
		setIsCreating(true);
	};

	const handleCreate = () => {
		if (!newVariableName.trim()) return;
		onCreateOption?.(newVariableName.trim());
		setNewVariableName("");
		setIsCreating(false);
		setFilterTerm("");
	};

	return (
		<motion.div
			className="fixed left-0 top-0 h-screen w-1/4 bg-white shadow-lg flex flex-col p-4"
			initial={{ x: -200 }}
			animate={{ x: 0 }}
			transition={{ type: "spring", damping: 20 }}
		>
			<Heading name="name">Variables</Heading>
			<div className="my-4">
				<Search
					placeholder={disallowCreation ? "Find a variable..." : "Search variables..."}
					input={{
						value: filterTerm,
						onChange: (e) => setFilterTerm(e.target.value),
					}}
				/>
			</div>

			<div className="flex-1 overflow-y-auto">
				{!disallowCreation && !isCreating && (
					<div className="mb-4">
						<Button variant="primary" onClick={startCreate} className="w-full">
							+ Create new variable
						</Button>
					</div>
				)}

				{isCreating && (
					<div className="mb-4 p-4 space-y-2">
						<input
							type="text"
							className="w-full border rounded px-2 py-1"
							value={newVariableName}
							onChange={(e) => setNewVariableName(e.target.value)}
							placeholder="Enter variable name"
							autoFocus
						/>
						<div className="flex justify-end space-x-2">
							<Button variant="ghost" onClick={() => setIsCreating(false)}>
								Cancel
							</Button>
							<Button variant="primary" onClick={handleCreate}>
								Create
							</Button>
						</div>
					</div>
				)}

				{sortedAndFilteredItems.length === 0 && !isCreating ? (
					<div>
						{disallowCreation ? (
							<p>
								You cannot create a new variable from here. Please create one or more variables elsewhere in your
								protocol, and return here to select them.
							</p>
						) : (
							<p>
								Type a name above and press &quot;Create new variable&quot; to add your first one. See{" "}
								<ExternalLink href="https://documentation.networkcanvas.com/reference/variable-naming/">
									documentation
								</ExternalLink>
								.
							</p>
						)}
					</div>
				) : (
					<ul>
						{sortedAndFilteredItems.map(({ value, label, type }) => (
							<li key={value} className="px-4 py-2 hover:bg-action cursor-pointer" onClick={() => onSelect(value)}>
								<SimpleVariablePill label={label} type={type} />
							</li>
						))}
					</ul>
				)}
			</div>
		</motion.div>
	);
};

export default Sidebar;
