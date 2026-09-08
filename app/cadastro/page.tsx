import { AuthShell } from '@/components/AuthShell';
import { isApp } from '@/lib/operations/navigation';
import type { AppId } from '@/lib/operations/model';

export const metadata={title:'Criar conta | CRM PLUS Store'};
export default async function Signup({searchParams}:{searchParams:Promise<{app?:string;redirect?:string}>}){
  const {app,redirect}=await searchParams;
  return <AuthShell mode="signup" app={app&&isApp(app)?app as AppId:undefined} redirectTo={redirect}/>;
}
