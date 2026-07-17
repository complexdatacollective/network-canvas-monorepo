'use client';

import { useState } from 'react';

import SegmentedSwitcher, {
  type SegmentedOption,
} from '@codaco/fresco-ui/SegmentedSwitcher';

import Pre from './Pre';

type Language = 'r' | 'python';

const LANGUAGE_OPTIONS: SegmentedOption<Language>[] = [
  { value: 'r', label: 'R' },
  { value: 'python', label: 'Python' },
];

const EXAMPLES: Record<Language, string> = {
  r: `boundary_tolerance <- 0.02

alters |>
  dplyr::mutate(
    context = dplyr::case_when(
      is.na(box_layout_x) | is.na(box_layout_y) ~ NA_character_,
      abs(box_layout_x - 0.5) <= boundary_tolerance |
        abs(box_layout_y - 0.5) <= boundary_tolerance ~ "Boundary",
      box_layout_x < 0.5 & box_layout_y < 0.5 ~ "Family",
      box_layout_x > 0.5 & box_layout_y < 0.5 ~ "Friends",
      box_layout_x < 0.5 & box_layout_y > 0.5 ~ "Work or study",
      box_layout_x > 0.5 & box_layout_y > 0.5 ~ "Community"
    )
  )`,
  python: `import pandas as pd

boundary_tolerance = 0.02

def classify_context(row):
    x = row["box_layout_x"]
    y = row["box_layout_y"]

    if pd.isna(x) or pd.isna(y):
        return pd.NA
    if (
        abs(x - 0.5) <= boundary_tolerance
        or abs(y - 0.5) <= boundary_tolerance
    ):
        return "Boundary"
    if x < 0.5 and y < 0.5:
        return "Family"
    if x > 0.5 and y < 0.5:
        return "Friends"
    if x < 0.5 and y > 0.5:
        return "Work or study"
    return "Community"

alters["context"] = alters.apply(classify_context, axis=1)`,
};

const LANGUAGE_NAMES: Record<Language, string> = {
  r: 'R',
  python: 'Python',
};

const CoordinateClassificationExample = () => {
  const [language, setLanguage] = useState<Language>('r');
  const code = EXAMPLES[language];
  const languageName = LANGUAGE_NAMES[language];

  return (
    <div className="my-5">
      <SegmentedSwitcher
        aria-label="Select example code language"
        options={LANGUAGE_OPTIONS}
        value={language}
        onValueChange={setLanguage}
        size="sm"
      />
      <div
        className="[&>div]:mb-0"
        role="region"
        aria-label={`${languageName} coordinate classification example`}
      >
        <Pre raw={code}>
          <code className={`language-${language}`}>{code}</code>
        </Pre>
      </div>
      <span className="sr-only" aria-live="polite">
        Showing the {languageName} example.
      </span>
    </div>
  );
};

export default CoordinateClassificationExample;
