import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';

export const options = {
  mdxOptions: {
    remarkPlugins: [remarkGfm], // Stuck on version 3.0.1 see: https://github.com/hashicorp/next-mdx-remote/issues/403
    rehypePlugins: [rehypeSlug],
  },
};
