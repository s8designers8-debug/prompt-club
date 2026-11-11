// Entrega ao navegador SOMENTE os dados públicos do Supabase (lidos das variáveis da Netlify).
exports.handler = async () => {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { statusCode: 500, headers: {'content-type':'application/json'}, body: JSON.stringify({ error: 'variáveis não configuradas' }) };
  return { statusCode: 200, headers: {'content-type':'application/json','cache-control':'no-store'}, body: JSON.stringify({ url, key }) };
};
