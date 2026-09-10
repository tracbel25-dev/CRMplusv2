import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { AccountNav } from '@/components/AccountNav';
import { SecurityCenter } from '@/components/SecurityCenter';
import '../account-area.css';
import '../account-details.css';
import './security.css';

export const metadata={title:'Segurança | CRM PLUS Store',robots:{index:false,follow:false}};

export default function SecurityPage(){
  return <><Header/><main className="page-shell account-area-shell"><AccountNav/><SecurityCenter/></main><Footer/></>;
}
