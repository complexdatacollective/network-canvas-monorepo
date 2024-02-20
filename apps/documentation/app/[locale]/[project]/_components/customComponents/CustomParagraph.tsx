import { type DetailedHTMLProps, type HTMLAttributes } from 'react';

type CustomParagraphProps = DetailedHTMLProps<
  HTMLAttributes<HTMLParagraphElement>,
  HTMLParagraphElement
>;

const CustomParagraph = (props: CustomParagraphProps) => (
  <p style={{ margin: 0, padding: 0 }}>{props.children}</p>
);

export default CustomParagraph;
