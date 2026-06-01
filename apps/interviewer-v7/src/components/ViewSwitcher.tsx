import { Database, Layers } from 'lucide-react';
import { motion } from 'motion/react';
import { Link, useLocation } from 'wouter';

const SEGMENTS = [
  { view: 'protocols', label: 'Protocols', href: '/', Icon: Layers },
  { view: 'data', label: 'Data', href: '/data', Icon: Database },
] as const;

type View = (typeof SEGMENTS)[number]['view'];

const CONTAINER_CLASS =
  'border border-outline bg-surface/50 backdrop-blur-md effect-shadow-md inline-flex items-center rounded-full p-1';
const SEGMENT_CLASS =
  'relative inline-flex items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-black uppercase tracking-wide transition-colors';

function activeView(location: string): View {
  return location === '/data' ? 'data' : 'protocols';
}

const variants = {
  hidden: { opacity: 0, y: -6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55 } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.55 } },
};

export function ViewSwitcher() {
  const [location] = useLocation();
  const active = activeView(location);

  return (
    <motion.div
      variants={variants}
      className={CONTAINER_CLASS}
      role="tablist"
      aria-label="Home view"
    >
      {SEGMENTS.map(({ view, label, href, Icon }) => {
        const isActive = active === view;
        return (
          <Link
            key={view}
            href={href}
            role="tab"
            aria-selected={isActive}
            className={`${SEGMENT_CLASS} ${
              isActive ? 'text-primary-contrast' : 'text-text/80'
            }`}
          >
            {isActive ? (
              <motion.span
                layoutId="view-switcher-indicator"
                aria-hidden
                className="bg-sea-green absolute inset-0 rounded-full"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            ) : null}
            <Icon size={18} className="relative stroke-[3px]" aria-hidden />
            <span className="relative">{label}</span>
          </Link>
        );
      })}
    </motion.div>
  );
}
