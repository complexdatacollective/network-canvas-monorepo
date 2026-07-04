import { Lock } from 'lucide-react';

import type { VariableOptions } from '@codaco/protocol-validation';

type LockedOptionsProps = {
  options: VariableOptions;
};

const LockedOptions = ({ options }: LockedOptionsProps) => (
  <div className="bg-platinum relative rounded p-4 opacity-50">
    <Lock className="text-charcoal absolute top-4 right-4 h-4 w-4" />
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left">
          <th className="pb-2 font-bold">Label</th>
          <th className="pb-2 font-bold">Value</th>
        </tr>
      </thead>
      <tbody>
        {options.map((option) => (
          <tr key={String(option.value)}>
            <td className="py-1">{option.label}</td>
            <td className="py-1 font-mono">{String(option.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default LockedOptions;
