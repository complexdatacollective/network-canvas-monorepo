import { locales } from '@/locales.mjs';
import data from '@/public/sidebar.json';
import { SidebarData, type Folder } from '@/types';

const sidebarData: SidebarData = JSON.parse(
  JSON.stringify(data),
) as SidebarData;

// Converts text to URL eg: Network Canvas => network-canvas
export function convertToUrlText(text: string): string {
  const lowercaseText = text.toLowerCase();
  const hyphenatedText = lowercaseText.replace(/\s+/g, '-');
  const cleanedText = hyphenatedText.replace(/[^a-z0-9-\u0400-\u04FF]/g, '');

  return cleanedText;
}

export const getLocaleBasedSidebarData = (
  data: SidebarData,
  locale: string,
) => {
  return data.filter((item) => item[locale])[0][locale];
};

// filter sidebar data based on product and locale
export function filterSidebarData(
  product: string,
  sidebarData: SidebarData,
  locale: string,
) {
  const localeBasedSidebarData = getLocaleBasedSidebarData(sidebarData, locale);

  const productBasedSidebarData = localeBasedSidebarData.filter(
    (item) => item.name === product,
  )[0];

  return productBasedSidebarData;
}

// Check if the file path for the translated doc exists in sidebar.json
export function isPathExist(data: Folder, docPath: string, isExist = false) {
  for (const item of data.files) {
    if (item.type === 'file') {
      isExist = docPath === item.path;
    } else {
      isExist = docPath === item.folderPagePath;
      if (!isExist) {
        isExist = isPathExist(item, docPath, isExist);
      }
    }

    if (isExist) break;
  }

  return isExist;
}

// get available locales for the document
export function getAvailableLocales(filePath: string) {
  const availableLocales = locales.filter((locale) => {
    const localeBasedSidebarData = getLocaleBasedSidebarData(
      sidebarData,
      locale,
    );
    let result;

    for (const folder of localeBasedSidebarData) {
      result = isPathExist(folder, filePath);
      if (result) break;
    }

    return result;
  });

  return availableLocales;
}
