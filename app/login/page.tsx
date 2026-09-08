import { redirect } from 'next/navigation';
import { isApp } from '@/lib/operations/navigation';
export default async function EntryRedirect({searchParams}:{searchParams:Promise<{app?:string}>}){const {app}=await searchParams;redirect(app&&isApp(app)?`/${app}`:'/entrar');}
