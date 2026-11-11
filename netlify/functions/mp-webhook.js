// Recebe o aviso do Mercado Pago (tópico "order"), valida a assinatura, confirma a order
// direto na API deles e só então credita. NÃO TESTADO ainda.
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validSignature(event, dataId) {
  const sig = event.headers['x-signature'] || '', reqId = event.headers['x-request-id'] || '';
  const ts = (sig.match(/ts=([^,]+)/) || [])[1], v1 = (sig.match(/v1=([^,]+)/) || [])[1];
  if (!ts || !v1 || !process.env.MP_WEBHOOK_SECRET) return false;
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${reqId};ts:${ts};`;
  const h = crypto.createHmac('sha256', process.env.MP_WEBHOOK_SECRET).update(manifest).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(v1)); } catch { return false; }
}

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  let body = {}; try { body = JSON.parse(event.body || '{}'); } catch {}
  const dataId = q['data.id'] || body?.data?.id;
  if (!dataId) return { statusCode: 200, body: 'ok' };
  if (!validSignature(event, dataId)) return { statusCode: 401, body: 'assinatura inválida' };

  // Confirma a order direto no Mercado Pago (não confia só no aviso).
  const r = await fetch('https://api.mercadopago.com/v1/orders/' + encodeURIComponent(dataId), {
    headers: { Authorization: 'Bearer ' + process.env.MP_ACCESS_TOKEN }
  });
  if (!r.ok) return { statusCode: 500, body: 'não foi possível consultar a order' };
  const o = await r.json();
  if (o.status !== 'processed' || !UUID.test(o.external_reference || '')) return { statusCode: 200, body: 'ignorado' };

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  // O valor pago precisa bater com o valor registrado no banco.
  const { data: pay } = await sb.from('payments').select('amount_cents').eq('id', o.external_reference).single();
  if (!pay || Math.round(parseFloat(o.total_paid_amount) * 100) !== pay.amount_cents) {
    console.error('valor divergente', o.id, o.total_paid_amount);
    return { statusCode: 200, body: 'valor divergente' };
  }
  const { error } = await sb.rpc('apply_payment', { p_payment_id: o.external_reference, p_mp_id: String(o.id) });
  return { statusCode: error ? 500 : 200, body: error ? 'erro' : 'creditado' };
};
