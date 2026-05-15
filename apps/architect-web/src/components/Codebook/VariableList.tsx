import { compose } from 'react-recompose';

import {
  Heading,
  rowClassName,
  type SortDirection,
  withSort,
} from './Variables';

type SortDirectionType = typeof SortDirection.ASC;

type VariableListProps = {
  variables?: string[];
  onDelete?: () => void;
  sortBy: string;
  sortDirection: SortDirectionType;
  sort: (options: { sortBy: string; sortDirection: SortDirectionType }) => void;
};

const Variables = ({
  variables = [],
  sortBy,
  sortDirection,
  sort,
  onDelete: _onDelete = () => {},
}: VariableListProps) => {
  const headingProps = {
    sortBy,
    sortDirection,
    onSort: sort,
  };

  return (
    <div>
      <table className="mt-(--space-lg) w-full">
        <thead>
          <tr className="border-divider border-b-[0.2rem]">
            <Heading
              name="name"
              // eslint-disable-next-line react/jsx-props-no-spreading
              {...headingProps}
            >
              Name
            </Heading>
          </tr>
        </thead>
        <tbody>
          {variables.map((name, index) => (
            <tr className={rowClassName(index)} key={name}>
              <td className="m-0 px-(--space-sm) py-(--space-md) text-base">
                {name}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default compose<VariableListProps, { variables?: string[] }>(withSort)(
  Variables,
);
