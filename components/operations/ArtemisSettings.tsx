'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Bike, BellRing, Box, ChefHat, QrCode, Store, Users, Wallet } from 'lucide-react';
import type { Workspace } from '@/lib/operations/storage';
import { defaultOperationPreferences, saveOperationPreferences, useOperationPreferences, type OperationPreferences } from '@/lib/operations/configuration';
import { CompactTabs, CompactPanel } from './CompactTabs';
import { LocalAccountSettings } from './LocalAccountSettings';
import { Badge, Button, Section, Title } from './ui';
import { useArtemisBootstrap } from './useArtemisBootstrap';

function Choice({ checked, onChange, title, description, icon }: { checked: boolean; onChange: (value: boolean) => void; title: string; description: string; icon: ReactNode }) {
  return <label className="op-module-choice"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} /><span className="op-config-choice-icon">{icon}</span><span><strong>{title}</strong><small>{description}</small></span><Badge>{checked ? 'Ativo' : 'Desativado'}</Badge></label>;
}

export function ArtemisSettings({ w }: { w: Workspace }) {
  useArtemisBootstrap('artemis');
  const operation = useOperationPreferences('artemis');
  const [preferences, setPreferences] = useState<OperationPreferences>(() => defaultOperationPreferences('artemis'));
  const [business, setBusiness] = useState(w.data.settings.business);
  const [phone, setPhone] = useState(w.data.settings.phone);
  const [email, setEmail] = useState(w.data.settings.email);
  const [address, setAddress] = useState(w.data.settings.address);
  const [hours, setHours] = useState(w.data.settings.hours);
  const [deliveryAreas, setDeliveryAreas] = useState(w.data.settings.deliveryAreas);
  const [deliveryFee, setDeliveryFee] = useState(String(w.data.settings.deliveryFee / 100));
  const [minimumOrder, setMinimumOrder] = useState(String(w.data.settings.minimumOrder / 100));
  const [onlinePaused, setOnlinePaused] = useState(w.data.settings.onlinePaused);
  const [saved, setSaved] = useState(false);

  useEffect(() => setPreferences(operation.preferences), [operation.preferences]);

  const enabled = (key: string) => preferences.actionVisibility[key] !== false;
  const setEnabled = (key: string, value: boolean) => {
    setSaved(false);
    setPreferences(current => {
      const next = { ...current.actionVisibility, [key]: value };
      if (key === 'module:caixa') {
        next.payments = value;
        next.refunds = value;
      }
      return { ...current, actionVisibility: next };
    });
  };
  const fieldEnabled = (key: string) => preferences.fieldVisibility[key] !== false;
  const setFieldEnabled = (key: string, value: boolean) => {
    setSaved(false);
    setPreferences(current => ({ ...current, fieldVisibility: { ...current.fieldVisibility, [key]: value } }));
  };

  const save = async () => {
    if (!business.trim()) { w.setError('Informe o nome do restaurante.'); return; }
    const cents = (value: string) => {
      const parsed = Number(value.replace(',', '.'));
      if (!Number.isFinite(parsed) || parsed < 0) throw new Error('Confira os valores de delivery.');
      return Math.round(parsed * 100);
    };
    let fee = 0;
    let minimum = 0;
    try { fee = cents(deliveryFee); minimum = cents(minimumOrder); } catch (error) { w.setError((error as Error).message); return; }

    const ok = await w.mutate(data => {
      data.settings.business = business.trim();
      data.settings.phone = phone.trim();
      data.settings.email = email.trim();
      data.settings.address = address.trim();
      data.settings.hours = hours.trim();
      data.settings.deliveryAreas = deliveryAreas.trim();
      data.settings.deliveryFee = fee;
      data.settings.minimumOrder = minimum;
      data.settings.onlinePaused = onlinePaused;
    }, 'Configurações do Artemis salvas.');
    if (!ok) return;
    saveOperationPreferences('artemis', preferences);
    setSaved(true);
  };

  return <>
    <Title eyebrow="Sua operação" title="Configurações do Artemis">
      Ative apenas o que seu restaurante realmente usa. O menu e a operação se ajustam a essas escolhas.
    </Title>

    <CompactTabs label="Configurações do restaurante" tabs={[{id:'dados',label:'Dados'},{id:'canais',label:'Canais e delivery'},{id:'operacao',label:'Operação'},{id:'cardapio',label:'Cardápio'},{id:'acessos',label:'Acessos'}]}>
    <CompactPanel value="dados"><Section title="Restaurante">
      <div className="op-fields">
        <label className="op-field"><span>Nome do restaurante</span><input value={business} onChange={event => { setBusiness(event.target.value); setSaved(false); }} /></label>
        <label className="op-field"><span>Telefone</span><input type="tel" value={phone} onChange={event => { setPhone(event.target.value); setSaved(false); }} /></label>
        <label className="op-field"><span>E-mail</span><input type="email" value={email} onChange={event => { setEmail(event.target.value); setSaved(false); }} /></label>
        <label className="op-field"><span>Endereço</span><input value={address} onChange={event => { setAddress(event.target.value); setSaved(false); }} /></label>
      </div>
    </Section>

    </CompactPanel><CompactPanel value="canais"><Section title="De onde chegam seus pedidos?">
      <p className="op-muted">Esses canais não criam sistemas separados. Todos os pedidos chegam na mesma tela de Operação.</p>
      <div className="op-config-groups"><div className="op-config-group">
        <Choice checked={enabled('dineIn')} onChange={value => setEnabled('dineIn', value)} title="Loja física — QR Code e salão" description="Cliente consulta o cardápio e o restaurante pode trabalhar com mesas/comandas." icon={<Store size={19} />} />
        <Choice checked={enabled('counter')} onChange={value => setEnabled('counter', value)} title="Balcão" description="Pedido presencial sem necessidade de mesa." icon={<QrCode size={19} />} />
        <Choice checked={enabled('delivery')} onChange={value => setEnabled('delivery', value)} title="Delivery por link" description="Cliente escolhe no cardápio, informa entrega e forma de pagamento; o restaurante confirma o recebimento." icon={<Bike size={19} />} />
        <Choice checked={enabled('pickup')} onChange={value => setEnabled('pickup', value)} title="Retirada" description="Pedido feito pelo link para retirada no restaurante." icon={<QrCode size={19} />} />
      </div></div>
    </Section>

    {enabled('delivery') && <Section title="Delivery">
      <div className="op-fields">
        <label className="op-field"><span>Taxa padrão de entrega (R$)</span><input inputMode="decimal" value={deliveryFee} onChange={event => { setDeliveryFee(event.target.value); setSaved(false); }} /></label>
        <label className="op-field"><span>Pedido mínimo (R$)</span><input inputMode="decimal" value={minimumOrder} onChange={event => { setMinimumOrder(event.target.value); setSaved(false); }} /></label>
        <label className="op-field span-full"><span>Bairros / áreas atendidas</span><textarea rows={3} value={deliveryAreas} onChange={event => { setDeliveryAreas(event.target.value); setSaved(false); }} placeholder="Ex.: Centro, Umarizal, Marco" /></label>
        <label className="op-field span-full"><span>Horários de atendimento</span><textarea rows={3} value={hours} onChange={event => { setHours(event.target.value); setSaved(false); }} placeholder="Ex.: Seg–Sáb 18h às 23h" /></label>
      </div>
      <label className="op-module-choice"><input type="checkbox" checked={onlinePaused} onChange={event => { setOnlinePaused(event.target.checked); setSaved(false); }} /><span><strong>Pausar pedidos online</strong><small>Use quando o restaurante precisar parar temporariamente de receber delivery/retirada.</small></span><Badge>{onlinePaused ? 'Pausado' : 'Recebendo'}</Badge></label>
    </Section>}
    </CompactPanel><CompactPanel value="operacao"><Section title="Como a equipe opera?">
      <div className="op-config-groups"><div className="op-config-group">
        <Choice checked={enabled('kitchenView')} onChange={value => setEnabled('kitchenView', value)} title="Visão de preparo" description="Mostra a visão focada da cozinha dentro da mesma Operação." icon={<ChefHat size={19} />} />
        <Choice checked={enabled('newOrderSound')} onChange={value => setEnabled('newOrderSound', value)} title="Alerta sonoro de novo pedido" description="Tenta emitir um aviso sonoro quando um pedido novo entra, respeitando as permissões do navegador." icon={<BellRing size={19} />} />
        <Choice checked={enabled('module:caixa')} onChange={value => setEnabled('module:caixa', value)} title="Caixa" description="Recebimentos, abertura e fechamento de caixa." icon={<Wallet size={19} />} />
        <Choice checked={enabled('module:estoque')} onChange={value => setEnabled('module:estoque', value)} title="Estoque" description="Só aparece para restaurantes que realmente controlam saldo e reposição." icon={<Box size={19} />} />
        <Choice checked={enabled('module:clientes')} onChange={value => setEnabled('module:clientes', value)} title="Clientes" description="Histórico de consumidores e relacionamento." icon={<Users size={19} />} />
        <Choice checked={enabled('loyalty')} onChange={value => setEnabled('loyalty', value)} title="Fidelidade por pontos" description="Reserva a fidelidade como recurso da operação; regras de pontuação e resgate ficam separadas da rotina de pedidos." icon={<Users size={19} />} />
        <Choice checked={enabled('module:relatorios')} onChange={value => setEnabled('module:relatorios', value)} title="Relatórios" description="Mantém relatórios fora da rotina de quem não precisa deles." icon={<Users size={19} />} />
      </div></div>
    </Section>

    </CompactPanel><CompactPanel value="cardapio"><Section title="O que aparece no cardápio?">
      <div className="op-config-groups"><div className="op-config-group">
        <Choice checked={fieldEnabled('productDescription')} onChange={value => setFieldEnabled('productDescription', value)} title="Descrição dos produtos" description="Texto comercial para ajudar o cliente a escolher." icon={<ChefHat size={19} />} />
        <Choice checked={fieldEnabled('prepTime')} onChange={value => setFieldEnabled('prepTime', value)} title="Tempo de preparo" description="Informação operacional usada pela equipe." icon={<ChefHat size={19} />} />
        <Choice checked={fieldEnabled('ingredients')} onChange={value => setFieldEnabled('ingredients', value)} title="Ingredientes e alergênicos" description="Informações cadastradas pelo próprio restaurante." icon={<ChefHat size={19} />} />
      </div></div>
      <p className="op-callout">A assistência de IA do Artemis pode ser usada para acelerar descrições e preenchimentos; ela não substitui a confirmação do restaurante.</p>
    </Section>



    </CompactPanel><CompactPanel value="acessos"><LocalAccountSettings /></CompactPanel>
    </CompactTabs>
    <div className="op-form-footer op-settings-actions"><Button onClick={save}>Salvar configurações</Button>{saved && <Badge>Salvo</Badge>}</div>
  </>;
}

