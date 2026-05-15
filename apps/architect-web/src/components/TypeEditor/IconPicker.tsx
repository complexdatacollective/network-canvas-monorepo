import { Combobox } from "@base-ui/react/combobox";
import type { LucideProps } from "lucide-react";
import { ChevronDown, icons as lucideIconMap, Search } from "lucide-react";
import { type ComponentType, useMemo, useState } from "react";
import Icon from "~/lib/legacy-ui/components/Icon";

const CUSTOM_ICONS = ["add-a-person", "add-a-place"] as const;

type IconEntry = {
	name: string;
	isCustom: boolean;
};

const allIcons: IconEntry[] = [
	...CUSTOM_ICONS.map((name) => ({ name, isCustom: true })),
	...Object.keys(lucideIconMap).map((name) => ({ name, isCustom: false })),
];

function IconPreview({ entry, size = 20 }: { entry: IconEntry; size?: number }) {
	if (entry.isCustom) {
		return <Icon name={entry.name} style={{ width: size, height: size }} />;
	}

	const LucideIcon = lucideIconMap[entry.name as keyof typeof lucideIconMap] as ComponentType<LucideProps>;
	if (!LucideIcon) return null;
	return <LucideIcon size={size} />;
}

type InputProps = {
	value: string;
	onChange: (value: string) => void;
};

type MetaProps = {
	error?: string;
	invalid?: boolean;
	touched?: boolean;
};

type IconPickerProps = {
	input: InputProps;
	meta: MetaProps;
};

const MAX_VISIBLE_ITEMS = 200;

function findEntryByValue(value: string): IconEntry | null {
	if (!value) return null;

	if ((CUSTOM_ICONS as readonly string[]).includes(value)) {
		return { name: value, isCustom: true };
	}

	if (Object.hasOwn(lucideIconMap, value)) {
		return { name: value, isCustom: false };
	}

	return null;
}

const IconPicker = ({ input, meta: { error, invalid, touched } }: IconPickerProps) => {
	const [query, setQuery] = useState("");

	const filteredIcons = useMemo(() => {
		if (!query) return allIcons.slice(0, MAX_VISIBLE_ITEMS);

		const lowerQuery = query.toLowerCase();
		const matches: IconEntry[] = [];
		for (const entry of allIcons) {
			if (entry.name.toLowerCase().includes(lowerQuery)) {
				matches.push(entry);
				if (matches.length >= MAX_VISIBLE_ITEMS) break;
			}
		}
		return matches;
	}, [query]);

	const selectedEntry = useMemo(() => findEntryByValue(input.value) ?? undefined, [input.value]);

	const showError = invalid && touched && error;

	return (
		<div className="m-0 [&>h4]:m-0">
			<Combobox.Root<IconEntry>
				value={selectedEntry}
				filteredItems={filteredIcons}
				onValueChange={(val) => {
					if (val) {
						input.onChange(val.name);
					}
				}}
				onInputValueChange={(inputValue) => {
					setQuery(inputValue);
				}}
			>
				<Combobox.Trigger className="flex w-full cursor-pointer items-center gap-2 rounded-sm border border-surface-2 bg-surface-1 px-3 py-2 text-left text-sm text-foreground">
					{selectedEntry ? (
						<>
							<span className="flex h-6 w-6 shrink-0 items-center justify-center">
								<IconPreview entry={selectedEntry} size={24} />
							</span>
							<span className="min-w-0 flex-1 truncate">{selectedEntry.name}</span>
						</>
					) : (
						<span className="min-w-0 flex-1 truncate text-charcoal">Select an icon...</span>
					)}
					<ChevronDown size={16} className="shrink-0 text-charcoal" />
				</Combobox.Trigger>

				<Combobox.Portal>
					<Combobox.Positioner align="start" sideOffset={4} className="z-(--z-tooltip)">
						<Combobox.Popup className="w-(--anchor-width) min-w-(--anchor-width) overflow-hidden rounded-sm border border-surface-2 bg-surface-1 shadow-md">
							<div className="flex items-center gap-2 border-b border-surface-2 px-3 py-2">
								<Search size={16} className="shrink-0 text-charcoal" />
								<Combobox.Input
									placeholder="Search icons..."
									className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-charcoal"
								/>
							</div>

							<Combobox.List className="max-h-72 overflow-y-auto p-1">
								{filteredIcons.map((entry) => (
									<Combobox.Item
										key={entry.isCustom ? `custom-${entry.name}` : entry.name}
										value={entry}
										className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground outline-none data-[highlighted]:bg-surface-2"
									>
										<span className="flex h-5 w-5 shrink-0 items-center justify-center">
											<IconPreview entry={entry} size={18} />
										</span>
										<span className="min-w-0 flex-1 truncate">{entry.name}</span>
										<Combobox.ItemIndicator className="shrink-0 text-foreground">✓</Combobox.ItemIndicator>
									</Combobox.Item>
								))}
							</Combobox.List>

							<Combobox.Empty className="p-4 text-center text-sm text-charcoal empty:hidden">
								No icons found
							</Combobox.Empty>
						</Combobox.Popup>
					</Combobox.Positioner>
				</Combobox.Portal>
			</Combobox.Root>

			{showError && (
				<div className="mt-1 text-sm text-error">
					<Icon name="warning" />
					{error}
				</div>
			)}
		</div>
	);
};

export default IconPicker;
