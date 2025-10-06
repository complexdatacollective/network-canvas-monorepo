import { createNavigation } from "next-intl/navigation";
import { locales } from "./app/types";

export const { Link, usePathname, useRouter } = createNavigation({ locales });
