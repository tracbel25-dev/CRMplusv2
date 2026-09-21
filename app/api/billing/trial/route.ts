import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { STORE_SUPABASE } from '@/lib/supabase/fixedProjects';

type Body = { appId?: string };

function responseError(status:number,error:string){
  return NextResponse.json({error},{status,headers:{'Cache-Control':'no-store'}});
}

async function verifyCaller(request:NextRequest){
  const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||'';
  if(!token)return null;
  try{
    const response=await fetch(`${STORE_SUPABASE.url}/auth/v1/user`,{
      headers:{apikey:STORE_SUPABASE.publishableKey,authorization:`Bearer ${token}`},
      cache:'no-store',
    });
    if(!response.ok)return null;
    const user=await response.json() as {id?:string};
    return typeof user.id==='string'?{userId:user.id}:null;
  }catch{return null;}
}

function serviceClient(){
  const secret=process.env.STORE_SUPABASE_SECRET_KEY?.trim()||'';
  if(!secret)return null;
  return createClient(STORE_SUPABASE.url,secret,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  });
}

async function canManageBilling(service:SupabaseClient,accountId:string,userId:string){
  const {data:account,error:accountError}=await service.from('accounts')
    .select('id,status').eq('id',accountId).maybeSingle();
  if(accountError||account?.status!=='active')return false;

  const {data:member,error:memberError}=await service.from('account_members')
    .select('role,status').eq('account_id',accountId).eq('user_id',userId).maybeSingle();
  if(memberError||member?.status!=='active')return false;
  if(member.role==='owner')return true;

  const {data:permission,error:permissionError}=await service.from('member_permissions')
    .select('permission').eq('account_id',accountId).eq('user_id',userId)
    .eq('permission','manage_billing').maybeSingle();
  return !permissionError&&!!permission;
}

export async function POST(request:NextRequest){
  const caller=await verifyCaller(request);
  if(!caller)return responseError(401,'Sua sessão expirou. Entre novamente para continuar.');

  const service=serviceClient();
  if(!service)return responseError(503,'A gestão de assinaturas está temporariamente indisponível.');

  const accountId=request.headers.get('x-crmplus-account-id')?.trim()||'';
  if(!/^[0-9a-f-]{36}$/i.test(accountId))return responseError(400,'Conta inválida.');
  if(!(await canManageBilling(service,accountId,caller.userId))){
    return responseError(403,'Somente o titular ou responsável financeiro pode gerenciar assinaturas.');
  }

  const body=await request.json().catch(()=>null) as Body|null;
  const appId=body?.appId?.trim()||'';
  if(!/^[a-z0-9-]{2,40}$/i.test(appId))return responseError(400,'Aplicativo inválido.');

  try{
    const {data:entitlement,error:readError}=await service.from('account_apps')
      .select('status,current_period_end')
      .eq('account_id',accountId).eq('app_id',appId).maybeSingle();
    if(readError)throw readError;

    const end=entitlement?.current_period_end?Date.parse(entitlement.current_period_end):NaN;
    if(entitlement?.status!=='trialing'||!Number.isFinite(end)||end<=Date.now()){
      return responseError(409,'Não existe teste grátis ativo para encerrar.');
    }

    const now=new Date().toISOString();
    const {data:updated,error:updateError}=await service.from('account_apps')
      .update({current_period_end:now,updated_at:now})
      .eq('account_id',accountId)
      .eq('app_id',appId)
      .eq('status','trialing')
      .eq('current_period_end',entitlement.current_period_end)
      .select('app_id')
      .maybeSingle();
    if(updateError)throw updateError;
    if(!updated)return responseError(409,'O teste já foi encerrado ou alterado em outra sessão.');

    return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
  }catch(reason){
    console.error('billing-trial-end-failed',reason);
    return responseError(500,'Não foi possível encerrar o teste agora. Tente novamente.');
  }
}
