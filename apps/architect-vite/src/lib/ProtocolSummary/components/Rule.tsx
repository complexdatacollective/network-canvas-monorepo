import { compose } from "recompose";
import RuleText from "~/components/Query/Rules/PreviewText";
import withDisplayOptions from "~/components/Query/Rules/withDisplayOptions";

type RuleProps = {
	type: string;
	options: Record<string, unknown>;
};

const Rule = ({ type, options }: RuleProps) => <RuleText type={type} options={options} />;

export default compose(withDisplayOptions)(Rule);
