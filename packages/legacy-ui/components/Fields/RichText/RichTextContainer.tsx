import { ReactNode } from "react";
import cx from "classnames";
import { useFocused } from "slate-react";

interface RichTextContainerProps {
  children: ReactNode;
}

const RichTextContainer = ({ children }: RichTextContainerProps) => {
  const focused = useFocused();

  return <div className={cx("rich-text", { "rich-text--is-active": focused })}>{children}</div>;
};

export default RichTextContainer;