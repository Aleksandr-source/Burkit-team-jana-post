// A readable representation of the same authenticated source returned as JSON.
const escape = (value) => String(value).replace(/[&<>"']/g,
  character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

export const knowledgeCSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";

export function renderKnowledgeSource(source, lang) {
  return `<!doctype html><html lang="${escape(lang)}"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(source.title)} · JanaMen</title>
<style>body{font:18px/1.65 system-ui,sans-serif;max-width:780px;margin:48px auto;padding:0 24px;color:#202938;background:#fafbff}h1{line-height:1.25}article{white-space:pre-wrap}footer{margin-top:32px;border-top:1px solid #ccd3e0;padding-top:16px;font-size:14px;overflow-wrap:anywhere}</style>
<main><p>JanaMen · ${escape(source.version)}</p><h1>${escape(source.title)}</h1>
<p>${escape(source.origin)}</p><article>${escape(source.excerpt)}</article>
<footer>ID: ${escape(source.id)}<br>SHA-256: ${escape(source.sha256)}</footer></main></html>`;
}
