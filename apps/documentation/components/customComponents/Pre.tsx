import CodeCopyButton from './CodeCopyButton';

type PreProps = React.HTMLAttributes<HTMLPreElement> & {
  children: React.ReactNode;
  raw?: string;
};

const Pre = ({ raw, children, ...props }: PreProps) => {
  return (
    <pre className="relative my-5 overflow-hidden rounded-xl" {...props}>
      {children}
      {raw && <CodeCopyButton code={raw} />}
    </pre>
  );
};

export default Pre;
