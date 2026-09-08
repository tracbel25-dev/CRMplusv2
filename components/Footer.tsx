import Link from 'next/link';

export function Footer(){return <footer className="footer"><div className="footer-grid">
  <div><div className="brand footer-brand"><span>CRM PLUS</span><small>Store</small></div><p>Produtos digitais próprios para rotinas diferentes.</p></div>
  <div><strong>Navegação</strong><Link href="/inicio">Início</Link><Link href="/aplicativos">Aplicativos</Link><Link href="/planos">Planos</Link></div>
  <div><strong>Atendimento</strong><Link href="/suporte">Suporte</Link><Link href="/suporte">Contato</Link><Link href="/inicio#sobre">Sobre</Link></div>
  <div><strong>Legal</strong><Link href="#">Termos de Uso</Link><Link href="#">Política de Privacidade</Link><Link href="#">Cookies</Link></div>
</div><div className="copyright">© 2026 CRM PLUS Store. Todos os direitos reservados.</div></footer>}
