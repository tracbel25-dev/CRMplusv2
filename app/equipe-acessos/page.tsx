import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { AccountNav } from '@/components/AccountNav';
import { TeamAccess } from '@/components/TeamAccess';
import '../account-area.css';
import '../account-details.css';

export const metadata={title:'Equipe e acessos | CRM PLUS Store',robots:{index:false,follow:false}};

export default function TeamAccessPage(){
  return <><Header/><main className="page-shell account-area-shell"><AccountNav/><TeamAccess/></main><Footer/></>;
}
