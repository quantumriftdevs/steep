// Service-role access never reaches the browser.
exports.config = () => {
  const missing = ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','TWILIO_AUTH_TOKEN'].filter(k=>!process.env[k]?.trim());
  return missing.length ? {missing} : {base:process.env.SUPABASE_URL.replace(/[/]$/,''),key:process.env.SUPABASE_SERVICE_ROLE_KEY};
};
exports.database = ({base,key}) => async (table, params={}, method='GET', body, prefer='return=representation') => {
  const r=await fetch(base+'/rest/v1/'+table+'?'+new URLSearchParams(params),{method,
    headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:prefer},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(12000)});
  if(!r.ok) throw Error('Storage unavailable');
  return r.status===204?[]:r.json();
};
