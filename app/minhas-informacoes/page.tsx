import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { AccountNav } from '@/components/AccountNav';
import { AccountInformation } from '@/components/AccountInformation';
import '../account-area.css';
import '../account-details.css';

export const metadata={title:'Minhas informações | CRM PLUS Store',robots:{index:false,follow:false}};

export default function MyInformationPage(){
  return <><Header/><main className="page-shell account-area-shell"><AccountNav/><AccountInformation/></main><Footer/></>;
}
