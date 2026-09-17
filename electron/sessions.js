/** One refresh per account; failures never remove saved credentials. */
function createRefreshGate({find,refresh,commit,now=Date.now}) {
 const pending=new Map();
 return function ensure(uuid){
  const current=find(uuid);
  if(!current)return Promise.reject(new Error('Account was signed out.'));
  if(current.accessToken&&current.expiresAt>now()+60000)return Promise.resolve(current);
  if(pending.has(uuid))return pending.get(uuid);
  let expected=current;
  const task=Promise.resolve().then(()=>refresh(current.refreshToken,async rotated=>{
   if(find(uuid)!==expected)throw new Error('Account changed during refresh.');
   expected=await commit({...expected,refreshToken:rotated});
  })).then(live=>{
   if(live.uuid!==uuid)throw new Error('Account identity changed during refresh.');
   if(!find(uuid))throw new Error('Account was signed out.');
   if(find(uuid)!==expected)throw new Error('Account changed during refresh.');
   return commit({...expected,...live,refreshToken:live.refreshToken||expected.refreshToken});
  }).finally(()=>pending.delete(uuid));
  pending.set(uuid,task);return task;
 };
}
module.exports={createRefreshGate};
