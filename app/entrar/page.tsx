import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { AccountEntry } from '@/components/AccountEntry';
import './entry.css';
export const metadata={title:'Meus aplicativos | CRM PLUS Store'};
export default function Entry(){return <><Header/><main className="page-shell entry-page"><AccountEntry/></main><Footer/></>}
