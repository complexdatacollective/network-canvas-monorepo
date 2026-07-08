import { cx } from '~/utils/cva';

import PreviewRule from './PreviewRule';

type Rule = Record<string, unknown> & {
  id: string;
};

type PreviewRulesProps = {
  join?: string | null;
  rules: Rule[];
  codebook: Record<string, unknown>;
  onClickRule: (id: string) => void;
  onDeleteRule: (id: string) => void;
  hasError?: boolean;
};

const PreviewRules = ({
  join = null,
  rules,
  codebook,
  onClickRule,
  onDeleteRule,
  hasError = false,
}: PreviewRulesProps) => {
  const getJoin = (index: number): string | null =>
    rules.length !== 1 && index < rules.length - 1 ? join || null : null;

  return (
    <div
      className={cx(
        'bg-input rounded-sm border-2 border-transparent',
        hasError && 'border-destructive rounded-b-none',
      )}
    >
      {rules.length === 0 && (
        <div className="text-input-contrast/50 px-5 py-5 italic">
          Add rule types from the options below.
        </div>
      )}
      {rules.length > 0 && (
        <div className="flex w-full flex-col items-start py-5">
          {rules.map((rule, index) => (
            <div className="w-full" key={rule.id}>
              <PreviewRule
                // eslint-disable-next-line react/jsx-props-no-spreading
                {...rule}
                join={getJoin(index)}
                codebook={codebook}
                onClick={() => onClickRule(rule.id)}
                onDelete={() => onDeleteRule(rule.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PreviewRules;
