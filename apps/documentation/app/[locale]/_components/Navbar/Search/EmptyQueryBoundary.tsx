import { useInstantSearch } from 'react-instantsearch';

type EmptyQueryBoundaryProps = {
  noResultTxt: string;
  children: React.ReactNode;
};

export default function EmptyQueryBoundary({
  children,
  noResultTxt,
}: EmptyQueryBoundaryProps) {
  const { indexUiState } = useInstantSearch();

  if (!indexUiState.query) {
    return (
      <div className="mt-10 flex h-64 items-center justify-center overflow-y-auto overflow-x-hidden text-lg">
        {noResultTxt}
      </div>
    );
  }

  return <div className="mt-5">{children}</div>;
}
