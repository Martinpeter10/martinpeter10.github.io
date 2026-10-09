// DailyJamm backend configuration.
//
// The ONLY place environment differs. Resolved from location.hostname, the same
// gate pattern Google Analytics already uses, so test and dev never write to
// production data.
//
// The publishable key below is MEANT to be public. It ships in every page and
// anyone can read it. It is safe because every table has row-level security
// enabled with no client-writable policy - the key cannot insert, update, or
// delete anything. All writes go through security-definer functions.
//
// The SECRET key (sb_secret_...) must never appear in this file, in any file
// under /assets, or anywhere in this repo. It lives only in Supabase Edge
// Function secrets, where the platform injects it automatically.
window.DJConfig = (function () {
  'use strict';

  // ── Fill these in after Phase 0 ─────────────────────────────────────────
  // Supabase dashboard -> Settings -> API
  var PROD = {
    url: 'https://desvghzavijzffjhqshe.supabase.co',
    key: 'sb_publishable_L_z-FQxvwOUcy4JVeuPT7A_OLUicuiY'
  };
  var NONPROD = {
    url: 'https://uyvozabvhhaqhypnquzd.supabase.co',
    key: 'sb_publishable_F9mTPasPg_nUDirR-9OZLw_3Rh988g2'
  };

  // Google OAuth client ID. PUBLIC by design - it identifies the app to
  // Google and is meant to ship in the page; the client *secret* stays in the
  // Supabase dashboard and never appears here.
  //
  // ONE client serves both Supabase projects (its redirect URI list holds both
  // callbacks), so there is one value rather than one per environment. What
  // differs per environment is only the Authorized JavaScript origin, and that
  // is configured on Google's side, not here.
  //
  // This is what lets sign-in use Google Identity Services instead of a
  // redirect through <project>.supabase.co - see account.js for why that
  // matters for the consent screen.
  var GOOGLE_CLIENT_ID =
    '1061811011268-povvsrlk86fs91uh0742m9ue8v61audd.apps.googleusercontent.com';
  // ────────────────────────────────────────────────────────────────────────

  var host = location.hostname;
  var env, project, schema;

  // Each environment answers on two hostnames: a custom subdomain and the raw
  // workers.dev one. Both must be listed - matching only the workers.dev form
  // sent tst.dailyjamm.com to the dev schema, so the test site was writing
  // playtest scores into dev data.
  if (host === 'dailyjamm.com' || host === 'www.dailyjamm.com') {
    env = 'prod';    project = PROD;    schema = 'public';
  } else if (host === 'tst.dailyjamm.com' || host.indexOf('dailyjammtest') === 0) {
    env = 'tst';     project = NONPROD; schema = 'app_tst';
  } else {
    // dev.dailyjamm.com, dailyjammdev.*, localhost, and anything unrecognised.
    // Defaulting to dev is deliberate: an unknown host must never be able to
    // reach production data by accident.
    env = 'dev';     project = NONPROD; schema = 'app_dev';
  }

  var configured = project.url.indexOf('REPLACE_ME') === -1;

  var client = null;

  /**
   * Lazily construct the Supabase client. Returns null when the backend has
   * not been configured yet, so every caller must handle a null client and
   * the site keeps working exactly as it does today.
   */
  function getClient() {
    if (client) return client;
    if (!configured) return null;
    if (typeof window.supabase === 'undefined') return null;

    client = window.supabase.createClient(project.url, project.key, {
      db: { schema: schema },
      auth: {
        // Sessions survive a reload; the token lives in localStorage under a
        // project-scoped key that supabase-js owns.
        persistSession: true,
        autoRefreshToken: true,
        // REQUIRED for Google sign-in. The OAuth round trip comes back with the
        // session in the URL fragment, and this is what reads it and cleans the
        // address bar. Setting it false silently breaks sign-in with no error.
        detectSessionInUrl: true
      }
    });
    return client;
  }

  function functionUrl(name) {
    return project.url + '/functions/v1/' + name;
  }

  return {
    env: env,
    schema: schema,
    url: project.url,
    anonKey: project.key,
    googleClientId: GOOGLE_CLIENT_ID,
    configured: configured,
    getClient: getClient,
    functionUrl: functionUrl
  };
})();
