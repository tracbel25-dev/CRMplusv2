import { ZeusCheckInPublicR2 } from '@/components/external/ZeusCheckInPublicR2';
import '../checklist-reference.css';
import '../r2-checklist.css';

export const metadata={title:'Checklist de entrada | Zeus'};

export default async function ChecklistPage({params}:{params:Promise<{token:string}>}){
  const {token}=await params;
  return <ZeusCheckInPublicR2 token={token}/>;
}
