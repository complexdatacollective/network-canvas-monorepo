import { CommandEmpty } from '@/components/ui/command';
import { useInstantSearch } from 'react-instantsearch';

export default function NoResultsBoundary({
  noResultForTxt,
}: {
  noResultForTxt: string;
}) {
  const { results, indexUiState } = useInstantSearch();

  if (!results.__isArtificial && results.nbHits === 0) {
    return (
      <>
        <div className="mt-10 flex h-64 items-center justify-center overflow-y-auto overflow-x-hidden text-lg">
          <CommandEmpty>
            {noResultForTxt} <q>{indexUiState.query}</q>.
          </CommandEmpty>
        </div>
      </>
    );
  }

  return null;
}
