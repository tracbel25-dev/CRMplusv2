import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS'
};
function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});}
function allowedResponse(kind:string,input:Record<string,unknown>){
  if(kind==='zeus-quote'||kind==='athena-budget'){
    const decision=input.decision;if(!['approved','rejected'].includes(String(decision)))throw new Error('Decisão inválida.');
    return {decision,note:String(input.note||'').slice(0,2000),name:String(input.name||'').slice(0,180)};
  }
  if(kind==='zeus-checkin'){
    const answers=Array.isArray(input.answers)?input.answers.slice(0,100).map((row:any)=>({item:String(row?.item||'').slice(0,240),status:String(row?.status||'').slice(0,40),note:String(row?.note||'').slice(0,800)})):[];
    if(!answers.length)throw new Error('Checklist sem respostas.');
    for(const row of answers)if(!['OK','Atenção','Não se aplica'].includes(row.status))throw new Error('Resposta de checklist inválida.');
    const signature=String(input.signature||'');
    if(signature&&(!signature.startsWith('data:image/png;base64,')||signature.length>350000))throw new Error('Assinatura inválida ou muito grande.');
    const name=String(input.name||'').trim().slice(0,180);if(!name)throw new Error('Informe o responsável pela conferência.');
    const damageTypes=['Amassado','Riscado','Quebrado','Faltante'];
    const damage=Array.isArray(input.damage)?input.damage.slice(0,100).map((row:any)=>({view:String(row?.view||'').slice(0,80),point:String(row?.point||'').slice(0,100),type:String(row?.type||'').slice(0,40)})):[];
    for(const row of damage)if(!damageTypes.includes(row.type))throw new Error('Tipo de avaria inválido.');
    const contact=(input.contact&&typeof input.contact==='object'?input.contact:{}) as Record<string,unknown>;
    return {answers,name,segment:String(input.segment||'auto').slice(0,30),meter:String(input.meter||'').slice(0,80),notes:String(input.notes||'').slice(0,2000),signature,damage,contact:{phone:String(contact.phone||'').slice(0,80),document:String(contact.document||'').slice(0,120),role:String(contact.role||'').slice(0,120)}};
  }
  if(kind==='athena-survey'){
    const answers=Array.isArray(input.answers)?input.answers.slice(0,100):[];
    return {answers,respondent:String(input.respondent||'').slice(0,180)};
  }
  if(kind==='artemis-menu'){
    const items=Array.isArray(input.items)?input.items.slice(0,80):[];if(!items.length)throw new Error('Pedido sem itens.');
    return {items,customer:String(input.customer||'').slice(0,180),phone:String(input.phone||'').slice(0,80),address:String(input.address||'').slice(0,500),notes:String(input.notes||'').slice(0,2000),channel:String(input.channel||'Delivery').slice(0,40)};
  }
  if(kind==='kronos-response'){
    const intent=String(input.intent||'');if(!['advance','later','not-interested'].includes(intent))throw new Error('Resposta inválida.');
    return {intent,note:String(input.note||'').slice(0,2000),name:String(input.name||'').slice(0,180)};
  }
  throw new Error('Tipo de link não suportado.');
}

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json({error:'Método inválido.'},405);
  try{
    const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
    const body=await req.json();const token=String(body.token||'');if(token.length<32)return json({error:'Link inválido.'},400);
    const {data:link,error}=await db.from('external_links').select('id,account_id,app_id,kind,record_id,title,payload,status,expires_at,answered_at').eq('token',token).maybeSingle();
    if(error)throw error;if(!link)return json({error:'Link não encontrado.'},404);if(link.status==='revoked')return json({error:'Este link foi revogado.'},410);
    if(link.expires_at&&new Date(link.expires_at).getTime()<Date.now()){await db.from('external_links').update({status:'expired',updated_at:new Date().toISOString()}).eq('id',link.id);return json({error:'Este link expirou.'},410);}
    if(body.action==='read')return json({link:{appId:link.app_id,kind:link.kind,recordId:link.record_id,title:link.title,payload:link.payload,status:link.status}});
    if(body.action==='respond'){
      if(link.status==='answered'&&!['artemis-menu','athena-survey'].includes(link.kind))return json({error:'Este link já recebeu uma resposta.'},409);
      const response=allowedResponse(link.kind,body.response||{});
      const {error:insertError}=await db.from('external_link_responses').insert({link_id:link.id,account_id:link.account_id,app_id:link.app_id,record_id:link.record_id,kind:link.kind,response});
      if(insertError)throw insertError;
      if(!['artemis-menu','athena-survey'].includes(link.kind))await db.from('external_links').update({response,status:'answered',answered_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',link.id);
      else await db.from('external_links').update({answered_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',link.id);
      return json({ok:true});
    }
    return json({error:'Ação inválida.'},400);
  }catch(error){return json({error:error instanceof Error?error.message:'Falha inesperada.'},500);}
});
