/**
 * Escapes a string for safe interpolation into an HTML email template.
 * Prevents XSS when client / supplier / project names contain `<`, `>`, `"`, etc.
 */
export function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Same as escapeHtml but also collapses runs of whitespace — useful for
 * email subjects / preheaders.
 */
export function escapeHtmlInline(s) {
  return escapeHtml(s).replace(/\s+/g, ' ').trim();
}
