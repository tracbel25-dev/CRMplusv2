import { createStoreClient } from '@/lib/supabase/storeClient';
import { STORE_SUPABASE } from '@/lib/supabase/fixedProjects';

export async function reserveTrialNetwork(accountId:string,appId:string){
  const {data,error}=await createStoreClient().auth.getSession();
  if(error||!data.session)throw new Error('Entre na sua conta para continuar.');
  const response=await fetch(`${STORE_SUPABASE.url}/functions/v1/trial-antifraud`,{
    method:'POST',
    headers:{'Content-Type':'application/json',apikey:STORE_SUPABASE.publishableKey,Authorization:`Bearer ${data.session.access_token}`},
    body:JSON.stringify({accountId,appId}),
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||'Não foi possível validar o teste grátis.');
  return result as {ok:boolean};
}

export async function precheckSignupIdentity(input:{cpf:string;name:string;birthDate:string;email:string}){
  const response=await fetch(`${STORE_SUPABASE.url}/functions/v1/identity-precheck`,{
    method:'POST',
    headers:{'Content-Type':'application/json',apikey:STORE_SUPABASE.publishableKey},
    body:JSON.stringify(input),
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||'Não foi possível validar os dados do cadastro.');
  return result as {ok:boolean;reservationToken:string;verification:'official'|'format'};
}
