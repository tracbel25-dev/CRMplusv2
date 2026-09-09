import Link from 'next/link';

export function Footer(){return <footer className="footer"><div className="footer-grid">
  <div><div className="brand footer-brand"><span>CRM PLUS</span><small>Store</small></div><p>Produtos digitais próprios para rotinas diferentes.</p></div>
  <div><strong>Navegação</strong><Link href="/inicio">Início</Link><Link href="/aplicativos">Aplicativos</Link><Link href="/planos">Planos</Link></div>
  <div><strong>CRM PLUS</strong><Link href="/sobre">Sobre</Link><Link href="/suporte">Suporte</Link><Link href="/contato">Contato</Link></div>
  <div><strong>Legal</strong><Link href="/termos">Termos de Uso</Link><Link href="/privacidade">Política de Privacidade</Link><Link href="/privacidade/ia">Privacidade e IA</Link><Link href="/cookies">Cookies</Link></div>
</div><div className="copyright">© 2026 CRM PLUS Store. Todos os direitos reservados.</div></footer>}
