'use client';

import Link from 'next/link';
import { BarChart3, BookOpen, Box, ChefHat, ChevronRight, Settings2, ShoppingBag, Store, Truck, Users, Wallet } from 'lucide-react';
import { useStoreAccess } from '@/lib/account/storeAccess';
import type { Workspace } from '@/lib/operations/storage';
import { ArtemisGuidedTest } from './ArtemisGuidedTest';
import { Title } from './ui';

const viewCards = [
  {
    id: 'atendimento',
    permission: 'artemis_service',
    title: 'Atendimento',
    description: 'Pedidos, mesas, comandas e caixa para quem atende o cliente.',
    href: '/artemis/atendimento',
    icon: ShoppingBag,
  },
  {
    id: 'cozinha',
    permission: 'artemis_kitchen',
    title: 'Cozinha',
    description: 'Fila de preparo, itens, tempos e pedidos prontos.',
    href: '/artemis/cozinha',
    icon: ChefHat,
  },
  {
    id: 'gestao',
    permission: 'artemis_manage',
    title: 'Gestão',
    description: 'Cardápio, delivery, estoque, equipe, configurações e relatórios.',
    href: '/artemis/gestao',
    icon: Settings2,
  },
] as const;

export function ArtemisViewHome({ w }: { w: Workspace }) {
  const access = useStoreAccess();
  const available = viewCards.filter(view => access.hasPermission('artemis', view.permission));

  return <>
    <Title eyebrow="Artemis" title="Onde você vai trabalhar agora?">
      Cada área mostra somente as ferramentas necessárias para aquela função.
    </Title>
    <section className="artemis-role-grid">
      {available.map(view => {
        const Icon = view.icon;
        return <Link className="artemis-role-card" href={view.href} key={view.id}>
          <span className="artemis-role-icon"><Icon size={23}/></span>
          <div><strong>{view.title}</strong><p>{view.description}</p></div>
          <ChevronRight size={19}/>
        </Link>;
      })}
    </section>
    {available.length === 0 && <section className="op-section"><h2>Nenhuma visão liberada</h2><p className="op-muted">Peça ao titular da conta para liberar Atendimento, Cozinha ou Gestão no seu acesso ao Artemis.</p></section>}
  </>;
}

const managementCards = [
  { title:'Cardápio', description:'Produtos, categorias, preços, adicionais e disponibilidade.', href:'/artemis/cardapio', icon:BookOpen },
  { title:'Delivery e retirada', description:'Canais, taxa, pedido mínimo, áreas atendidas e horários.', href:'/artemis/configuracoes', icon:Truck },
  { title:'Estoque', description:'Saldos, porções do dia, reposição e itens esgotados.', href:'/artemis/estoque', icon:Box },
  { title:'Clientes', description:'Cadastro e histórico dos consumidores.', href:'/artemis/clientes', icon:Users },
  { title:'Relatórios', description:'Vendas e indicadores da operação.', href:'/artemis/relatorios', icon:BarChart3 },
  { title:'Configurações', description:'Restaurante, pagamentos, equipe, acessos e regras do Artemis.', href:'/artemis/configuracoes', icon:Settings2 },
] as const;

export function ArtemisManagementHome({ w }: { w: Workspace }) {
  return <>
    <Title eyebrow="Gestão" title="Administração do restaurante">
      Configure o Artemis fora da rotina de atendimento e da cozinha.
    </Title>
    <section className="artemis-management-grid">
      {managementCards.map(card => {
        const Icon = card.icon;
        return <Link className="artemis-management-card" href={card.href} key={card.title}>
          <span><Icon size={21}/></span>
          <div><strong>{card.title}</strong><p>{card.description}</p></div>
          <ChevronRight size={18}/>
        </Link>;
      })}
    </section>
    <section className="artemis-management-test">
      <div><Store size={20}/><span><strong>Testar meu restaurante</strong><small>Simule um pedido sem misturar venda, estoque ou caixa reais.</small></span></div>
      <ArtemisGuidedTest w={w}/>
    </section>
  </>;
}
