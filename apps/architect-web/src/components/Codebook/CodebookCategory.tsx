type CodebookCategoryProps = {
  title?: string;
  children?: React.ReactNode;
};

const CodebookCategory = ({
  title = '',
  children = null,
}: CodebookCategoryProps) => (
  <div>
    <h2>{title}</h2>
    <div className="border-divider mt-(--space-lg) border-t-[0.2rem]">
      {children}
    </div>
  </div>
);

export default CodebookCategory;
