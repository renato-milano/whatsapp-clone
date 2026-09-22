// A quoted message must describe itself even when it carries no text: a photo,
// a voice message or a document has an empty body and would otherwise be shown
// with the caption of whatever fallback comes first.
export function previewText(row: {
  body?: string | null;
  musicTitle?: string | null;
  attachmentMime?: string | null;
  attachmentFilename?: string | null;
}) {
  if (row.body?.trim()) return row.body;
  if (row.musicTitle) return row.musicTitle;
  if (row.attachmentMime?.startsWith("image/")) return "Foto";
  if (row.attachmentMime?.startsWith("video/")) return "Video";
  if (row.attachmentMime?.startsWith("audio/")) return "Messaggio vocale";
  if (row.attachmentFilename) return `📎 ${row.attachmentFilename}`;
  return "Messaggio";
}
