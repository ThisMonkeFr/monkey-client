/* Azure app registration for Monkey Client.
   The Entra client ID is NOT a secret — it is safe to commit to git. */
module.exports = {
  clientId: process.env.MONKEY_AZURE_CLIENT_ID || 'f10df33d-3fcc-4bd7-acca-a23fc14bd641',

  /* MonkeyNet powers friends and direct messages.
     Point this at your deployed server so it works for everyone who installs
     Monkey Client — localhost only ever reaches your own PC.
     See monkeynet/DEPLOY.md. */
    monkeyNet: process.env.MONKEYNET_URL || 'https://monkeynet.thismonke15.workers.dev'
};
