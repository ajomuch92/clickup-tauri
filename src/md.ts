// Minimal renderer for the inline markdown ClickUp chat actually uses. Escapes first; only these patterns produce tags.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const url = (u: string) => (/^https?:\/\//i.test(u) ? u : "");

export function md(src: string): string {
  return esc(src)
    .replace(/\\([\\`*_~\[\]()#!<>-])/g, (_, c) => `&#${c.charCodeAt(0)};`) // markdown escapes: literal char, invisible to the rules below
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, u) =>
      url(u) ? `<img class="${/^:.*:$/.test(alt) ? "emo" : "img"}" src="${u}" alt="${alt}" title="${alt}">` : alt)
    .replace(/\[@([^\]]+)\]\(#[^)]*\)/g, '<span class="mention">@$1</span>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => (url(u) ? `<a href="${u}" target="_blank">${t}</a>` : m))
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^\w*])[*_](?!\s)(.+?)(?<!\s)[*_](?![\w*])/g, "$1<i>$2</i>")
    .replace(/~~(.+?)~~/g, "<s>$1</s>")
    .replace(/&lt;u&gt;(.+?)&lt;\/u&gt;/g, "<u>$1</u>");
}
