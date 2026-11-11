// Cria a conexão com o Supabase usando a configuração pública vinda da Netlify.
// Requer a biblioteca supabase-js carregada antes (window.supabase).
window.getSupabase = (function () {
  let p;
  return function () {
    if (!p) p = fetch('/.netlify/functions/config').then(r => {
      if (!r.ok) throw new Error('Configuração do Supabase ausente na Netlify');
      return r.json();
    }).then(c => window.supabase.createClient(c.url, c.key));
    return p;
  };
})();
