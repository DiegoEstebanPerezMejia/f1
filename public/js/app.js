let chart1 = null, chart2 = null;

const DOC_LABELS = { estado_resultados: 'Estado de resultados', balance_general: 'Balance general', otro: 'Otro' };
const METRIC_LABELS = {
  ingresos: 'Ingresos', costoVentas: 'Costo de ventas', utilidadBruta: 'Utilidad bruta', gastosOperacion: 'Gastos de operación',
  utilidadOperacion: 'Utilidad de operación', utilidadNeta: 'Utilidad neta', efectivo: 'Efectivo', cuentasPorCobrar: 'Cuentas por cobrar',
  inventarios: 'Inventarios', activoCirculante: 'Activo circulante', activoTotal: 'Activo total', pasivoCirculante: 'Pasivo circulante',
  pasivoTotal: 'Pasivo total', capital: 'Capital contable',
};

(async function init() {
  const me = await requireSession('user');
  if (!me) return;
  document.getElementById('who').textContent = me.company_name ? `${me.company_name} (${me.username})` : me.username;
  document.getElementById('outBtn').onclick = logout;

  // Pestañas
  document.querySelectorAll('#tabs button').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('active', x === b));
      for (const t of ['q', 'd', 'a']) document.getElementById('tab-' + t).hidden = t !== b.dataset.tab;
    };
  });

  await buildQuestionnaire();
  await loadDocs();
  await loadLatest();
  setupPassword();
})();

// ---------- Cuestionario ----------
async function buildQuestionnaire() {
  const [questions, saved] = await Promise.all([api('/api/questions'), api('/api/questionnaire')]);
  const answers = saved?.answers || {};
  const form = document.getElementById('qForm');
  let html = '<h2>Cuestionario financiero</h2><p class="small">Responde con la mayor precisión posible. Las cantidades van en pesos mexicanos, sin símbolos. Puedes dejar en blanco lo que no sepas.</p>';
  for (const g of questions) {
    html += `<h3 style="margin-top:1.4rem">${esc(g.group)}</h3><div class="grid2">`;
    for (const q of g.fields) {
      const v = answers[q.id] ?? '';
      let input;
      if (q.type === 'select') {
        input = `<select id="q_${q.id}" name="${q.id}"><option value="">— Selecciona —</option>${q.options.map((o) => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
      } else if (q.type === 'textarea') {
        input = `<textarea id="q_${q.id}" name="${q.id}">${esc(v)}</textarea>`;
      } else if (q.type === 'number') {
        input = `<input id="q_${q.id}" name="${q.id}" type="number" step="any" ${q.min !== undefined ? `min="${q.min}"` : ''} ${q.max !== undefined ? `max="${q.max}"` : ''} value="${esc(v)}">`;
      } else {
        input = `<input id="q_${q.id}" name="${q.id}" type="text" placeholder="${esc(q.placeholder || '')}" value="${esc(v)}">`;
      }
      const wide = q.type === 'textarea' || q.id === 'ventas_6m' ? 'style="grid-column:1/-1"' : '';
      html += `<div ${wide}><label for="q_${q.id}">${esc(q.label)}</label>${input}${q.help ? `<div class="help">${esc(q.help)}</div>` : ''}</div>`;
    }
    html += '</div>';
  }
  html += '<div class="msg" id="qMsg" hidden></div><button class="btn" id="qBtn" style="margin-top:1.25rem">Guardar cuestionario</button>';
  form.innerHTML = html;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const msg = document.getElementById('qMsg');
    const data = {};
    for (const el of form.elements) if (el.name) data[el.name] = el.value;
    try {
      await api('/api/questionnaire', { method: 'POST', body: { answers: data } });
      showMsg(msg, 'Cuestionario guardado. Ahora sube tus estados financieros o ve directo al análisis.', true);
    } catch (err) { showMsg(msg, err.message); }
  };
}

// ---------- Documentos ----------
async function loadDocs() {
  const docs = await api('/api/documents');
  const box = document.getElementById('docs');
  if (!docs.length) { box.innerHTML = '<p class="small">Aún no has subido documentos.</p>'; return; }
  box.innerHTML = '<table><thead><tr><th>Archivo</th><th>Tipo</th><th>Cifras detectadas</th><th></th></tr></thead><tbody>' +
    docs.map((d) => {
      const entries = Object.entries(d.extracted || {});
      const det = entries.length
        ? entries.map(([k, v]) => `${esc(METRIC_LABELS[k] || k)}: <strong>${money(v)}</strong>`).join('<br>')
        : '<span class="small">No se detectaron cifras conocidas. Revisa que las filas tengan etiquetas como "Ventas" o "Utilidad neta".</span>';
      return `<tr><td>${esc(d.filename)}<div class="small">${esc(d.period || '')}</div></td><td>${esc(DOC_LABELS[d.doc_type] || d.doc_type)}</td><td>${det}</td><td><button class="btn danger small" data-del="${d.id}">Eliminar</button></td></tr>`;
    }).join('') + '</tbody></table>';
  box.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('¿Eliminar este documento?')) return;
      await api('/api/documents/' + b.dataset.del, { method: 'DELETE' });
      loadDocs();
    };
  });
}

document.getElementById('dForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('dMsg');
  const btn = document.getElementById('dBtn');
  btn.disabled = true;
  showMsg(msg, 'Procesando archivo…', true);
  try {
    await api('/api/documents', { method: 'POST', body: new FormData(e.target) });
    e.target.reset();
    showMsg(msg, 'Documento procesado correctamente.', true);
    loadDocs();
  } catch (err) { showMsg(msg, err.message); }
  btn.disabled = false;
});

// ---------- Análisis ----------
async function loadLatest() {
  const latest = await api('/api/analysis/latest');
  if (latest) renderResult(latest);
}

document.getElementById('aBtn').onclick = async () => {
  const btn = document.getElementById('aBtn');
  const msg = document.getElementById('aMsg');
  btn.disabled = true;
  showMsg(msg, 'Calculando indicadores y generando recomendaciones… puede tardar unos segundos.', true);
  try {
    const r = await api('/api/analysis', { method: 'POST' });
    showMsg(msg, '');
    renderResult(r);
    document.getElementById('result').scrollIntoView({ behavior: 'smooth' });
  } catch (err) { showMsg(msg, err.message); }
  btn.disabled = false;
};

function kpi(label, value) {
  return `<div class="kpi"><div class="v">${value}</div><div class="l">${esc(label)}</div></div>`;
}
const pct = (v) => (v === null || v === undefined ? '—' : v + '%');
const dec = (v) => (v === null || v === undefined ? '—' : v);

function renderResult(r) {
  const { result: x, ai_text: ai } = r;
  const color = x.score >= 70 ? 'var(--ok)' : x.score >= 45 ? 'var(--warn)' : 'var(--risk)';
  const q = x.ratios;
  const when = new Date(r.created_at).toLocaleString('es-MX');
  document.getElementById('result').innerHTML = `
    <div class="card">
      <div class="score">
        <div class="num" style="color:${color}">${x.score}</div>
        <div><h2 style="margin:0">${esc(x.nivel)}</h2><div class="small">Puntaje de salud financiera (0–100) · generado ${esc(when)}</div></div>
      </div>
      ${x.advertencias.map((w) => `<div class="msg err">${esc(w)}</div>`).join('')}
      <div class="kpis">
        ${kpi('Ventas promedio mensuales', money(q.ventasPromedioMensual))}
        ${kpi('Flujo mensual estimado', money(q.flujoMensual))}
        ${kpi('Margen bruto', pct(q.margenBruto))}
        ${kpi('Margen neto', pct(q.margenNeto))}
        ${kpi('Razón circulante', dec(q.razonCirculante))}
        ${kpi('Prueba ácida', dec(q.pruebaAcida))}
        ${kpi('Cobertura de deuda (x)', dec(q.coberturaDeuda))}
        ${kpi('Endeudamiento', pct(q.endeudamiento))}
        ${kpi('Punto de equilibrio mensual', money(q.puntoEquilibrioMensual))}
        ${kpi('Ciclo de efectivo (días)', dec(q.cicloEfectivoDias))}
        ${kpi('ROE', pct(q.roe))}
        ${kpi('Meses de efectivo', q.mesesDeEfectivo === null ? 'Sin quema' : q.mesesDeEfectivo)}
      </div>
    </div>
    <div class="card"><h2>Proyección de ventas (6 meses)</h2><canvas id="c1" height="120"></canvas>
      <p class="small">Tendencia histórica: ${money(x.forecast.tendenciaMensual)} por mes. Ventas proyectadas (escenario base) próximos 6 meses: ${money(x.forecast.ventas6mBase)}.</p></div>
    <div class="card"><h2>Proyección de caja (6 meses)</h2><canvas id="c2" height="120"></canvas></div>
    <div class="card"><h2>Alertas y hallazgos</h2>${x.alertas.map((a) => `<div class="alert ${a.tipo}"><strong>${esc(a.titulo)}</strong>${esc(a.detalle)}</div>`).join('') || '<p class="small">Sin hallazgos.</p>'}</div>
    <div class="card ai"><h2>Recomendaciones de la IA</h2>${ai ? renderMarkdown(ai) : '<p class="small">El análisis con IA no está disponible (no configurado o sin respuesta). Los resultados numéricos de arriba son completos.</p>'}</div>
    <p class="small">Las proyecciones son estimaciones basadas en la información capturada y no constituyen asesoría financiera, contable ni fiscal.</p>`;
  drawCharts(x.forecast);
}

function drawCharts(f) {
  const hist = f.historico;
  const n = hist.length;
  const labels = [
    ...hist.map((_, i) => `M-${n - 1 - i}`),
    ...f.base.map((_, i) => `+${i + 1}`),
  ];
  const pad = (arr, lead) => [...Array(lead).fill(null), ...arr];
  const lastHist = n ? hist[n - 1] : null;
  const withJoin = (arr) => (n ? [...Array(n - 1).fill(null), lastHist, ...arr] : arr);
  if (chart1) chart1.destroy();
  if (chart2) chart2.destroy();
  chart1 = new Chart(document.getElementById('c1'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Histórico', data: [...hist, ...Array(6).fill(null)], borderColor: '#1b2430', tension: .25 },
        { label: 'Conservador', data: withJoin(f.conservador), borderColor: '#c0392b', borderDash: [5, 4], tension: .25 },
        { label: 'Base', data: withJoin(f.base), borderColor: '#0f6b5c', tension: .25 },
        { label: 'Optimista', data: withJoin(f.optimista), borderColor: '#2b7fd1', borderDash: [5, 4], tension: .25 },
      ],
    },
    options: { responsive: true, spanGaps: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { ticks: { callback: (v) => '$' + v.toLocaleString('es-MX') } } } },
  });
  chart2 = new Chart(document.getElementById('c2'), {
    type: 'line',
    data: {
      labels: f.base.map((_, i) => `Mes +${i + 1}`),
      datasets: [
        { label: 'Conservador', data: f.cajaConservador, borderColor: '#c0392b', borderDash: [5, 4], tension: .25 },
        { label: 'Base', data: f.cajaBase, borderColor: '#0f6b5c', tension: .25 },
        { label: 'Optimista', data: f.cajaOptimista, borderColor: '#2b7fd1', borderDash: [5, 4], tension: .25 },
      ],
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { y: { ticks: { callback: (v) => '$' + v.toLocaleString('es-MX') } } } },
  });
}

// ---------- Cambio de contraseña ----------
function setupPassword() {
  const dlg = document.getElementById('pwDlg');
  const msg = document.getElementById('pwMsg');
  document.getElementById('pwBtn').onclick = () => { showMsg(msg, ''); dlg.showModal(); };
  document.getElementById('pwCancel').onclick = () => dlg.close();
  document.getElementById('pwSave').onclick = async () => {
    try {
      await api('/api/password', { method: 'POST', body: { current: document.getElementById('pwCur').value, next: document.getElementById('pwNew').value } });
      showMsg(msg, 'Contraseña actualizada.', true);
      document.getElementById('pwCur').value = '';
      document.getElementById('pwNew').value = '';
    } catch (err) { showMsg(msg, err.message); }
  };
}
