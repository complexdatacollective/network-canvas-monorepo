import { Input } from '@/components/ui/input';
import { Loader, Search as SearchIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  type UseSearchBoxProps,
  useInstantSearch,
  useSearchBox,
} from 'react-instantsearch';

interface CustomSearchBoxProps extends UseSearchBoxProps {
  placeholder: string;
}

export default function CustomSearchBox(props: CustomSearchBoxProps) {
  const { query, refine } = useSearchBox(props);
  const { status } = useInstantSearch();
  const [inputValue, setInputValue] = useState(query);
  const inputRef = useRef<HTMLInputElement>(null);

  const isSearchStalled = status === 'stalled';

  function setQuery(newQuery: string) {
    setInputValue(newQuery);
    refine(newQuery);
  }

  return (
    <form
      autoFocus
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();

        if (inputRef.current) {
          inputRef.current.blur();
        }
      }}
      onReset={(event) => {
        event.preventDefault();
        event.stopPropagation();

        setQuery('');

        if (inputRef.current) {
          inputRef.current.focus();
        }
      }}
    >
      <div className="flex items-center px-1.5">
        {isSearchStalled ? (
          <Loader size={'19px'} className="animate-spin text-gray-400" />
        ) : (
          <SearchIcon size={'19px'} className="text-gray-400" />
        )}
        <Input
          className="w-[90%] border-transparent px-1.5"
          ref={inputRef}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          placeholder={props.placeholder}
          spellCheck={false}
          type="text"
          value={inputValue}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
          }}
        />
      </div>
      <button hidden type="submit">
        Submit
      </button>
      <button hidden type="reset">
        Reset
      </button>
    </form>
  );
}
