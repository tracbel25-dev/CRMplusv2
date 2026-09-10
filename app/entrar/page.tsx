import { redirect } from 'next/navigation';

export const metadata={title:'Minha conta | CRM PLUS Store',robots:{index:false,follow:false}};

export default function LegacyEntry(){
  redirect('/conta');
}
