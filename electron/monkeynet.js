/* MonkeyNet client. Lives in the main process so the Minecraft token
   never reaches the renderer. Identity is proved with Mojang's
   joinServer/hasJoined handshake, so the server never sees the token. */
const { WebSocket } = require('ws');
const { monkeyNet } = require('./config');

let sessionToken = null;
let socket = null;
let onEvent = () => {};

const http = async (path, { method = 'GET', body, auth = true } = {}) => {
  const res = await fetch(monkeyNet + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth && sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `MonkeyNet ${res.status}`);
  return data;
};

async function connect(account, emit) {
  if (!monkeyNet) throw new Error('No MonkeyNet server configured.');
  onEvent = emit;

  /* Hand the Minecraft token to MonkeyNet once; it swaps it for a verified
     UUID with Mojang and gives us back its own session token. The Minecraft
     token is not stored server side. */
  const { token } = await http('/auth/verify', {
    method: 'POST', auth: false, body: { token: account.accessToken }
  });
  sessionToken = token;

  const wsUrl = monkeyNet.replace(/^http/, 'ws') + `/ws?token=${encodeURIComponent(token)}`;
  socket = new WebSocket(wsUrl);
  socket.on('message', raw => {
    try { onEvent(JSON.parse(raw.toString())); } catch {}
  });
  socket.on('close', () => { onEvent({ type: 'disconnected' }); socket = null; });
  socket.on('error', () => {});
  return true;
}

function disconnect() {
  if (socket) { socket.close(); socket = null; }
  sessionToken = null;
}

const isConnected = () => !!socket && socket.readyState === 1;

const friends       = () => http('/friends');
const requests      = () => http('/friends/requests');
const addFriend     = (username) => http('/friends/request', { method: 'POST', body: { username } });
const acceptRequest = (id) => http(`/friends/requests/${id}/accept`, { method: 'POST' });
const declineRequest= (id) => http(`/friends/requests/${id}/decline`, { method: 'POST' });
const removeFriend  = (uuid) => http(`/friends/${uuid}`, { method: 'DELETE' });
const history       = (uuid) => http(`/messages/${uuid}`);

function send(uuid, text) {
  if (!isConnected()) throw new Error('Not connected to MonkeyNet.');
  socket.send(JSON.stringify({ type: 'message', to: uuid, text }));
}

module.exports = {
  connect, disconnect, isConnected, friends, requests,
  addFriend, acceptRequest, declineRequest, removeFriend, history, send
};
