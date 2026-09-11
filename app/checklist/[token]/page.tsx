import { ZeusCheckInPublic } from '@/components/external/ZeusCheckInPublic';

export const metadata={title:'Checklist de entrada | Zeus'};

export default async function ChecklistPage({params}:{params:Promise<{token:string}>}){
  const {token}=await params;
  return <ZeusCheckInPublic token={token}/>;
}
