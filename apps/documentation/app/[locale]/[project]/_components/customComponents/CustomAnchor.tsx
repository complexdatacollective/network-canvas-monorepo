import Link from 'next/link';

const CustomAnchor = (props: React.JSX.IntrinsicElements['a']) => {
  return (
    <Link className="text-cyan-700" href={props.href ?? '#'}>
      {props.children}
    </Link>
  );
};

export default CustomAnchor;
