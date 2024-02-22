import Heading from './heading';
import Paragraph from './Paragraph';

const PageHeader = ({
  headerText,
  subHeaderText,
}: {
  headerText: string;
  subHeaderText: string;
}) => (
  <div className="flex flex-col">
    <Heading variant="h1" className="mb-2">
      {headerText}
    </Heading>
    <Paragraph variant="lead">{subHeaderText}</Paragraph>
  </div>
);

export default PageHeader;
