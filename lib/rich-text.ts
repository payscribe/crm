const allowedTags = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "h2",
  "h3",
  "ul",
  "ol",
  "li"
]);

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function sanitizeRichTextHtml(value: string) {
  const withoutExecutableContent = value
    .replace(/<!--([\s\S]*?)-->/g, "")
    .replace(/<(script|style|iframe|object|embed|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  const tokens = withoutExecutableContent.match(/<[^>]*>|[^<]+/g) ?? [];

  return tokens
    .map((token) => {
      if (!token.startsWith("<")) {
        return escapeHtml(token);
      }

      const match = token.match(/^<\s*(\/?)\s*([a-z0-9]+)\b[^>]*>$/i);
      if (!match) return "";

      const closing = match[1] === "/";
      const tag = match[2].toLowerCase();
      if (!allowedTags.has(tag)) return "";
      if (tag === "br") return closing ? "" : "<br>";
      return closing ? `</${tag}>` : `<${tag}>`;
    })
    .join("")
    .trim();
}

export function richTextPlainText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/h[23]>|<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
