import Heading from '@codaco/fresco-ui/typography/Heading';

import SectionFrame from './SectionFrame';
type PageHeadingProps = {
  heading?: string | null;
};
const PageHeading = ({ heading = null }: PageHeadingProps) => {
  if (!heading) {
    return null;
  }
  return (
    <SectionFrame title="Page Heading">
      <Heading level="h2">{heading}</Heading>
    </SectionFrame>
  );
};
export default PageHeading;
