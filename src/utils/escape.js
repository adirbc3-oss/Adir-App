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

/**
 * Strips the "CODIGO::" prefix from BC3 texto_partida strings and cleans pipe
 * characters. Used consistently across Portal, Comparativa and PresupuestoCliente.
 */
export function cleanText(text) {
  if (!text) return '';
  const str = text.includes('::') ? text.split('::').slice(1).join('::') : text;
  return str.replace(/\|/g, ' ').replace(/\s{2,}/g, ' ').trim();
}
