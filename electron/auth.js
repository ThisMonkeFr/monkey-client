/* ------------------------------------------------------------------
   Microsoft device-code sign-in -> Xbox Live -> XSTS -> Minecraft
   Every step here fails in a browser (CORS); this is why we need Electron.
   ------------------------------------------------------------------ */
const { clientId } = require('./config');

const MSA   = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
const XBL   = 'https://user.auth.xboxlive.com/user/authenticate';
const XSTS  = 'https://xsts.auth.xboxlive.com/xsts/authorize';
const MCSVC = 'https://api.minecraftservices.com';
const SCOPE = 'XboxLive.signin offline_access';

class AuthError extends Error {
  constructor(code, message, hint) { super(message); this.code = code; this.hint = hint; }
}

async function jsonPost(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, data, text };
}

async function formPost(url, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString()
  });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) };
}

/* --- 1. ask Microsoft for a device code ------------------------------ */
async function requestDeviceCode() {
  if (!clientId) {
    throw new AuthError('no-client-id',
      'No Azure client ID configured.',
      'Follow AZURE-SETUP.md, then set clientId in electron/config.js.');
  }
  const r = await formPost(`${MSA}/devicecode`, { client_id: clientId, scope: SCOPE });
  if (!r.ok) {
    throw new AuthError('devicecode-failed',
      (r.data && r.data.error_description) || 'Microsoft rejected the device-code request.',
      'Check the client ID and that "Allow public client flows" is enabled in Azure.');
  }
  return r.data; // { device_code, user_code, verification_uri, interval, expires_in }
}

/* --- 2. poll until the user finishes signing in ---------------------- */
async function pollForToken(deviceCode, intervalSec, expiresIn, isCancelled) {
  const deadline = Date.now() + expiresIn * 1000;
  let wait = (intervalSec || 5) * 1000;
  while (Date.now() < deadline) {
    if (isCancelled && isCancelled()) throw new AuthError('cancelled', 'Sign-in cancelled.');
    await new Promise(r => setTimeout(r, wait));
    const r = await formPost(`${MSA}/token`, {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: clientId,
      device_code: deviceCode
    });
    if (r.ok) return r.data;
    const err = r.data && r.data.error;
    if (err === 'authorization_pending') continue;
    if (err === 'slow_down') { wait += 5000; continue; }
    if (err === 'authorization_declined')
      throw new AuthError('declined', 'You declined the sign-in request.');
    if (err === 'expired_token')
      throw new AuthError('expired', 'That code expired. Start sign-in again.');
    throw new AuthError('token-failed', (r.data && r.data.error_description) || 'Sign-in failed.');
  }
  throw new AuthError('expired', 'That code expired. Start sign-in again.');
}

/* --- 3. Xbox Live ---------------------------------------------------- */
async function xboxLive(msaAccessToken) {
  const r = await jsonPost(XBL, {
    Properties: {
      AuthMethod: 'RPS',
      SiteName: 'user.auth.xboxlive.com',
      RpsTicket: `d=${msaAccessToken}`
    },
    RelyingParty: 'http://auth.xboxlive.com',
    TokenType: 'JWT'
  });
  if (!r.ok) throw new AuthError('xbl-failed', 'Xbox Live rejected the Microsoft token.');
  return { token: r.data.Token, uhs: r.data.DisplayClaims.xui[0].uhs };
}

/* --- 4. XSTS (the step with the famous error codes) ------------------ */
const XSTS_ERRORS = {
  '2148916233': ['no-xbox-account',
    'This Microsoft account has no Xbox profile.',
    'Sign in once at minecraft.net or xbox.com to create one, then try again.'],
  '2148916235': ['region-blocked',
    "Xbox Live is not available in this account's country."],
  '2148916236': ['adult-verification', 'This account needs adult verification.'],
  '2148916237': ['adult-verification', 'This account needs adult verification.'],
  '2148916238': ['child-account',
    'This account is registered as a child.',
    'It must be added to a Microsoft Family group by an adult first.']
};

async function xsts(xblToken) {
  const r = await jsonPost(XSTS, {
    Properties: { SandboxId: 'RETAIL', UserTokens: [xblToken] },
    RelyingParty: 'rp://api.minecraftservices.com/',
    TokenType: 'JWT'
  });
  if (r.status === 401 && r.data && r.data.XErr) {
    const known = XSTS_ERRORS[String(r.data.XErr)];
    if (known) throw new AuthError(known[0], known[1], known[2]);
    throw new AuthError('xsts-failed', `Xbox rejected the session (XErr ${r.data.XErr}).`);
  }
  if (!r.ok) throw new AuthError('xsts-failed', 'Xbox security token exchange failed.');
  return { token: r.data.Token, uhs: r.data.DisplayClaims.xui[0].uhs };
}

/* --- 5. Minecraft services ------------------------------------------ */
async function minecraftLogin(uhs, xstsToken) {
  const r = await jsonPost(`${MCSVC}/authentication/login_with_xbox`, {
    identityToken: `XBL3.0 x=${uhs};${xstsToken}`
  });
  if (r.status === 403) {
    throw new AuthError('app-not-approved',
      'Mojang has not approved this Azure application yet.',
      'This 403 is expected on a brand-new client ID. It also proves the app is live, ' +
      'which is what Microsoft wants before you submit https://aka.ms/mce-reviewappid.');
  }
  if (!r.ok) throw new AuthError('mc-login-failed', 'Minecraft services refused the Xbox token.');
  return { accessToken: r.data.access_token, expiresIn: r.data.expires_in };
}

async function getProfile(mcToken) {
  const res = await fetch(`${MCSVC}/minecraft/profile`, {
    headers: { Authorization: `Bearer ${mcToken}` }
  });
  if (res.status === 404) {
    throw new AuthError('no-profile',
      'This account does not own Java Edition, or has never set a username.',
      'Game Pass accounts must open the official launcher once to create a profile.');
  }
  if (!res.ok) throw new AuthError('profile-failed', 'Could not read the Minecraft profile.');
  const p = await res.json();
  return { uuid: p.id, name: p.name, skins: p.skins || [], capes: p.capes || [] };
}

/* --- full sign-in ----------------------------------------------------- */
async function signIn({ onProgress, isCancelled } = {}) {
  const say = (stage, extra) => onProgress && onProgress({ stage, ...extra });

  say('requesting-code');
  const dc = await requestDeviceCode();
  say('awaiting-user', {
    userCode: dc.user_code,
    verificationUri: dc.verification_uri,
    expiresIn: dc.expires_in
  });

  const msa = await pollForToken(dc.device_code, dc.interval, dc.expires_in, isCancelled);
  say('xbox');
  const xbl = await xboxLive(msa.access_token);
  const xs  = await xsts(xbl.token);
  say('minecraft');
  const mc  = await minecraftLogin(xs.uhs, xs.token);
  say('profile');
  const profile = await getProfile(mc.accessToken);

  return {
    ...profile,
    accessToken: mc.accessToken,
    expiresAt: Date.now() + mc.expiresIn * 1000,
    refreshToken: msa.refresh_token
  };
}

/* --- silent refresh on next launch ----------------------------------- */
async function refresh(refreshToken) {
  const r = await formPost(`${MSA}/token`, {
    grant_type: 'refresh_token',
    client_id: clientId,
    scope: SCOPE,
    refresh_token: refreshToken
  });
  if (!r.ok) throw new AuthError('refresh-failed', 'Your session expired. Sign in again.');
  const xbl = await xboxLive(r.data.access_token);
  const xs  = await xsts(xbl.token);
  const mc  = await minecraftLogin(xs.uhs, xs.token);
  const profile = await getProfile(mc.accessToken);
  return {
    ...profile,
    accessToken: mc.accessToken,
    expiresAt: Date.now() + mc.expiresIn * 1000,
    refreshToken: r.data.refresh_token || refreshToken
  };
}

module.exports = { signIn, refresh, getProfile, AuthError };
