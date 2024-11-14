import { setRequestLocale } from "next-intl/server";
import type { Locale } from "~/app/types";
import { Hero } from "~/components/Hero";

const Page = ({ params: { locale } }: { params: { locale: Locale } }) => {
	// setting setRequestLocale to support next-intl for static rendering
	setRequestLocale(locale);

	return <Hero />;
};
export default Page;
