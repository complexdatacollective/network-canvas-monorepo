import type React from 'react';

type PageHeadingProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
};

const PageHeading = ({ title, description, actions }: PageHeadingProps) => (
  <div className="w-full">
    <div className="mx-auto flex w-full max-w-4xl flex-col">
      <div className="flex items-center justify-between gap-(--space-md)">
        {typeof title === 'string' ? <h1 className="h1">{title}</h1> : title}
        {actions ? (
          <div className="flex shrink-0 gap-(--space-md)">{actions}</div>
        ) : null}
      </div>
      {description ? <p className="lead m-0">{description}</p> : null}
    </div>
  </div>
);

export default PageHeading;
