import { AuthShell } from '@/components/AuthShell';
import { isApp } from '@/lib/operations/navigation';
import type { AppId } from '@/lib/operations/model';
import '../auth-local.css';

export const metadata={title:'Entrar | CRM PLUS Store'};
export default async function Login({searchParams}:{searchParams:Promise<{app?:string;redirect?:string}>}){
  const {app,redirect}=await searchParams;
  return <AuthShell mode="login" app={app&&isApp(app)?app as AppId:undefined} redirectTo={redirect}/>;
}
