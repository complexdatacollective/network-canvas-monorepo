import type { AbstractIntlMessages } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { type Locale, locales } from "~/app/types";

export default getRequestConfig(async ({ requestLocale }) => {
	const locale = await requestLocale;

	// Ensure that the incoming locale is valid
	if (!locale ) {
    locale = "en";
  }


	// Validate that the incoming `locale` string exists in the locales array
	if (!locales.includes(locale as Locale)) {
		return {
			locale,
			messages: {},
		};
	}

	const messages = (await import(`~/messages/${locale}.json`)) as {
		default: AbstractIntlMessages;
	};

	return {
		locale,
		timeZone: "Europe/London",
		messages,
	};
});
