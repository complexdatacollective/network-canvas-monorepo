import { getFieldId } from "../utils/issues";

type IssueAnchorProps = {
	fieldName: string;
	description: string;
};

const IssueAnchor = ({ fieldName, description }: IssueAnchorProps) => (
	<div id={getFieldId(fieldName)} data-name={description} />
);

export default IssueAnchor;