import { get, isEmpty, noop } from "es-toolkit/compat";
import { CrossIcon as ClearIcon, SearchIcon } from "lucide-react";
import type { ReactNode } from "react";
import Text from "./Text";

type SearchProps = {
	input?: {
		value?: string;
		onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
		onKeyDown?: (e: React.KeyboardEvent) => void;
		[key: string]: unknown;
	};
	color?: string;
	autoFocus?: boolean;
	placeholder?: string;
	label?: string | null;
	hint?: ReactNode;
	required?: boolean;
	[key: string]: unknown;
};

const Search = ({ input = { onChange: noop }, color, autoFocus, placeholder, ...props }: SearchProps) => {
	const hasValue = !isEmpty(get({ input, ...props }, ["input", "value"], ""));

	const onChange = get({ input, ...props }, ["input", "onChange"], noop);

	const handleClear = () => {
		const fakeEvent = {
			target: { value: "" },
		} as React.ChangeEvent<HTMLInputElement>;
		onChange(fakeEvent);
	};

	const adornmentLeft = color && <SearchIcon style={{ color }} />;

	const adornmentRight = color && hasValue && (
		<ClearIcon
			style={{
				color,
				cursor: "pointer",
			}}
			onClick={handleClear}
		/>
	);

	return (
		<Text
			adornmentLeft={adornmentLeft}
			adornmentRight={adornmentRight}
			input={input}
			autoFocus={autoFocus}
			placeholder={placeholder}
			type="search"
			{...props}
		/>
	);
};

export default Search;
