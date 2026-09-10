import type { Metadata } from 'next';
import { StoreAccessProvider } from '@/lib/account/storeAccess';
import './globals.css';
import './compact.css';
import './inicio/editorial.css';

export const metadata: Metadata = {
  title: 'CRM PLUS Store — ferramentas para a operação do seu negócio',
  description: 'Conheça os aplicativos CRM PLUS Store para oficina, restaurante, vendas, orçamentos e pesquisa de satisfação.'
};

export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="pt-BR"><body><StoreAccessProvider>{children}</StoreAccessProvider></body></html>;
}
