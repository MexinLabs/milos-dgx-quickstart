import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cx } from "./ui";

/** Model output. Raw HTML in the text is not rendered (react-markdown's default). */
export const Markdown = memo(function Markdown({ text, streaming }: { text: string; streaming?: boolean }) {
  return (
    <div className={cx("md", streaming && "caret")}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
});

/** A thinking model's reasoning: collapsed and dimmed, apart from the answer. */
export function Reasoning({ text, open }: { text: string; open?: boolean }) {
  if (!text) return null;
  return (
    <details open={open} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-muted">
      <summary className="font-semibold">Razonamiento del modelo</summary>
      <p className="mt-2 whitespace-pre-wrap">{text}</p>
    </details>
  );
}
