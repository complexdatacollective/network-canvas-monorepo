import { Combobox } from "@base-ui-components/react/combobox";
import type { LucideProps } from "lucide-react";
import { icons as lucideIconMap } from "lucide-react";
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
				onValueChange={(val) => {
					if (val) {
						input.onChange(entryToValue(val));
					}
				}}
				filteredItems={filteredIcons}
				onInputValueChange={(inputValue) => {
					setQuery(inputValue);
				}}
			>
				<div className="flex flex-col gap-sm">
					<div className="flex items-center gap-md rounded-lg border border-border bg-white p-sm">
						{selectedEntry && (
							<div className="flex shrink-0 items-center justify-center text-foreground">
								<IconPreview entry={selectedEntry} size={24} />
							</div>
						)}
						<Combobox.Input
							placeholder="Search icons..."
							className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-charcoal/50"
						/>
						{input.value && (
							<Combobox.Clear className="flex shrink-0 items-center justify-center rounded p-xs text-charcoal hover:text-foreground">
								✕
							</Combobox.Clear>
						)}
					</div>

					<Combobox.Portal>
						<Combobox.Positioner align="start" sideOffset={4}>
							<Combobox.Popup className="z-[var(--z-tooltip)] max-h-72 w-80 overflow-hidden rounded-lg border border-border bg-surface-1 shadow-md">
								<Combobox.List className="overflow-y-auto p-xs" style={{ maxHeight: "calc(18rem - 8px)" }}>
									{filteredIcons.map((entry) => (
										<Combobox.Item
											key={entry.isCustom ? `custom-${entry.name}` : entry.name}
											value={entry}
											className="flex cursor-pointer items-center gap-sm rounded-md px-sm py-xs text-sm text-surface-1-foreground outline-none data-[highlighted]:bg-surface-2 data-[selected]:font-semibold"
										>
											<span className="flex h-6 w-6 shrink-0 items-center justify-center">
												<IconPreview entry={entry} size={18} />
											</span>
											<Combobox.ItemIndicator className="mr-xs">✓</Combobox.ItemIndicator>
											<span className="truncate">{entryToLabel(entry)}</span>
										</Combobox.Item>
									))}
								</Combobox.List>
								<Combobox.Empty className="p-md text-center text-sm text-charcoal">No icons found</Combobox.Empty>
							</Combobox.Popup>
						</Combobox.Positioner>
					</Combobox.Portal>
				</div>
			</Combobox.Root>

			{showError && (
				<div className="mt-xs text-sm text-error">
					<Icon name="warning" />
					{error}
				</div>
			)}
		</div>
	);
};

export default IconPicker;
