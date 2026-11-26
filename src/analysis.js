// Motor de cálculo: razones financieras, proyección a 6 meses, puntaje de salud y alertas.

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const pick = (...vals) => vals.map(num).find((v) => v !== null) ?? null;
const round = (v, d = 0) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function parseSeries(str) {
  if (!str) return [];
  return String(str)
    .split(/[,;\n]+/)
    .map((s) => parseFloat(s.replace(/[^0-9.\-]/g, '')))
    .filter((n) => Number.isFinite(n))
    .slice(-24);
}

function linreg(ys) {
  const n = ys.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0 };
  const xm = (n - 1) / 2;
  const ym = mean(ys);
  let sxy = 0, sxx = 0;
  ys.forEach((y, i) => {
    sxy += (i - xm) * (y - ym);
    sxx += (i - xm) ** 2;
  });
  const slope = sxx ? sxy / sxx : 0;
  return { slope, intercept: ym - slope * xm };
}

function mergeMetrics(docs) {
  const merged = {};
  const fuentes = [];
  for (const d of docs) {
    for (const [k, v] of Object.entries(d.extracted || {})) {
      if (merged[k] === undefined && num(v) !== null) {
        merged[k] = v;
        fuentes.push(k);
      }
    }
  }
  return { merged, fuentes };
}

function runAnalysis(a, docs) {
  const { merged: m, fuentes } = mergeMetrics(docs);
  const advertencias = [];

  // ----- Ventas -----
  const serie = parseSeries(a.ventas_6m);
  if (serie.length < 3) advertencias.push('Se capturaron menos de 3 meses de ventas: la proyección es poco confiable. Agrega más meses al cuestionario.');
  const ventasProm = serie.length ? mean(serie) : pick(m.ingresos !== undefined ? m.ingresos / 12 : null) ?? 0;
  const ventasRecientes = serie.length ? mean(serie.slice(-3)) : ventasProm;
  const ingresosAnual = pick(m.ingresos, ventasProm * 12) ?? 0;

  // ----- Estructura de costos -----
  let varPct = pick(a.costos_variables_pct);
  if (varPct === null && m.costoVentas && m.ingresos) varPct = (m.costoVentas / m.ingresos) * 100;
  if (varPct === null) {
    varPct = 60;
    advertencias.push('No se indicó el % de costos variables; se asumió 60%.');
  }
  const fijos = pick(a.costos_fijos, m.gastosOperacion !== undefined ? m.gastosOperacion / 12 : null) ?? 0;
  const pagoDeuda = pick(a.pago_deuda_mensual) ?? 0;
  const efectivo = pick(a.efectivo, m.efectivo) ?? 0;
  const cxc = pick(a.cuentas_cobrar, m.cuentasPorCobrar) ?? 0;
  const inventario = pick(a.inventario, m.inventarios) ?? 0;
  const cxp = pick(a.cuentas_pagar) ?? 0;
  const deudaTotal = pick(a.deuda_total) ?? 0;
  const diasCobro = pick(a.dias_cobro) ?? 0;
  const diasPago = pick(a.dias_pago) ?? 0;
  const crec = pick(a.crecimiento_esperado) ?? 0;
  const inversion = pick(a.inversion_planeada) ?? 0;

  const margenContribucion = 1 - varPct / 100;
  const flujoMensual = ventasProm * margenContribucion - fijos - pagoDeuda;
  const utilidadOperativaMensual = ventasProm * margenContribucion - fijos;

  // ----- Razones -----
  const margenBruto = m.utilidadBruta && m.ingresos ? m.utilidadBruta / m.ingresos : m.costoVentas && m.ingresos ? 1 - m.costoVentas / m.ingresos : margenContribucion;
  const margenNeto = m.utilidadNeta !== undefined && m.ingresos ? m.utilidadNeta / m.ingresos : ventasProm ? flujoMensual / ventasProm : null;
  const activoCirc = pick(m.activoCirculante, efectivo + cxc + inventario) ?? 0;
  const pasivoCirc = pick(m.pasivoCirculante, cxp + pagoDeuda * 12 * 0 + (deudaTotal ? Math.min(deudaTotal, pagoDeuda * 12) : 0)) ?? 0;
  const razonCirculante = pasivoCirc > 0 ? activoCirc / pasivoCirc : null;
  const pruebaAcida = pasivoCirc > 0 ? (activoCirc - inventario) / pasivoCirc : null;
  const endeudamiento = m.pasivoTotal && m.activoTotal ? m.pasivoTotal / m.activoTotal : null;
  const deudaSobreVentas = ingresosAnual ? deudaTotal / ingresosAnual : null;
  const dscr = pagoDeuda > 0 ? utilidadOperativaMensual / pagoDeuda : null;
  const puntoEquilibrio = margenContribucion > 0 ? fijos / margenContribucion : null;
  const costoVarAnual = ingresosAnual * (varPct / 100);
  const diasInventario = costoVarAnual > 0 ? (inventario / costoVarAnual) * 365 : 0;
  const cicloEfectivo = diasCobro + diasInventario - diasPago;
  const roe = m.utilidadNeta !== undefined && m.capital ? m.utilidadNeta / m.capital : null;
  const roa = m.utilidadNeta !== undefined && m.activoTotal ? m.utilidadNeta / m.activoTotal : null;
  const burn = flujoMensual < 0 ? -flujoMensual : 0;
  const runway = burn > 0 ? efectivo / burn : null;

  // ----- Proyección a 6 meses -----
  const n = serie.length;
  const { slope, intercept } = linreg(serie);
  const maxSlope = ventasProm * 0.1;
  const slopeEff = Math.max(-maxSlope, Math.min(maxSlope, slope));
  const gMensual = crec / 100 / 12;
  const base = [], conservador = [], optimista = [];
  for (let i = 1; i <= 6; i++) {
    let b;
    if (n >= 3) b = intercept + slope * (n - 1) + slopeEff * i;
    else b = ventasProm * (1 + gMensual) ** i;
    b = Math.max(0, b);
    base.push(b);
    conservador.push(Math.max(0, ventasRecientes * 0.95 + Math.min(slopeEff, 0) * i));
    optimista.push(b * (1 + Math.max(gMensual, 0.005)) ** i);
  }
  const caja = (serieVentas) => {
    let saldo = efectivo;
    return serieVentas.map((v) => {
      saldo += v * margenContribucion - fijos - pagoDeuda;
      return saldo;
    });
  };
  const cajaBase = caja(base), cajaCons = caja(conservador), cajaOpt = caja(optimista);
  const mesesCajaNegativa = cajaCons.findIndex((x) => x < 0);

  const forecast = {
    historico: serie.map((v) => round(v)),
    base: base.map((v) => round(v)),
    conservador: conservador.map((v) => round(v)),
    optimista: optimista.map((v) => round(v)),
    cajaBase: cajaBase.map((v) => round(v)),
    cajaConservador: cajaCons.map((v) => round(v)),
    cajaOptimista: cajaOpt.map((v) => round(v)),
    tendenciaMensual: round(slope),
    ventas6mBase: round(base.reduce((x, y) => x + y, 0)),
  };

  // ----- Puntaje y alertas -----
  let score = 50;
  const alertas = [];
  const add = (tipo, titulo, detalle) => alertas.push({ tipo, titulo, detalle });
  const fmt = (v) => '$' + Math.round(v).toLocaleString('es-MX');

  if (flujoMensual > 0) {
    score += 15;
    add('ok', 'Flujo operativo positivo', `Con ventas promedio de ${fmt(ventasProm)} el negocio genera aproximadamente ${fmt(flujoMensual)} al mes después de costos, gastos fijos y pago de deuda.`);
  } else {
    score -= 15;
    add('riesgo', 'Flujo mensual negativo', `Se estima un faltante de ${fmt(-flujoMensual)} al mes. Revisa precios, costos variables o gastos fijos para cerrar la brecha.`);
  }
  if (runway !== null) {
    if (runway < 3) {
      score -= 10;
      add('riesgo', 'Liquidez crítica', `Al ritmo actual el efectivo alcanzaría para ${round(runway, 1)} meses. Prioriza cobranza, negociación con proveedores y financiamiento de corto plazo.`);
    } else {
      add('aviso', 'Efectivo con horizonte limitado', `El efectivo cubriría ${round(runway, 1)} meses de flujo negativo.`);
    }
  }
  if (mesesCajaNegativa >= 0)
    add('riesgo', 'Escenario conservador con caja negativa', `En el escenario conservador la caja se agota en el mes ${mesesCajaNegativa + 1} de la proyección.`);

  if (margenNeto !== null) {
    if (margenNeto >= 0.1) score += 10;
    else if (margenNeto < 0) {
      score -= 10;
      add('riesgo', 'Margen neto negativo', 'El negocio pierde dinero después de todos sus costos. Identifica los productos o servicios menos rentables.');
    } else add('aviso', 'Margen neto bajo', `El margen neto estimado es ${round(margenNeto * 100, 1)}%; hay poco colchón ante imprevistos.`);
  }
  if (razonCirculante !== null) {
    if (razonCirculante >= 1.5) score += 10;
    else if (razonCirculante < 1) {
      score -= 10;
      add('riesgo', 'Razón circulante menor a 1', `Por cada peso de obligaciones de corto plazo hay ${round(razonCirculante, 2)} de activos líquidos. Hay riesgo de no poder cubrir pagos inmediatos.`);
    } else add('aviso', 'Liquidez justa', `Razón circulante de ${round(razonCirculante, 2)}; lo recomendable es 1.5 o más.`);
  }
  if (dscr !== null) {
    if (dscr >= 1.5) score += 10;
    else if (dscr < 1) {
      score -= 15;
      add('riesgo', 'Cobertura de deuda insuficiente', `La utilidad operativa cubre solo ${round(dscr, 2)} veces el pago mensual de deuda. Considera reestructurar plazos o reducir la deuda.`);
    } else add('aviso', 'Cobertura de deuda ajustada', `La cobertura es ${round(dscr, 2)} veces; se recomienda mantener al menos 1.5.`);
  }
  if (endeudamiento !== null && endeudamiento > 0.7) {
    score -= 10;
    add('riesgo', 'Endeudamiento alto', `Los pasivos representan ${round(endeudamiento * 100)}% de los activos.`);
  }
  if (n >= 3) {
    if (slope > 0) {
      score += 5;
      add('ok', 'Tendencia de ventas al alza', `Las ventas crecen en promedio ${fmt(slope)} por mes.`);
    } else if (slope < 0) {
      score -= 5;
      add('aviso', 'Tendencia de ventas a la baja', `Las ventas caen en promedio ${fmt(-slope)} por mes. Revisa canales de venta, precios y retención de clientes.`);
    }
  }
  if (cicloEfectivo > 60) {
    score -= 5;
    add('aviso', 'Ciclo de efectivo largo', `Tardas aproximadamente ${round(cicloEfectivo)} días en convertir inventario y cobranza en efectivo. Acorta el cobro o negocia más plazo con proveedores.`);
  }
  if (diasCobro > 45) add('aviso', 'Cobranza lenta', `Cobras en ${diasCobro} días en promedio. Ofrece descuentos por pronto pago o solicita anticipos.`);
  if (puntoEquilibrio && ventasProm && ventasProm < puntoEquilibrio * 1.1)
    add('riesgo', 'Cerca del punto de equilibrio', `Necesitas vender unos ${fmt(puntoEquilibrio)} al mes para cubrir gastos fijos; tus ventas promedio son ${fmt(ventasProm)}.`);
  if (inversion > 0 && inversion > efectivo)
    add('aviso', 'Inversión mayor al efectivo disponible', `La inversión planeada (${fmt(inversion)}) supera el efectivo actual; necesitará financiamiento o una ejecución por etapas.`);
  if (a.contabilidad === 'No') {
    score -= 5;
    add('aviso', 'Sin contabilidad formal', 'Llevar contabilidad formal mejora la calidad de las proyecciones y facilita acceder a crédito.');
  } else if (a.contabilidad === 'Sí') score += 3;

  score = Math.max(0, Math.min(100, Math.round(score)));
  const nivel = score >= 70 ? 'Saludable' : score >= 45 ? 'Estable con riesgos' : 'En riesgo';
  const orden = { riesgo: 0, aviso: 1, ok: 2 };
  alertas.sort((x, y) => orden[x.tipo] - orden[y.tipo]);

  return {
    score,
    nivel,
    ratios: {
      ventasPromedioMensual: round(ventasProm),
      ingresosAnuales: round(ingresosAnual),
      flujoMensual: round(flujoMensual),
      margenBruto: round(margenBruto * 100, 1),
      margenNeto: margenNeto === null ? null : round(margenNeto * 100, 1),
      razonCirculante: round(razonCirculante, 2),
      pruebaAcida: round(pruebaAcida, 2),
      endeudamiento: endeudamiento === null ? null : round(endeudamiento * 100, 1),
      deudaSobreVentas: round(deudaSobreVentas, 2),
      coberturaDeuda: round(dscr, 2),
      puntoEquilibrioMensual: round(puntoEquilibrio),
      cicloEfectivoDias: round(cicloEfectivo),
      roe: roe === null ? null : round(roe * 100, 1),
      roa: roa === null ? null : round(roa * 100, 1),
      mesesDeEfectivo: round(runway, 1),
    },
    forecast,
    alertas,
    advertencias,
    metricasDeDocumentos: fuentes,
  };
}

module.exports = { runAnalysis };
