import { getFieldId } from '../utils/issues';

type IssueAnchorProps = {
  fieldName: string;
  description: string;
};

// `sr-only` (not `hidden`): a `display:none` anchor has no box to scroll to.
const IssueAnchor = ({ fieldName, description }: IssueAnchorProps) => (
  <div id={getFieldId(fieldName)} data-name={description} className="sr-only" />
);

export default IssueAnchor;
