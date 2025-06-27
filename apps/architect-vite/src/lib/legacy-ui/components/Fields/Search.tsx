import { get, isEmpty, noop } from "lodash";
import { CrossIcon as ClearIcon, SearchIcon } from "lucide-react";
import { getCSSVariableAsString } from "../../utils/CSSVariables";
import Text from "./Text";

interface SearchProps {
	input?: {
		value?: string;
		onChange?: (value: string) => void;
		[key: string]: any;
	};
	[key: string]: any;
}

const Search = ({ input = { onChange: noop }, ...props }: SearchProps) => {
	const color = getCSSVariableAsString("--input-text");

	const hasValue = !isEmpty(get({ input, ...props }, ["input", "value"], ""));

	const onChange = get({ input, ...props }, ["input", "onChange"], noop);

	const handleClear = () => {
		onChange("");
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
			{...{ input, ...props }} // eslint-disable-line react/jsx-props-no-spreading
			type="search"
		/>
	);
};

export default Search;
