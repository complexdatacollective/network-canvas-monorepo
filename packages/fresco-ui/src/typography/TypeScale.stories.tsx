import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';

import Heading from './Heading';
import Paragraph from './Paragraph';

const TypeScaleDemo = () => (
  <div className="p-8">
    <h2 className="text-xl">Type Scale System</h2>
    <p className="text-sm">
      This type scale uses a fluid system that changes the scale ratio based on
      viewport size. Resize your browser to see the changes. Mobile uses a Minor
      Third (1.2) scale, while desktop uses a Perfect Fourth (1.333) scale for
      better readability.
    </p>
    <h3 className="mt-4 text-lg">Dynamic Properties</h3>
    <p className="mt-2 text-sm">
      Each text size includes automatically calculated properties that adjust
      with viewport size:
    </p>

    <ul className="mt-4 list-inside list-disc text-sm">
      <li>
        <strong>Font Size:</strong> Scales using the viewport-specific ratio
      </li>
      <li>
        <strong>Line Height:</strong> Decreases for larger text, increases for
        smaller text
      </li>
      <li>
        <strong>Letter Spacing:</strong> Tighter tracking for larger text,
        looser for smaller text
      </li>
      <li>
        <strong>Font Weight:</strong> Switches to display weight (700) at
        text-2xl and above
      </li>
    </ul>

    <hr className="my-6" />
    <section className="mt-8">
      <div>
        <div className="text-xs">text-xs</div>
        <div className="text-xs">
          The quick brown fox jumps over the lazy dog
        </div>
      </div>

      <div className="mt-6">
        <div className="text-xs">text-sm</div>
        <div className="text-sm">
          The quick brown fox jumps over the lazy dog
        </div>
      </div>

      <div className="mt-6">
        <div className="text-xs">text-base (default)</div>
        <div className="text-base">
          The quick brown fox jumps over the lazy dog
        </div>
      </div>

      <div className="mt-6">
        <div className="text-xs">text-lg</div>
        <div className="text-lg">
          The quick brown fox jumps over the lazy dog
        </div>
      </div>

      <div className="mt-6">
        <div className="text-xs">text-xl</div>
        <div className="text-xl">
          The quick brown fox jumps over the lazy dog
        </div>
      </div>

      <div className="mt-6">
        <div className="text-xs">text-2xl</div>
        <div className="text-2xl">
          The quick brown fox jumps over the lazy dog
        </div>
      </div>

      <div className="mt-6">
        <div className="text-xs">text-3xl</div>
        <div className="text-3xl">
          The quick brown fox jumps over the lazy dog
        </div>
      </div>

      <div className="mt-6">
        <div className="text-xs">text-4xl</div>
        <div className="text-4xl">
          The quick brown fox jumps over the lazy dog
        </div>
      </div>
    </section>
  </div>
);

const meta = {
  title: 'Design System/Typography/Type Scale',
  component: TypeScaleDemo,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A fluid type scale system that adapts to viewport size. The scale uses different ratios and line heights for optimal readability across devices.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof TypeScaleDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => <TypeScaleDemo />,
};

export const TypicalPageLayout: Story = {
  render: () => (
    <div className="mx-auto max-w-4xl p-8">
      <div className="bg-info/10 -mx-8 mb-8 rounded-lg p-8 text-sm">
        Example: This demonstrates a typical content page using all heading
        levels in a hierarchical structure. Notice how each level creates clear
        visual distinction while maintaining harmony.
      </div>

      {/* Page Title - 4xl */}
      <Heading level="h1" variant="page-heading">
        Building Scalable Design Systems
      </Heading>
      <Paragraph intent="lead">
        A comprehensive guide to creating flexible, maintainable design systems
        that scale across teams and products. Learn the principles, patterns,
        and practices that enable teams to build consistent user experiences at
        scale.
      </Paragraph>

      <Heading level="h1">The Importance of a Type System</Heading>
      <Paragraph>
        A well-designed type system is the foundation of any successful design
        system. It establishes visual hierarchy, improves readability, and
        ensures consistency across all touchpoints. By using a mathematical
        scale, we can create harmonious relationships between different text
        sizes that feel natural and balanced.
      </Paragraph>
      <Paragraph>
        Typography does more than just make text readable—it conveys brand
        personality, guides user attention, and creates rhythm throughout the
        interface. When implemented thoughtfully, a type system becomes an
        invisible framework that makes content easier to scan, understand, and
        remember.
      </Paragraph>

      <Heading level="h2">Understanding Modular Scales</Heading>
      <Paragraph>
        Modular scales use a consistent ratio to generate font sizes, creating
        predictable and pleasing proportions throughout your interface. This
        project uses different scales based on viewport size to optimize
        readability across devices—from mobile phones to large desktop displays.
      </Paragraph>

      <Heading level="h3">The Minor Third Scale (Mobile)</Heading>
      <Paragraph>
        On mobile devices, we use a Minor Third (1.2) scale ratio. This creates
        subtle size differences that work well in constrained spaces where
        dramatic scaling could overwhelm the layout and make content harder to
        scan.
      </Paragraph>

      <Heading level="h4">Why 1.2 for Mobile?</Heading>
      <Paragraph>
        The 1.2 ratio strikes a perfect balance for small screens. It creates
        enough distinction between heading levels to establish clear hierarchy,
        while keeping the overall vertical rhythm tight enough to maximize
        content visibility without excessive scrolling.
      </Paragraph>

      <Heading level="h4">Mobile Reading Patterns</Heading>
      <Paragraph>
        Mobile users typically hold their devices 12-16 inches from their eyes
        and scan content quickly. The tighter scale ensures headings don&apos;t
        dominate the viewport, while still providing enough contrast to guide
        the eye through the content hierarchy.
      </Paragraph>

      <Heading level="h3">The Perfect Fourth Scale (Desktop)</Heading>
      <Paragraph>
        On larger screens (≥1280px), we switch to a Perfect Fourth (1.333)
        scale. This creates more pronounced size differences that help establish
        clear hierarchy when viewing from a distance and take advantage of the
        additional screen real estate.
      </Paragraph>

      <Heading level="h4">Why 1.333 for Desktop?</Heading>
      <Paragraph>
        The Perfect Fourth ratio creates dramatic size jumps between levels,
        which works beautifully on large displays. Users sit further from
        desktop screens (20-30 inches) and benefit from stronger visual
        hierarchy that makes section breaks and content structure immediately
        apparent.
      </Paragraph>

      <Heading level="h4">Desktop Reading Comfort</Heading>
      <Paragraph>
        Larger screens afford more generous spacing and bigger type. The 1.333
        scale creates a luxurious reading experience with clear distinction
        between content levels, reducing cognitive load and making long-form
        content more approachable.
      </Paragraph>

      <Heading level="h2">Responsive Typography Benefits</Heading>
      <Paragraph>
        Responsive type systems adapt not just size, but also line height,
        letter spacing, and even font weight to create optimal reading
        experiences across devices. This holistic approach ensures that text
        remains comfortable to read regardless of screen size or viewing
        distance.
      </Paragraph>

      <Heading level="h3">Improved Readability</Heading>
      <Paragraph>
        By adjusting line height and letter spacing based on viewport size, text
        remains comfortable to read whether on a small phone screen or a large
        desktop monitor. The system automatically compensates for different
        viewing distances and screen densities.
      </Paragraph>

      <Heading level="h4">Line Height Optimization</Heading>
      <Paragraph>
        Line height decreases as text gets larger, preventing awkward gaps
        between lines in headings while maintaining comfortable spacing in body
        text. This creates better visual cohesion and makes content feel more
        polished and professional.
      </Paragraph>

      <Heading level="h4">Letter Spacing Adjustments</Heading>
      <Paragraph>
        Larger text uses tighter tracking to prevent letters from feeling too
        spread out, while smaller text gets slightly looser tracking to improve
        legibility. These subtle adjustments happen automatically as the
        viewport changes.
      </Paragraph>

      <Heading level="h3">Visual Hierarchy</Heading>
      <Paragraph>
        The varying scale ratios ensure that headings stand out appropriately at
        every screen size, maintaining clear information architecture. Users can
        quickly scan the page to find relevant sections, improving the overall
        user experience and reducing time to task completion.
      </Paragraph>

      <Heading level="h3">Developer Experience</Heading>
      <Paragraph>
        Using CSS custom properties and Tailwind utilities makes it simple for
        developers to implement consistent typography without manual
        calculations. The system handles all the complexity behind the scenes,
        allowing developers to focus on content and functionality rather than
        fine-tuning font sizes and spacing values.
      </Paragraph>

      <Heading level="h4">Simple Implementation</Heading>
      <Paragraph>
        Just use standard Tailwind text utilities like text-xl or text-2xl, and
        the type system automatically applies appropriate font size, line
        height, letter spacing, and font weight for the current viewport. No
        media queries or custom CSS required.
      </Paragraph>

      <Heading level="h4">Consistent Results</Heading>
      <Paragraph>
        Every instance of text-2xl will look identical across the application,
        ensuring visual consistency without the need for design reviews or style
        guides. The system becomes a single source of truth for typography.
      </Paragraph>
    </div>
  ),
};

export const LineHeightDemo: Story = {
  render: () => (
    <div className="mx-auto max-w-4xl p-8">
      <h2 className="mb-4 text-xl">Line Height Visualization</h2>
      <p className="mb-8">
        This demonstrates how line height adapts for each text size. Notice how
        larger text has tighter line spacing while smaller text has more
        generous spacing for readability.
      </p>

      <div className="space-y-8">
        <div>
          <div className="mb-2 text-xs font-semibold">text-xs</div>
          <div className="text-xs">
            Typography is the art and technique of arranging type to make
            written language legible, readable and appealing when displayed. The
            arrangement of type involves selecting typefaces, point sizes, line
            lengths, line-spacing, and letter-spacing, and adjusting the space
            between pairs of letters.
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold">text-sm</div>
          <div className="text-sm">
            Typography is the art and technique of arranging type to make
            written language legible, readable and appealing when displayed. The
            arrangement of type involves selecting typefaces, point sizes, line
            lengths, line-spacing, and adjusting the space between pairs of
            letters.
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold">text-base</div>
          <div className="text-base">
            Typography is the art and technique of arranging type to make
            written language legible, readable and appealing when displayed. The
            arrangement of type involves selecting typefaces, point sizes, line
            lengths, line-spacing, and adjusting the space between pairs of
            letters.
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold">text-lg</div>
          <div className="text-lg">
            Typography is the art and technique of arranging type to make
            written language legible, readable and appealing when displayed. The
            arrangement of type involves selecting typefaces, point sizes, line
            lengths, line-spacing, and adjusting the space between pairs of
            letters.
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold">text-xl</div>
          <div className="text-xl">
            Typography is the art and technique of arranging type to make
            written language legible, readable and appealing when displayed. The
            arrangement of type involves selecting typefaces, point sizes, line
            lengths, line-spacing, and adjusting the space between pairs of
            letters.
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold">text-2xl</div>
          <div className="text-2xl">
            Typography is the art and technique of arranging type to make
            written language legible, readable and appealing when displayed. The
            arrangement of type involves selecting typefaces, point sizes, line
            lengths, line-spacing, and adjusting the space between pairs of
            letters.
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold">text-3xl</div>
          <div className="text-3xl">
            Typography is the art and technique of arranging type to make
            written language legible, readable and appealing when displayed. The
            arrangement of type involves selecting typefaces, point sizes, line
            lengths, line-spacing, and adjusting the space between pairs of
            letters.
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold">text-4xl</div>
          <div className="text-4xl">
            Typography is the art and technique of arranging type to make
            written language legible, readable and appealing when displayed. The
            arrangement of type involves selecting typefaces, point sizes, line
            lengths, line-spacing, and adjusting the space between pairs of
            letters.
          </div>
        </div>
      </div>
    </div>
  ),
};

/**
 * Text marked as Arabic (`lang="ar"`) is set in Readex Pro, which follows the
 * Latin face in the heading and the body stack. Text in another language that
 * uses the Arabic script, such as Persian, is left to a system font: Readex
 * Pro lacks its extra letters. The samples are Article 1 of the Universal
 * Declaration of Human Rights in the United Nations' Arabic, English and
 * Persian texts.
 */
export const ArabicScript: Story = {
  render: () => (
    <div className="mx-auto grid max-w-4xl gap-12 p-8">
      <section lang="ar" dir="rtl">
        <Heading level="h1" variant="page-heading">
          الإعلان العالمي لحقوق الإنسان
        </Heading>
        <Paragraph intent="lead">
          يولد جميع الناس أحرارًا متساوين في الكرامة والحقوق.
        </Paragraph>
        <Heading level="h2">المادة 1</Heading>
        <Paragraph>
          <strong>يولد جميع الناس أحرارًا متساوين في الكرامة والحقوق.</strong>{' '}
          وقد وهبوا عقلًا وضميرًا وعليهم أن يعامل بعضهم بعضًا بروح الإخاء.
        </Paragraph>
        <Paragraph>
          العربية ·{' '}
          <span lang="fa" data-testid="persian-in-arabic">
            فارسی
          </span>
        </Paragraph>
      </section>
      <section lang="en" dir="ltr">
        <Heading level="h1" variant="page-heading">
          Universal Declaration of Human Rights
        </Heading>
        <Paragraph intent="lead">
          All human beings are born free and equal in dignity and rights.
        </Paragraph>
        <Heading level="h2">
          Arabic (
          <span lang="ar" dir="rtl" data-testid="arabic-in-heading">
            العربية
          </span>
          )
        </Heading>
        <Paragraph>
          An Arabic phrase inside English text takes Readex Pro where it is
          marked:{' '}
          <span lang="ar" dir="rtl" data-testid="arabic-in-paragraph">
            المادة 1
          </span>
          .
        </Paragraph>
      </section>
      <section lang="fa" dir="rtl" data-testid="persian">
        <Heading level="h2">فارسی</Heading>
        <Paragraph>
          تمام افراد بشر آزاد به دنیا می‌آیند و از لحاظ حیثیت و حقوق با هم
          برابرند.
        </Paragraph>
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const stack = (element: Element) =>
      getComputedStyle(element)
        .fontFamily.split(',')
        .map((family) => family.trim().replaceAll(/['"]/g, ''));

    // Arabic text: the Latin face of its role, then Readex Pro.
    await expect(
      stack(canvas.getByRole('heading', { name: 'المادة 1' })),
    ).toEqual(['Nunito Variable', 'Readex Pro Variable', 'sans-serif']);
    await expect(
      stack(canvas.getByText(/وقد وهبوا عقلًا/).closest('p') ?? canvasElement),
    ).toEqual(['Inclusive Sans Variable', 'Readex Pro Variable', 'sans-serif']);

    // Arabic marked inside English text takes the stack of the text around it.
    await expect(stack(canvas.getByTestId('arabic-in-heading'))).toEqual([
      'Nunito Variable',
      'Readex Pro Variable',
      'sans-serif',
    ]);
    await expect(stack(canvas.getByTestId('arabic-in-paragraph'))).toEqual([
      'Inclusive Sans Variable',
      'Readex Pro Variable',
      'sans-serif',
    ]);

    // English and Persian are never offered Readex Pro, inside Arabic text
    // or outside it.
    await expect(
      stack(canvas.getByRole('heading', { name: /^Universal Declaration/ })),
    ).toEqual(['Nunito Variable', 'sans-serif']);
    await expect(stack(canvas.getByTestId('persian-in-arabic'))).toEqual([
      'Inclusive Sans Variable',
      'sans-serif',
    ]);
    const persian = canvas.getByTestId('persian');
    for (const element of persian.querySelectorAll('h2, p')) {
      await expect(stack(element)).not.toContain('Readex Pro Variable');
    }

    // A face limited by unicode-range is fetched only when rendered text
    // reaches it, so a loaded face means the Arabic text resolved to it.
    await waitFor(() =>
      expect(
        [...document.fonts].find(
          (face) =>
            face.family.replaceAll(/['"]/g, '') === 'Readex Pro Variable',
        )?.status,
      ).toBe('loaded'),
    );
  },
};
