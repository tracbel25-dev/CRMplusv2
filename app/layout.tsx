import type { Metadata } from 'next';
import './globals.css';
import './compact.css';

export const metadata: Metadata = {
  title: 'CRM PLUS Store — ferramentas para a operação do seu negócio',
  description: 'Conheça os aplicativos CRM PLUS Store para oficina, restaurante, vendas, orçamentos e pesquisa de satisfação.'
};

export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>}
