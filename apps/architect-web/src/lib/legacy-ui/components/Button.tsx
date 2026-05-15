import React, { forwardRef } from 'react';

import { cn } from '~/utils/cn';

import Icon from './Icon';

const renderButtonIcon = ({ icon }: { icon?: string | React.ReactElement }) => {
  let iconElement = null;
  if (icon) {
    if (typeof icon === 'string') {
      iconElement = <Icon name={icon} />;
    } else {
      iconElement = React.cloneElement(icon);
    }
  }
  return iconElement;
};

type ButtonColor =
  | 'sea-green'
  | 'neon-coral'
  | 'slate-blue'
  | 'navy-taupe'
  | 'cyber-grape'
  | 'mustard'
  | 'rich-black'
  | 'charcoal'
  | 'platinum'
  | 'platinum-dark'
  | 'sea-serpent'
  | 'purple-pizazz'
  | 'paradise-pink'
  | 'cerulean-blue'
  | 'kiwi'
  | 'neon-carrot'
  | 'barbie-pink'
  | 'tomato'
  | 'white';

type ButtonSize = 'small' | 'large';

type ButtonVariant = 'filled' | 'text';

type ComputeClassesArgs = {
  color?: ButtonColor;
  size?: ButtonSize;
  variant?: ButtonVariant;
  icon?: string | React.ReactElement;
  iconPosition?: 'left' | 'right';
};

const computeButtonClasses = ({
  color = 'platinum',
  size,
  variant = 'filled',
  icon,
  iconPosition = 'left',
}: ComputeClassesArgs) =>
  cn(
    'inline-flex w-auto shrink-0 grow-0 items-center justify-center gap-2',
    // focus state
    'transition-color duration-200 ease-in-out',
    'cursor-pointer',
    'rounded-full',
    'h-10 px-6 py-2',
    'text-sm font-medium tracking-wide',
    // Handle image size
    '[&>svg]:h-full',
    // Disabled states
    'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
    // sizes
    size === 'small' && 'h-8 px-4 text-xs',
    size === 'large' && 'h-12 px-8 text-base',
    // colors
    'bg-platinum border-border hover:bg-platinum-dark border',
    color === 'neon-coral' &&
      'bg-neon-coral border-neon-coral-dark hover:bg-neon-coral-dark text-white',
    color === 'sea-green' &&
      'bg-sea-green border-sea-green-dark hover:bg-sea-green-dark text-white',
    color === 'slate-blue' &&
      'bg-slate-blue border-slate-blue-dark hover:bg-slate-blue-dark text-white',
    color === 'navy-taupe' &&
      'bg-navy-taupe border-navy-taupe-dark hover:bg-navy-taupe-dark text-white',
    color === 'cyber-grape' &&
      'bg-cyber-grape border-cyber-grape-dark hover:bg-cyber-grape-dark text-white',
    color === 'mustard' &&
      'bg-mustard border-mustard-dark hover:bg-mustard-dark text-white',
    color === 'rich-black' &&
      'bg-rich-black border-rich-black-dark hover:bg-rich-black-dark text-white',
    color === 'charcoal' &&
      'bg-charcoal border-charcoal-dark hover:bg-charcoal-dark text-white',
    color === 'platinum' &&
      'bg-platinum border-platinum-dark text-charcoal hover:bg-platinum-dark',
    color === 'platinum-dark' &&
      'bg-platinum-dark border-platinum-dark text-charcoal hover:bg-platinum',
    color === 'sea-serpent' &&
      'bg-sea-serpent border-sea-serpent-dark hover:bg-sea-serpent-dark text-white',
    color === 'purple-pizazz' &&
      'bg-purple-pizazz border-purple-pizazz-dark hover:bg-purple-pizazz-dark text-white',
    color === 'paradise-pink' &&
      'bg-paradise-pink border-paradise-pink-dark hover:bg-paradise-pink-dark text-white',
    color === 'cerulean-blue' &&
      'bg-cerulean-blue border-cerulean-blue-dark hover:bg-cerulean-blue-dark text-white',
    color === 'kiwi' &&
      'bg-kiwi border-kiwi-dark hover:bg-kiwi-dark text-white',
    color === 'neon-carrot' &&
      'bg-neon-carrot border-neon-carrot-dark hover:bg-neon-carrot-dark text-white',
    color === 'barbie-pink' &&
      'bg-barbie-pink border-barbie-pink-dark hover:bg-barbie-pink-dark text-white',
    color === 'tomato' &&
      'bg-tomato border-tomato-dark hover:bg-tomato-dark text-white',
    color === 'white' &&
      'border-platinum-dark text-charcoal hover:bg-platinum bg-white',
    // variant overrides — must come after color block so conflicting utilities win
    variant === 'text' &&
      'hover:bg-foreground/10 border-transparent bg-transparent text-current',
    // Icon position
    icon && iconPosition === 'left' && 'flex-row',
    icon && iconPosition === 'right' && 'flex-row-reverse',
  );

type ButtonProps = {
  content?: string | React.ReactElement;
  icon?: string | React.ReactElement;
  iconPosition?: 'left' | 'right';
  size?: ButtonSize;
  color?: ButtonColor;
  variant?: ButtonVariant;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      color = 'platinum',
      size,
      variant,
      children,
      content = '',
      onClick = () => {},
      icon = '',
      type = 'button',
      iconPosition = 'left',
      disabled = false,
      className,
      ...rest
    },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        computeButtonClasses({ color, size, variant, icon, iconPosition }),
        className,
      )}
      onClick={onClick}
      disabled={disabled}
      {...rest}
    >
      {renderButtonIcon({ icon })}
      {content || children}
    </button>
  ),
);

Button.displayName = 'Button';

type IconButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> & {
  'icon': React.ReactElement;
  'aria-label': string;
  'color'?: ButtonColor;
  'size'?: ButtonSize;
  'variant'?: ButtonVariant;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    { icon, color, size, variant, className, type = 'button', ...rest },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        computeButtonClasses({ color, size, variant }),
        'aspect-square rounded-full p-0',
        size === 'small'
          ? 'h-8 w-8'
          : size === 'large'
            ? 'h-12 w-12'
            : 'h-10 w-10',
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  ),
);

IconButton.displayName = 'IconButton';

export default Button;
