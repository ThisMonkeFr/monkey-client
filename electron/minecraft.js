/* Minecraft Services calls that need a live account token. */
const MCSVC = 'https://api.minecraftservices.com';

async function uploadSkin(token, buffer, variant = 'classic') {
  const form = new FormData();
  form.append('variant', variant);
  form.append('file', new Blob([buffer], { type: 'image/png' }), 'skin.png');
  const res = await fetch(`${MCSVC}/minecraft/profile/skins`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  if (!res.ok) throw new Error(`Mojang refused the skin (${res.status})`);
  return res.json();
}

async function resetSkin(token) {
  const res = await fetch(`${MCSVC}/minecraft/profile/skins/active`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Could not reset the skin.');
}

/* Mojang only accepts capes the account already owns — there is no
   endpoint that takes a custom cape image. Custom capes are Monkey Client
   cosmetics served by MonkeyNet instead. */
async function setOwnedCape(token, capeId) {
  const res = await fetch(`${MCSVC}/minecraft/profile/capes/active`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ capeId })
  });
  if (!res.ok) throw new Error('Could not equip that cape.');
  return res.json();
}

async function lookupPlayer(name) {
  const res = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`);
  if (res.status === 404 || res.status === 204) return null;
  if (!res.ok) throw new Error('Mojang lookup failed.');
  return res.json(); // { id, name }
}

/* Proves account ownership to MonkeyNet without handing it our token. */
async function joinServer(token, uuid, serverId) {
  const res = await fetch(`${MCSVC}/minecraft/session/join`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken: token, selectedProfile: uuid.replace(/-/g, ''), serverId })
  });
  if (!res.ok && res.status !== 204) throw new Error(`Session join failed (${res.status})`);
  return true;
}

module.exports = { uploadSkin, resetSkin, setOwnedCape, lookupPlayer, joinServer };
