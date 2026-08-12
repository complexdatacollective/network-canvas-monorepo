import React from 'react';

import type { ValidationName } from '@codaco/protocol-validation';
import { cx } from '~/utils/cva';

const unreachable = (_validation: never): never => {
  throw new Error('Unhandled VariablePill validation icon');
};

const strokeProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  strokeWidth: 1.65,
} as const;

function RequiredIcon() {
  return (
    <g {...strokeProps}>
      <path d="M 10 3.5 V 16.5" />
      <path d="M 5 6.5 L 15 13.5" />
      <path d="M 15 6.5 L 5 13.5" />
    </g>
  );
}

function Operator({
  direction,
  equal = false,
  x = 5,
}: {
  direction: 'greater' | 'less';
  equal?: boolean;
  x?: number;
}) {
  const chevron =
    direction === 'greater'
      ? `M ${x - 2.5} 5.5 L ${x + 2} 9.5 L ${x - 2.5} 13.5`
      : `M ${x + 2.5} 5.5 L ${x - 2} 9.5 L ${x + 2.5} 13.5`;

  return (
    <g {...strokeProps}>
      <path d={chevron} />
      {equal && <path d={`M ${x - 2.5} 16 H ${x + 2.5}`} />}
    </g>
  );
}

function UniqueIcon() {
  return (
    <g {...strokeProps}>
      <rect x="3.5" y="4" width="8" height="8" rx="2" />
      <rect x="8.5" y="8" width="8" height="8" rx="2" />
      <path d="M 3 17 L 17 3" strokeWidth="2" />
    </g>
  );
}

function EqualityIcon({ different = false }: { different?: boolean }) {
  return (
    <g {...strokeProps}>
      <path d="M 5 7.5 H 15" />
      <path d="M 5 12.5 H 15" />
      {different && <path d="M 5 16 L 15 4" strokeWidth="2" />}
    </g>
  );
}

function ValidationShape({ validation }: { validation: ValidationName }) {
  switch (validation) {
    case 'required':
    case 'requiredAcceptsNull':
      return <RequiredIcon />;
    case 'minLength':
    case 'minValue':
    case 'minSelected':
    case 'greaterThanOrEqualToVariable':
      return <Operator direction="greater" equal x={10} />;
    case 'maxLength':
    case 'maxValue':
    case 'maxSelected':
    case 'lessThanOrEqualToVariable':
      return <Operator direction="less" equal x={10} />;
    case 'unique':
      return <UniqueIcon />;
    case 'differentFrom':
      return <EqualityIcon different />;
    case 'sameAs':
      return <EqualityIcon />;
    case 'greaterThanVariable':
      return <Operator direction="greater" x={10} />;
    case 'lessThanVariable':
      return <Operator direction="less" x={10} />;
  }

  return unreachable(validation);
}

/** Custom constraint glyphs that encode the rule rather than its category. */
export function VariableValidationIcon({
  className,
  validation,
}: {
  className?: string;
  validation: ValidationName;
}) {
  return (
    <svg
      aria-hidden
      className={cx('size-5', className)}
      data-variable-pill-validation={validation}
      viewBox="0 0 20 20"
    >
      <ValidationShape validation={validation} />
    </svg>
  );
}
