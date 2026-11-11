// Cria uma order (Checkout Pro, API de Orders) para um pacote de créditos.
// Pix e cartão são oferecidos na página do Mercado Pago. NÃO TESTADO ainda.
const { createClient } = require('@supabase/supabase-js');
const json = (s, b) => ({ statusCode: s, headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'método inválido' });
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const token = (event.headers.authorization || '').replace('Bearer ', '');
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user) return json(401, { error: 'faça login' });

  let packageId; try { packageId = JSON.parse(event.body).packageId; } catch { return json(400, { error: 'pedido inválido' }); }
  // Preço e créditos vêm do BANCO, nunca do navegador.
  const { data: pkg } = await sb.from('credit_packages').select('*').eq('id', packageId).eq('active', true).single();
  if (!pkg) return json(404, { error: 'pacote não encontrado' });

  const { data: pay, error } = await sb.from('payments').insert({
    user_id: u.user.id, package_id: pkg.id, credits: pkg.credits, amount_cents: pkg.price_cents
  }).select().single();
  if (error) return json(500, { error: 'falha ao registrar' });

  const site = process.env.SITE_URL;
  const amount = (pkg.price_cents / 100).toFixed(2);
  const r = await fetch('https://api.mercadopago.com/v1/orders', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: 'Bearer ' + process.env.MP_ACCESS_TOKEN,
      'X-Idempotency-Key': pay.id
    },
    body: JSON.stringify({
      type: 'online',
      processing_mode: 'manual',
      total_amount: amount,
      external_reference: pay.id,
      payer: { email: u.user.email },
      items: [{ title: pkg.name, unit_price: amount, quantity: 1 }],
      config: { online: {
        success_url: site + '/login.html',
        failure_url: site + '/login.html',
        pending_url: site + '/login.html',
        auto_return: 'approved'
      } }
    })
  });
  const order = await r.json().catch(() => ({}));
  if (!order.checkout_url) {
    console.error('Mercado Pago recusou:', r.status, JSON.stringify(order));
    return json(502, { error: 'Mercado Pago recusou o pedido' });
  }
  return json(200, { url: order.checkout_url });
};
