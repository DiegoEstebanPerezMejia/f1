// Análisis narrativo con IA (opcional). Si no hay ANTHROPIC_API_KEY o la llamada falla, devuelve null
// y el sistema muestra únicamente el análisis numérico.

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

async function aiNarrative({ company, answers, result }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const payload = {
    empresa: company || 'Empresa',
    cuestionario: answers,
    indicadores: result.ratios,
    puntaje_salud: result.score,
    nivel: result.nivel,
    proyeccion_6_meses: result.forecast,
    alertas_detectadas: result.alertas,
    metricas_extraidas_de_documentos: result.metricasDeDocumentos,
  };

  const system =
    'Eres un analista financiero para pequeñas empresas en México. Responde siempre en español, con lenguaje claro para un dueño de negocio sin formación financiera. ' +
    'Usa únicamente los datos proporcionados; no inventes cifras. Si falta información, dilo. Cifras en pesos mexicanos.';

  const user =
    'Con los siguientes datos calculados de la empresa, redacta en Markdown:\n' +
    '## Resumen ejecutivo (3-4 líneas)\n## Diagnóstico de la situación\n## Principales riesgos\n## Recomendaciones priorizadas (5 acciones concretas, ordenadas por impacto, con el porqué)\n## Supuestos y limitaciones\n' +
    'Termina con una nota breve indicando que es un análisis orientativo y no sustituye asesoría contable o financiera profesional.\n\nDATOS:\n' +
    JSON.stringify(payload);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1800,
        system,
        messages: [{ role: 'user', content: user }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error('Error de la API de IA:', res.status, (await res.text()).slice(0, 300));
      return null;
    }
    const data = await res.json();
    return data.content?.map((b) => b.text || '').join('\n').trim() || null;
  } catch (e) {
    console.error('Fallo al llamar a la IA:', e.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { aiNarrative };
