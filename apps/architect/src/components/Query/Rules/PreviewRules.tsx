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
        // Rounded on every corner, error or not. The square bottom edge this
        // used to take butted against an error strip the rule builder rendered
        // directly beneath it; that strip is gone — the field's one error
        // message belongs to `BaseField`, below the whole builder — so a flat
        // bottom would now just be a box missing two corners.
        hasError && 'border-destructive',
      )}
    >
      {rules.length === 0 && (
        <div className="text-input-contrast/50 px-5 py-5 italic">
          Add rule types from the options below.
        </div>
      )}
      {rules.length > 0 && (
        // The rules are a list, and saying so is what tells assistive
        // technology how many there are and lets its user step between them.
        // Each item owns its card and the join that follows it — a `<ul>` may
        // contain nothing but `<li>`.
        //
        // `role="list"` is redundant in the abstract, which is what the lint
        // rule below objects to, but not here: Tailwind's preflight sets
        // `list-style: none` on every `ul`, and Safari drops list semantics
        // from an unstyled list — so without the role VoiceOver never
        // announces the count this exists to give.
        // oxlint-disable-next-line jsx-a11y/no-redundant-roles
        <ul role="list" className="flex w-full flex-col items-start py-5">
          {rules.map((rule, index) => (
            <li className="w-full" key={rule.id}>
              <PreviewRule
                // eslint-disable-next-line react/jsx-props-no-spreading
                {...rule}
                join={getJoin(index)}
                codebook={codebook}
                onClick={() => onClickRule(rule.id)}
                onDelete={() => onDeleteRule(rule.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default PreviewRules;
