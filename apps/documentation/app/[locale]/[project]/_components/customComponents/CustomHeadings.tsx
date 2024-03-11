import { type DetailedHTMLProps, type HTMLAttributes } from 'react';
import { Link2 } from 'lucide-react';

import { Heading } from '@codaco/ui';

import HeaderLink from './HeaderLink';

type HeadingProps = DetailedHTMLProps<
  HTMLAttributes<HTMLHeadingElement>,
  HTMLHeadingElement
>;

// TEMPORARY custom styled heading components
export const styledHeadings = {
  h1: (props: HeadingProps) => (
    <Heading variant="h1" id={props.id}>
      {props.id ? (
        <HeaderLink id={props.id}>
          {props.children}
          <div className="hidden group-hover:block">
            <Link2 />
          </div>
        </HeaderLink>
      ) : (
        props.children
      )}
    </Heading>
  ),
  h2: (props: HeadingProps) => (
    <Heading variant="h2" id={props.id}>
      {props.id ? (
        <HeaderLink id={props.id}>
          {props.children}
          <div className="hidden group-hover:block">
            <Link2 />
          </div>
        </HeaderLink>
      ) : (
        props.children
      )}
    </Heading>
  ),
  h3: (props: HeadingProps) => (
    <Heading variant="h3" id={props.id}>
      {props.id ? (
        <HeaderLink id={props.id}>
          {props.children}
          <div className="hidden group-hover:block">
            <Link2 />
          </div>
        </HeaderLink>
      ) : (
        props.children
      )}
    </Heading>
  ),
  h4: (props: HeadingProps) => (
    <Heading variant="h4" id={props.id}>
      {props.id ? (
        <HeaderLink id={props.id}>
          {props.children}
          <div className="hidden group-hover:block">
            <Link2 />
          </div>
        </HeaderLink>
      ) : (
        props.children
      )}
    </Heading>
  ),
  h5: (props: HeadingProps) => (
    <Heading variant="h4-all-caps" id={props.id}>
      {props.id ? (
        <HeaderLink id={props.id}>
          {props.children}
          <div className="hidden group-hover:block">
            <Link2 />
          </div>
        </HeaderLink>
      ) : (
        props.children
      )}
    </Heading>
  ),
};
