/* MonkeyNet client. Lives in the main process so the Minecraft token
   never reaches the renderer. Identity is proved with Mojang's
   joinServer/hasJoined handshake, so the server never sees the token. */
const { WebSocket } = require('ws');
const { joinServer } = require('./minecraft');
const { monkeyNet } = require('./config');

let sessionToken = null;
let socket = null;
let onEvent = () => {};
let generation = 0;

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
  disconnect();const current=++generation;
  onEvent = emit;

  // 1. server hands us a one-time serverId
  const { serverId } = await http('/auth/challenge', {
    method: 'POST', auth: false, body: { username: account.name }
  });
  // 2. we tell Mojang we "joined" it
  await joinServer(account.accessToken, account.uuid, serverId);
  // 3. server asks Mojang whether that really happened
  const { token } = await http('/auth/verify', {
    method: 'POST', auth: false, body: { username: account.name, serverId }
  });
  if(current!==generation)return false;
  sessionToken = token;

  const wsUrl = monkeyNet.replace(/^http/, 'ws') + `/ws?token=${encodeURIComponent(token)}`;
  const connection = new WebSocket(wsUrl);socket=connection;
  connection.on('message', raw => {
    try { if(current===generation)onEvent(JSON.parse(raw.toString())); } catch {}
  });
  connection.on('close', () => { if(current===generation){onEvent({ type: 'disconnected' }); socket = null;} });
  connection.on('error', () => {});
  return true;
}

function disconnect() {
  generation++;
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

const groups = () => http('/groups');
const createGroup = data => http('/groups', {method:'POST',body:data});
const updateGroup = (id,data) => http(`/groups/${encodeURIComponent(id)}`, {method:'PATCH',body:data});
const leaveGroup = id => http(`/groups/${encodeURIComponent(id)}/leave`, {method:'POST'});
const groupHistory = id => http(`/groups/${encodeURIComponent(id)}/messages`);
const uploadAttachment = data => http('/attachments', {method:'POST',body:data});
const attachment = (id,preview=true) => http(`/attachments/${encodeURIComponent(id)}${preview?'?preview=1':''}`);
function sendGroup(groupId,text,attachmentId) {
  if (!isConnected()) throw new Error('Not connected to MonkeyNet.');
  socket.send(JSON.stringify({type:'group-message',groupId,text,attachmentId}));
}
function send(uuid, text, attachmentId) {
  if (!isConnected()) throw new Error('Not connected to MonkeyNet.');
  socket.send(JSON.stringify({ type: 'message', to: uuid, text, attachmentId }));
}

module.exports = {
  connect, disconnect, isConnected, friends, requests,
  addFriend, acceptRequest, declineRequest, removeFriend, history, send,
  groups, createGroup, updateGroup, leaveGroup, groupHistory, uploadAttachment, attachment, sendGroup
};
