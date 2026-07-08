import Node, {
  type NodeColorSequence,
  type NodeShape,
} from '@codaco/fresco-ui/Node';
import Icon from '~/lib/legacy-ui/components/Icon';
import { cx } from '~/utils/cva';

const SHAPES: Array<{ value: NodeShape; label: string }> = [
  { value: 'circle', label: 'Circle' },
  { value: 'square', label: 'Square' },
  { value: 'diamond', label: 'Diamond' },
];

type ShapePickerProps = {
  input: {
    value: string;
    onChange: (value: string) => void;
  };
  meta: {
    error?: string;
    invalid?: boolean;
    touched?: boolean;
  };
  small?: boolean;
  nodeColor?: string;
};

const ShapePicker = ({
  input,
  meta: { error, invalid, touched },
  small,
  nodeColor = 'node-color-seq-1',
}: ShapePickerProps) => {
  const nodeSize = small ? 'xxs' : 'xs';
  const showError = invalid && touched && error;

  return (
    <div className="m-0 [&>h4]:m-0">
      <div>
        <div className="flex flex-wrap gap-2.5">
          {SHAPES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={cx(
                'flex flex-col items-center gap-1 p-2.5',
                'bg-surface-1 cursor-pointer border-2 border-transparent',
                'transition-colors duration-300 ease-in-out',
                input.value === value && 'border-neon-coral',
              )}
              onClick={() => input.onChange(value)}
              aria-label={`Select shape ${label}`}
              aria-pressed={input.value === value}
            >
              <Node
                label=""
                shape={value}
                color={nodeColor as NodeColorSequence}
                size={nodeSize}
              />
              {!small && <span className="text-text text-sm">{label}</span>}
            </button>
          ))}
        </div>
        {showError && (
          <div className="bg-destructive text-destructive-contrast flex items-center px-1 py-1 [&_svg]:max-h-5">
            <Icon name="warning" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default ShapePicker;
