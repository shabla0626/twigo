import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Renders the small Markdown subset used by legal documents and project agreements:
 * "## " and "### " headings, "- " and "1. " lists, paragraphs, **bold** and [text](/path) links.
 * Everything else is plain text (React escapes it), so a document can never inject markup.
 * Links are allowed only to paths of this site.
 */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((\/[^)\s]*)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={`${keyBase}-b${i++}`}>{m[1]}</strong>);
    else
      out.push(
        <Link key={`${keyBase}-l${i++}`} href={m[3]!} className="font-medium text-accent-700 underline underline-offset-2">
          {m[2]}
        </Link>,
      );
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block = { kind: "h2" | "h3" | "p"; text: string } | { kind: "ul" | "ol"; items: string[] };

export function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "p", text: para.join(" ") });
    para = [];
  };
  for (const raw of source.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const h = /^(#{2,3}) (.+)$/.exec(line);
    const ul = /^- (.+)$/.exec(line);
    const ol = /^\d+\. (.+)$/.exec(line);
    if (h) {
      flush();
      blocks.push({ kind: h[1]!.length === 2 ? "h2" : "h3", text: h[2]! });
    } else if (ul || ol) {
      flush();
      const kind = ul ? "ul" : "ol";
      const prev = blocks.at(-1);
      if (prev && prev.kind === kind) prev.items.push((ul ?? ol)![1]!);
      else blocks.push({ kind, items: [(ul ?? ol)![1]!] });
    } else {
      para.push(line.trim());
    }
  }
  flush();
  return blocks;
}

export function LegalText({ source }: { source: string }) {
  return (
    <div className="prose-body">
      {parseBlocks(source).map((b, i) => {
        const k = `b${i}`;
        if (b.kind === "h2") return <h2 key={k}>{inline(b.text, k)}</h2>;
        if (b.kind === "h3") return <h3 key={k}>{inline(b.text, k)}</h3>;
        if (b.kind === "p") return <p key={k}>{inline(b.text, k)}</p>;
        if (b.kind !== "ul" && b.kind !== "ol") return null;
        const items = b.items.map((it, j) => <li key={`${k}-${j}`}>{inline(it, `${k}-${j}`)}</li>);
        return b.kind === "ul" ? <ul key={k}>{items}</ul> : <ol key={k}>{items}</ol>;
      })}
    </div>
  );
}
