/* Azure app registration for Monkey Client.
   The Entra client ID is NOT a secret — it is safe to commit to git. */
module.exports = {
  clientId: process.env.MONKEY_AZURE_CLIENT_ID || 'f10df33d-3fcc-4bd7-acca-a23fc14bd641',

  // Your MonkeyNet server. Leave empty to run the launcher without friends.
  monkeyNet: process.env.MONKEYNET_URL || 'http://localhost:8787'
};
