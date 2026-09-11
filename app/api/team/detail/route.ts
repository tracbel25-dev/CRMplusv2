import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { STORE_SUPABASE } from '@/lib/supabase/fixedProjects';

const ALLOWED = new Set([
  'dashboard_view','appointments_view','appointments_manage','jobs_view','jobs_create','jobs_edit','jobs_advance',
  'quotes_view','quotes_manage','quotes_share','billing_view','billing_manage','billing_collect','reports_export',
  'attachments_manage','ai_use','settings_fields','settings_operation','settings_access','customers_manage'
]);

function fail(status:number,error:string){ return NextResponse.json({error},{status}); }
function serviceClient(){
  const secret=process.env.STORE_SUPABASE_SECRET_KEY?.trim()||'';
  if(!secret) return null;
  return createClient(STORE_SUPABASE.url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
}
async function caller(request:NextRequest){
  const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||'';
  if(!token) return null;
  const response=await fetch(`${STORE_SUPABASE.url}/auth/v1/user`,{headers:{apikey:STORE_SUPABASE.publishableKey,authorization:`Bearer ${token}`},cache:'no-store'}).catch(()=>null);
  if(!response?.ok) return null;
  const user=await response.json() as {id?:string};
  return user.id||null;
}
async function ownerAccount(service:SupabaseClient,userId:string){
  const {data}=await service.from('account_members').select('account_id').eq('user_id',userId).eq('role','owner').eq('status','active').limit(1).maybeSingle();
  return data?.account_id?String(data.account_id):null;
}
async function findUserByEmail(service:SupabaseClient,email:string){
  for(let page=1;page<=25;page+=1){
    const {data,error}=await service.auth.admin.listUsers({page,perPage:200});
    if(error) throw error;
    const found=data.users.find(user=>user.email?.trim().toLowerCase()===email.trim().toLowerCase());
    if(found) return found;
    if(data.users.length<200) break;
  }
  return null;
}
function sanitizePermissions(value:unknown){
  const input=(value&&typeof value==='object'?value:{}) as Record<string,unknown>;
  return Object.fromEntries([...ALLOWED].map(key=>[key,input[key]===true]));
}

export async function POST(request:NextRequest){
  const userId=await caller(request);
  if(!userId) return fail(401,'Sua sessão expirou. Entre novamente.');
  const service=serviceClient();
  if(!service) return fail(503,'A gestão de acessos está indisponível no momento.');
  const accountId=await ownerAccount(service,userId);
  if(!accountId) return fail(403,'Somente o titular pode gerenciar permissões detalhadas.');
  const body=await request.json().catch(()=>null) as null|{action?:'list'|'update';appId?:string;targetUserId?:string;email?:string;jobTitle?:string;permissions?:Record<string,boolean>};
  if(!body?.action||!body.appId) return fail(400,'Dados incompletos.');

  try{
    if(body.action==='list'){
      const [{data:members,error:membersError},{data:accessRows,error:accessError},{data:profiles,error:profilesError}]=await Promise.all([
        service.from('account_members').select('user_id,role,status,job_title').eq('account_id',accountId).eq('status','active'),
        service.from('member_app_access').select('user_id,app_id,can_configure,permissions').eq('account_id',accountId).eq('app_id',body.appId),
        service.from('profiles').select('user_id,display_name')
      ]);
      if(membersError||accessError||profilesError) throw membersError||accessError||profilesError;
      const names=new Map((profiles||[]).map(row=>[String(row.user_id),String(row.display_name||'Usuário')]));
      const accessMap=new Map((accessRows||[]).map(row=>[String(row.user_id),row]));
      return NextResponse.json({members:(members||[]).map(row=>{
        const owner=row.role==='owner';
        const access=accessMap.get(String(row.user_id)) as {can_configure?:boolean;permissions?:Record<string,boolean>}|undefined;
        return {
          userId:String(row.user_id),
          displayName:names.get(String(row.user_id))||'Usuário',
          role:String(row.role),
          jobTitle:String(row.job_title||''),
          enabled:owner||!!access,
          canConfigure:owner||!!access?.can_configure,
          permissions:owner?Object.fromEntries([...ALLOWED].map(key=>[key,true])):sanitizePermissions(access?.permissions||{})
        };
      })});
    }

    let targetId=body.targetUserId?.trim()||'';
    if(!targetId&&body.email){
      const user=await findUserByEmail(service,body.email);
      targetId=user?.id||'';
    }
    if(!targetId) return fail(404,'Pessoa não encontrada na equipe.');
    const {data:member,error:memberError}=await service.from('account_members').select('role,status').eq('account_id',accountId).eq('user_id',targetId).maybeSingle();
    if(memberError) throw memberError;
    if(!member||member.status!=='active') return fail(404,'Essa pessoa não faz parte da equipe.');
    if(member.role==='owner') return fail(400,'O titular já possui acesso completo.');

    const permissions=sanitizePermissions(body.permissions);
    const canConfigure=permissions.settings_fields||permissions.settings_operation||permissions.settings_access||permissions.customers_manage;
    const title=(body.jobTitle||'').trim().replace(/\s+/g,' ').slice(0,80);
    const {error:titleError}=await service.from('account_members').update({job_title:title||null}).eq('account_id',accountId).eq('user_id',targetId);
    if(titleError) throw titleError;
    const {error:accessUpdateError}=await service.from('member_app_access').upsert({
      account_id:accountId,user_id:targetId,app_id:body.appId,can_configure:!!canConfigure,permissions,updated_at:new Date().toISOString()
    },{onConflict:'account_id,user_id,app_id'});
    if(accessUpdateError) throw accessUpdateError;
    return NextResponse.json({ok:true});
  }catch(reason){
    console.error('team-detail-failed',reason);
    return fail(500,'Não foi possível salvar as permissões detalhadas.');
  }
}
