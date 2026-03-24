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

function toLucideKebab(name: string): string {
	return name
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
		.toLowerCase();
}

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

	const customMatch = CUSTOM_ICONS.find((c) => c === value);
	if (customMatch) return { name: customMatch, isCustom: true };

	const lucideMatch = Object.keys(lucideIconMap).find((k) => toLucideKebab(k) === value || k === value);
	if (lucideMatch) return { name: lucideMatch, isCustom: false };

	return null;
}

function entryToValue(entry: IconEntry): string {
	if (entry.isCustom) return entry.name;
	return toLucideKebab(entry.name);
}

function entryToLabel(entry: IconEntry): string {
	if (entry.isCustom) return entry.name;
	return toLucideKebab(entry.name);
}

const IconPicker = ({ input, meta: { error, invalid, touched } }: IconPickerProps) => {
	const [query, setQuery] = useState("");

	const filteredIcons = useMemo(() => {
		if (!query) return allIcons.slice(0, MAX_VISIBLE_ITEMS);

		const lowerQuery = query.toLowerCase();
		const matches: IconEntry[] = [];
		for (const entry of allIcons) {
			const searchName = entry.isCustom ? entry.name : toLucideKebab(entry.name);
			if (searchName.toLowerCase().includes(lowerQuery)) {
				matches.push(entry);
				if (matches.length >= MAX_VISIBLE_ITEMS) break;
			}
		}
		return matches;
	}, [query]);

	const selectedEntry = useMemo(() => findEntryByValue(input.value) ?? undefined, [input.value]);

	const showError = invalid && touched && error;

	return (
		<div className="form-field-container">
			<Combobox.Root<IconEntry>
				value={selectedEntry}
				filteredItems={filteredIcons}
				onValueChange={(val) => {
					if (val) {
						input.onChange(entryToValue(val));
					}
				}}
				onInputValueChange={(inputValue) => {
					setQuery(inputValue);
				}}
			>
				<Combobox.Trigger className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-[var(--color-surface-2)] bg-[var(--color-surface-1)] px-3 py-2 text-left text-sm text-[var(--color-foreground)]">
					{selectedEntry ? (
						<>
							<span className="flex h-6 w-6 shrink-0 items-center justify-center">
								<IconPreview entry={selectedEntry} size={24} />
							</span>
							<span className="min-w-0 flex-1 truncate">{entryToLabel(selectedEntry)}</span>
						</>
					) : (
						<span className="min-w-0 flex-1 truncate text-[var(--color-charcoal)]">Select an icon...</span>
					)}
					<ChevronDown size={16} className="shrink-0 text-[var(--color-charcoal)]" />
				</Combobox.Trigger>

				<Combobox.Portal>
					<Combobox.Positioner align="start" sideOffset={4} className="z-[var(--z-tooltip)]">
						<Combobox.Popup className="w-[var(--anchor-width)] min-w-[var(--anchor-width)] overflow-hidden rounded-lg border border-[var(--color-surface-2)] bg-[var(--color-surface-1)] shadow-md">
							<div className="flex items-center gap-2 border-b border-[var(--color-surface-2)] px-3 py-2">
								<Search size={16} className="shrink-0 text-[var(--color-charcoal)]" />
								<Combobox.Input
									placeholder="Search icons..."
									className="min-w-0 flex-1 bg-transparent text-sm text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-charcoal)]"
								/>
							</div>

							<Combobox.List className="max-h-72 overflow-y-auto p-1">
								{filteredIcons.map((entry) => (
									<Combobox.Item
										key={entry.isCustom ? `custom-${entry.name}` : entry.name}
										value={entry}
										className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--color-foreground)] outline-none data-[highlighted]:bg-[var(--color-surface-2)]"
									>
										<span className="flex h-5 w-5 shrink-0 items-center justify-center">
											<IconPreview entry={entry} size={18} />
										</span>
										<span className="min-w-0 flex-1 truncate">{entryToLabel(entry)}</span>
										<Combobox.ItemIndicator className="shrink-0 text-[var(--color-foreground)]">
											✓
										</Combobox.ItemIndicator>
									</Combobox.Item>
								))}
							</Combobox.List>

							<Combobox.Empty className="p-4 text-center text-sm text-[var(--color-charcoal)] empty:hidden">
								No icons found
							</Combobox.Empty>
						</Combobox.Popup>
					</Combobox.Positioner>
				</Combobox.Portal>
			</Combobox.Root>

			{showError && (
				<div className="mt-1 text-sm text-[var(--color-error)]">
					<Icon name="warning" />
					{error}
				</div>
			)}
		</div>
	);
};

export default IconPicker;
