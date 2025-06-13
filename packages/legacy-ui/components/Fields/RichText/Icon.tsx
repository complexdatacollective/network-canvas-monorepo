import {
  BoldIcon,
  Heading1Icon as H1Icon,
  Heading2Icon as H2Icon,
  Heading3Icon as H3Icon,
  Heading4Icon as H4Icon,
  Heading5Icon as H5Icon,
  HammerIcon as HorizontalRuleIcon,
  ItalicIcon,
  ListOrderedIcon as OLIcon,
  QuoteIcon,
  RedoIcon,
  ListIcon as ULIcon,
  UndoIcon,
} from "lucide-react";

interface IconProps {
  name: string;
}

const icons: Record<string, any> = {
  bold: BoldIcon,
  italic: ItalicIcon,
  quote: QuoteIcon,
  h1: H1Icon,
  h2: H2Icon,
  h3: H3Icon,
  h4: H4Icon,
  h5: H5Icon,
  ul: ULIcon,
  ol: OLIcon,
  undo: UndoIcon,
  redo: RedoIcon,
  hr: HorizontalRuleIcon,
};

const Icon = ({ name }: IconProps) => {
  const IconComponent = icons[name];
  if (!IconComponent) {
    return <span>{name}</span>;
  }
  return <IconComponent style={{ color: "white" }} />;
};

export default Icon;