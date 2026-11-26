const XLSX = require('xlsx');

// Etiquetas buscadas (se comparan sobre texto en minúsculas y sin acentos). El orden importa.
const PATTERNS = [
  ['utilidadBruta', /utilidad bruta|gross profit/],
  ['utilidadNeta', /utilidad neta|resultado neto|utilidad del ejercicio|utilidad \(perdida\) neta|net income|net profit/],
  ['utilidadOperacion', /utilidad (de )?operacion|utilidad operativa|operating income/],
  ['costoVentas', /costo de (ventas|venta|lo vendido|ventas netas)|cost of (goods|sales)/],
  ['gastosOperacion', /gastos (de )?(operacion|operativos|generales)|total (de )?gastos|operating expenses/],
  ['ingresos', /^(total )?(ingresos|ventas)( netas| totales| por ventas| de operacion)?$|ingresos totales|ventas netas|ventas totales|total (de )?ingresos|revenue|net sales/],
  ['activoCirculante', /activo (circulante|corriente)|current assets/],
  ['pasivoCirculante', /pasivo (circulante|a corto plazo|corto plazo|corriente)|current liabilities/],
  ['activoTotal', /^total (de )?activos?$|^activos? total(es)?$|total assets/],
  ['pasivoTotal', /^total (de )?pasivos?$|^pasivos? total(es)?$|total liabilities/],
  ['capital', /capital contable|total (de )?capital|patrimonio|total equity|stockholders/],
  ['efectivo', /^(efectivo|caja|bancos)\b|efectivo y equivalentes|^cash/],
  ['cuentasPorCobrar', /cuentas por cobrar|^clientes$|accounts receivable/],
  ['inventarios', /^inventarios?$|inventory/],
];

const norm = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[:.\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function toNumber(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!/\d/.test(s)) return null;
  const negative = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s);
  const cleaned = s.replace(/[^0-9.]/g, '');
  if (!cleaned || cleaned === '.') return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? (negative ? -n : n) : null;
}

function collect(entries) {
  // entries: [{ label, nums: number[] }]
  const metrics = {};
  for (const { label, nums } of entries) {
    if (!label || !nums.length) continue;
    const l = norm(label);
    if (l.length > 80) continue;
    for (const [key, re] of PATTERNS) {
      if (re.test(l)) {
        if (metrics[key] === undefined) metrics[key] = nums[0]; // primera cifra = periodo más reciente
        break;
      }
    }
  }
  return metrics;
}

function fromSheet(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const entries = [];
  const textParts = [];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: true });
    for (const row of rows) {
      const cells = row.filter((c) => c !== null && c !== '');
      if (!cells.length) continue;
      textParts.push(cells.join(' | '));
      const labelIdx = row.findIndex((c) => typeof c === 'string' && /[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(c) && toNumber(c) === null);
      if (labelIdx === -1) continue;
      const nums = row
        .slice(labelIdx + 1)
        .map(toNumber)
        .filter((n) => n !== null);
      entries.push({ label: row[labelIdx], nums });
    }
  }
  return { entries, text: textParts.join('\n') };
}

function fromText(text) {
  const entries = [];
  const numRe = /\(?-?\$?\s?\d[\d,]*(?:\.\d+)?\)?/g;
  for (const line of text.split(/\r?\n/)) {
    const matches = line.match(numRe);
    if (!matches) continue;
    const idx = line.search(numRe);
    const label = line.slice(0, idx).replace(/[.\s$]+$/g, '');
    const nums = matches.map(toNumber).filter((n) => n !== null);
    if (label && nums.length) entries.push({ label, nums });
  }
  return { entries, text };
}

async function parseDocument(file) {
  const name = file.originalname.toLowerCase();
  let result;
  if (/\.(xlsx|xls|xlsm|ods)$/.test(name)) {
    result = fromSheet(file.buffer);
  } else if (/\.(csv|tsv)$/.test(name)) {
    result = fromSheet(file.buffer);
  } else if (name.endsWith('.pdf')) {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(file.buffer);
    if (!data.text || data.text.trim().length < 20)
      throw new Error('El PDF no contiene texto legible (parece escaneado). Sube un Excel/CSV o un PDF con texto.');
    result = fromText(data.text);
  } else if (name.endsWith('.txt')) {
    result = fromText(file.buffer.toString('utf8'));
  } else {
    throw new Error('Formato no soportado. Usa Excel (.xlsx, .xls), CSV, PDF con texto o TXT.');
  }
  return { metrics: collect(result.entries), text: result.text };
}

module.exports = { parseDocument };
