import Link from 'next/link';

export function AuthShell({mode}:{mode:'login'|'signup'}){
  const signup=mode==='signup';
  return <main className="auth-shell"><Link className="brand auth-brand" href="/inicio"><span>CRM PLUS</span><small>Store</small></Link><section className="auth-card"><span className="eyebrow">{signup?'Criar conta':'Acesso'}</span><h1>{signup?'Comece pela sua conta Store.':'Entre na sua conta.'}</h1><p>{signup?'Depois, sua assinatura direciona você ao aplicativo escolhido.':'Clientes recorrentes também poderão entrar diretamente pela rota de login de cada aplicativo.'}</p><form>{signup&&<label>Nome<input type="text" placeholder="Seu nome"/></label>}<label>E-mail<input type="email" placeholder="voce@empresa.com.br"/></label><label>Senha<input type="password" placeholder="••••••••"/></label><button type="button" className="primary" disabled>{signup?'Criar conta':'Entrar'} — conectar Supabase</button></form><small>{signup?<>Já possui conta? <Link href="/login">Entrar</Link></>:<>Ainda não possui conta? <Link href="/cadastro">Criar conta</Link></>}</small></section></main>
}
