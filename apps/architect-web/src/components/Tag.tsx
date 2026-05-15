import type React from 'react';

import { cn } from '~/utils/cn';

type TagProps = {
  id: string;
  children?: React.ReactNode;
  color?: string | null;
  onClick?: ((id: string) => void) | null;
  selected?: boolean;
  light?: boolean;
  disabled?: boolean;
};

const Tag = ({
  id,
  children = null,
  color = null,
  onClick = null,
  selected = false,
  light = false,
  disabled = false,
}: TagProps) => {
  const componentClasses = cn(
    'bg-foreground/15 inline-flex items-center justify-center gap-2 rounded-full border-2 border-transparent px-2 py-1 text-xs font-semibold tracking-widest text-white uppercase',
    selected && 'bg-platinum text-surface-2-foreground',
    light && 'bg-platinum text-surface-2-foreground',
    disabled && !!onClick && '',
    disabled && 'cursor-not-allowed opacity-50',
    onClick && !disabled && 'cursor-pointer',
  );

  const dotClasses = cn(
    'aspect-square h-auto w-3.75 shrink-0 rounded-full',
    color === 'neon-coral' && 'bg-neon-coral',
    color === 'sea-green' && 'bg-sea-green',
    color === 'slate-blue' && 'bg-slate-blue',
    color === 'navy-taupe' && 'bg-navy-taupe',
    color === 'cyber-grape' && 'bg-cyber-grape',
    color === 'mustard' && 'bg-mustard',
    color === 'rich-black' && 'bg-rich-black',
    color === 'charcoal' && 'bg-charcoal',
    color === 'platinum' && 'bg-platinum',
    color === 'sea-serpent' && 'bg-sea-serpent',
    color === 'purple-pizazz' && 'bg-purple-pizazz',
    color === 'paradise-pink' && 'bg-paradise-pink',
    color === 'cerulean-blue' && 'bg-cerulean-blue',
    color === 'kiwi' && 'bg-kiwi',
    color === 'neon-carrot' && 'bg-neon-carrot',
    color === 'barbie-pink' && 'bg-barbie-pink',
    color === 'tomato' && 'bg-tomato',
    color === 'white' && 'bg-white',
  );

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!disabled && onClick) {
      e.preventDefault();
      onClick(id);
    }
  };

  if (onClick) {
    return (
      <button
        type="button"
        className={componentClasses}
        onClick={handleClick}
        disabled={disabled}
      >
        <div className={dotClasses} />
        {children}
      </button>
    );
  }

  return (
    <div className={componentClasses}>
      <div className={dotClasses} />
      {children}
    </div>
  );
};

export default Tag;
