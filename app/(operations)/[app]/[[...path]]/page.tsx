import { notFound, redirect } from 'next/navigation';
import { AppRuntime } from '@/components/operations/AppRuntime';
import { OperationAccessGate } from '@/components/operations/OperationAccessGate';
import { appPages, isApp, navigation } from '@/lib/operations/navigation';
import './operations.css';
import './configuration.css';
import './access-control.css';
export const dynamicParams=false;
export function generateStaticParams(){return Object.keys(navigation).flatMap(app=>isApp(app)?[{app,path:[]},...appPages(app).map(page=>({app,path:[page]})),{app,path:['login']},{app,path:['cadastro']}]:[])}
export async function generateMetadata({params}:{params:Promise<{app:string}>}){const {app}=await params;return {title:isApp(app)?`${navigation[app].name} — ${navigation[app].subtitle} | CRM PLUS`:'Aplicativo não encontrado',robots:{index:false,follow:false}}}
export default async function OperationPage({params}:{params:Promise<{app:string;path?:string[]}>}){const {app,path=[]}=await params;if(!isApp(app)||path.length>1)notFound();const page=path[0]||'inicio';if(page==='login')redirect(`/login?app=${encodeURIComponent(app)}&redirect=${encodeURIComponent(`/${app}`)}`);if(page==='cadastro')redirect(`/cadastro?app=${encodeURIComponent(app)}&redirect=${encodeURIComponent(`/${app}`)}`);if(!appPages(app).includes(page))notFound();return <OperationAccessGate app={app}><AppRuntime key={app} app={app} page={page}/></OperationAccessGate>}
