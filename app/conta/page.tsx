import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { AccountEntry } from '@/components/AccountEntry';
import '../account-area.css';
import './account.css';

export const metadata={title:'Minha conta | CRM PLUS Store',robots:{index:false,follow:false}};

export default function AccountPage(){
  return <><Header/><main className="page-shell account-area-shell"><AccountEntry/></main><Footer/></>;
}
