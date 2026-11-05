/**
 * Avisos a n8n por webhook (gratis, local). Configurar N8N_WEBHOOK_URL con la URL de un nodo "Webhook" de n8n,
 * por ejemplo http://n8n:5678/webhook/snodic-mapping (misma red Docker). Si no está configurado, no hace nada.
 * Nunca rompe el flujo: los errores solo se registran en consola.
 */
export async function notify(event: string, payload: Record<string, unknown>): Promise<boolean> {
  const url = process.env.N8N_WEBHOOK_URL;
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, at: new Date().toISOString(), app: "snodic-mapping", ...payload }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch (e) {
    console.error(`notify(${event}) falló: ${(e as Error).message}`);
    return false;
  }
}
