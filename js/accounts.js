// Accounts: email sign-in links through Supabase Auth, and the signed-in customer's active pass.
// Exposes window.aibdAuth for the app. Does nothing when Supabase isn't configured
// (the app then keeps its preview account window).
(function () {
  const cfg = window.AIBD_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabasePublishableKey || !window.supabase) return;

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
    // "implicit" lets a sign-in link work even when opened on another device or browser.
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
  });

  const listeners = new Set();
  const state = { user: null, session: null, pass: null, loading: true };

  async function loadPass() {
    if (!state.user) { state.pass = null; return; }
    const { data, error } = await client.from('passes')
      .select('plan, starts_at, ends_at, ai_total, ai_used, images_total, images_used, videos_total, videos_used, livemode')
      .gt('ends_at', new Date().toISOString())
      .order('ends_at', { ascending: false })
      .limit(1);
    state.pass = error ? null : (data && data[0]) || null;
    if (error) console.warn('pass lookup failed', error.message);
  }

  async function update(session) {
    state.session = session || null;
    state.user = session ? session.user : null;
    await loadPass();
    state.loading = false;
    listeners.forEach(fn => { try { fn(state); } catch (e) { console.error(e); } });
  }

  client.auth.getSession().then(({ data }) => update(data.session));
  client.auth.onAuthStateChange((_event, session) => { setTimeout(() => update(session), 0); });

  window.aibdAuth = {
    state,
    client, // the signed-in Supabase client, used by the app for the customer's own designs
    userId() { return state.user ? state.user.id : null; },
    onChange(fn) { listeners.add(fn); if (!state.loading) fn(state); return () => listeners.delete(fn); },
    async sendLink(email) {
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${location.origin}/app/` },
      });
      if (error) throw error;
    },
    async signOut() { await client.auth.signOut(); },
    async refresh() { await update((await client.auth.getSession()).data.session); },
    async token() { return (await client.auth.getSession()).data.session?.access_token || null; },
  };
})();
