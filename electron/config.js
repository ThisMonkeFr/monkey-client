/* Azure app registration for Monkey Client.
   The Entra client ID is NOT a secret — it is safe to commit to git. */
module.exports = {
  clientId: process.env.MONKEY_AZURE_CLIENT_ID || 'f10df33d-3fcc-4bd7-acca-a23fc14bd641',

  /* MonkeyNet powers friends and direct messages. This is the deployed
     Cloudflare Worker, so a fresh copy of the repo works with no edits. */
  monkeyNet: process.env.MONKEYNET_URL || 'https://monkeynet.onrender.com'
};
