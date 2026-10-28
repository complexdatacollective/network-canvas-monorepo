import Rules, { type FilterType } from '../Rules';

type FilterProps = {
  filter: FilterType;
};

const Filter = ({ filter }: FilterProps) => {
  if (!filter) {
    return null;
  }

  return <Rules filter={filter} />;
};

export default Filter;
