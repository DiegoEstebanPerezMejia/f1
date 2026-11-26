// Utilidades compartidas por todas las páginas
async function api(path, options = {}) {
  const opts = { credentials: 'same-origin', ...options };
  if (opts.body && !(opts.body instanceof FormData)) {
    opts.headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || 'Error de servidor');
    err.status = res.status;
    throw err;
  }
  return data;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function money(v) {
  return v === null || v === undefined ? '—' : '$' + Number(v).toLocaleString('es-MX', { maximumFractionDigits: 0 });
}

function showMsg(el, text, ok = false) {
  el.className = 'msg ' + (ok ? 'okm' : 'err');
  el.textContent = text;
  el.hidden = !text;
}

async function requireSession(roleNeeded) {
  try {
    const me = await api('/api/me');
    if (roleNeeded && me.role !== roleNeeded) {
      location.href = me.role === 'admin' ? '/admin.html' : '/app.html';
      return null;
    }
    return me;
  } catch {
    location.href = '/login.html';
    return null;
  }
}

async function logout() {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  location.href = '/login.html';
}

// Renderizado mínimo de Markdown (seguro: escapa primero el HTML)
function renderMarkdown(md) {
  const lines = esc(md).split('\n');
  let html = '', list = null;
  const inline = (t) => t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
  const close = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of lines) {
    const l = raw.trim();
    let m;
    if ((m = l.match(/^#{1,4}\s+(.*)/))) { close(); html += `<h2>${inline(m[1])}</h2>`; }
    else if ((m = l.match(/^[-*]\s+(.*)/))) { if (list !== 'ul') { close(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(m[1])}</li>`; }
    else if ((m = l.match(/^\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(m[1])}</li>`; }
    else if (!l) close();
    else { close(); html += `<p>${inline(l)}</p>`; }
  }
  close();
  return html;
}
