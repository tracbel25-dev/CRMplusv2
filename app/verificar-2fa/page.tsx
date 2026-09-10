import { MfaChallenge } from '@/components/MfaChallenge';
import '../auth-local.css';

export const metadata={title:'Verificação em duas etapas | CRM PLUS Store',robots:{index:false,follow:false}};

export default async function VerifyTwoFactorPage({searchParams}:{searchParams:Promise<{redirect?:string}>}){
  const params=await searchParams;
  return <MfaChallenge redirectTo={params.redirect}/>;
}
