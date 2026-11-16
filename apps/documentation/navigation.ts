import { createNavigation } from 'next-intl/navigation';

import { locales } from './lib/i18n/locales';

export const { Link, usePathname, useRouter } = createNavigation({ locales });
