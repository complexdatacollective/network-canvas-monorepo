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
      <h2>{heading}</h2>
    </SectionFrame>
  );
};

export default PageHeading;
