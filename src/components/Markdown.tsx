import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Model replies are markdown; styles live under .markdown in globals.css.
export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
