import { CheckSquare, XOctagon } from 'lucide-react';
import type { ReactNode } from 'react';

export const GoodPractice = ({ children }: { children: ReactNode }) => {
  return (
    <div className="flex flex-row">
      <CheckSquare className="mt-1.5 min-w-5 text-success" />
      <span className="pl-4">{children}</span>
    </div>
  );
};

export const BadPractice = ({ children }: { children: ReactNode }) => {
  return (
    <div className="flex flex-row">
      <XOctagon className="mt-1.5 min-w-5 text-destructive" />
      <span className="pl-4">{children}</span>
    </div>
  );
};
