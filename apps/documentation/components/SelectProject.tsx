import { Heading, Paragraph } from '@codaco/ui';
import ReactSelect, {
  components,
  type ControlProps,
  type OptionProps,
  type Props as SelectProps,
} from 'react-select';
import { cn } from '~/lib/utils';
import { OptionsSchema } from './ProjectSwitcher';

// custom Control component
const CustomControl = ({ children, ...props }: ControlProps) => {
  const selectedOption = props.getValue()[0];
  const parsedOption = OptionsSchema.safeParse(selectedOption);

  return (
    <components.Control {...props}>
      {parsedOption.success && parsedOption.data.image} {children}
    </components.Control>
  );
};

// custom Option component
const CustomOption = (props: OptionProps) => {
  const { data } = props;
  const parsedOption = OptionsSchema.safeParse(data);

  if (!parsedOption.success) return null;

  return (
    <components.Option {...props}>
      <div className="flex flex-1 items-center">
        <div className={'mr-2 flex min-w-[75px] items-center justify-start'}>
          {parsedOption.data.image}
        </div>
        <div className="flex flex-col">
          <Heading variant="h4" margin={'default'}>
            {parsedOption.data.label}
          </Heading>
          <Paragraph
            className="max-w-[20rem] max-[450px]:max-w-[12rem] sm:max-w-full"
            variant="smallText"
          >
            {parsedOption.data.description}
          </Paragraph>
        </div>
      </div>
    </components.Option>
  );
};

// custom React Select component
const SelectProject = ({
  options,
  value,
  onChange,
  className,
}: SelectProps) => (
  <ReactSelect
    isSearchable={false}
    className={cn('react-select-container', className)}
    classNamePrefix="react-select"
    value={value}
    onChange={onChange}
    options={options}
    components={{ Control: CustomControl, Option: CustomOption }}
  />
);

export default SelectProject;
