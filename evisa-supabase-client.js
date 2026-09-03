/**
 * Shared Supabase client — login session admin + cloud dono use karte hain.
 */
(function () {
  'use strict';
  var config = window.EvisaSupabaseConfig;
  if (!config || !config.url || !config.anonKey) {
    window.EvisaSupabaseReady = Promise.resolve(null);
    return;
  }

  window.EvisaSupabaseReady = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.114.0/+esm').then(function (m) {
    if (!window.EvisaSupabase) {
      window.EvisaSupabase = m.createClient(config.url, config.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
    }
    return window.EvisaSupabase;
  }).catch(function (e) {
    console.warn('Evisa Supabase client init failed', e);
    return null;
  });
})();
