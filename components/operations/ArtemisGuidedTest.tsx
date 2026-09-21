'use client';

import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, FlaskConical, TriangleAlert } from 'lucide-react';
import {
  balance, event, money, now, productAvailableForSale, reserved, uid, variantAvailableForSale,
  type Order,
} from '@/lib/operations/model';
import type { Workspace } from '@/lib/operations/storage';
import { useOperationPreferences } from '@/lib/operations/configuration';
import { Badge, Button, Modal } from './ui';
import { LeanArtemisOrderDetail } from './LeanArtemisOrderDetail';

type TestData = Workspace['data'];

export function ArtemisGuidedTest({ w }: { w: Workspace }) {
  const operation = useOperationPreferences('artemis');
  const [open, setOpen] = useState(false);
  const [testData, setTestData] = useState<TestData | null>(null);
  const testDataRef = useRef<TestData | null>(null);

  const product = useMemo(() => w.data.products.find(item => {
    if (!productAvailableForSale(item)) return false;
    if ((item.variants || []).length && !(item.variants || []).some(variant => variantAvailableForSale(variant))) return false;
    return !item.stockControlled || item.stock - reserved(w.data, item.id) > 0;
  }), [w.data.products, w.data.orders]);

  const issues = useMemo(() => {
    const list: string[] = [];
    if (!w.data.settings.business.trim()) list.push('Informe o nome do restaurante.');
    if (!product) list.push('Cadastre pelo menos um produto realmente disponível para venda.');
    if (!operation.actionVisible('delivery') && !operation.actionVisible('pickup') && !operation.actionVisible('dineIn') && !operation.actionVisible('counter')) list.push('Ative pelo menos um canal de atendimento.');
    if (operation.actionVisible('delivery') && !w.data.settings.hours.trim()) list.push('Defina o horário de atendimento do delivery.');
    return list;
  }, [w.data.settings.business, w.data.settings.hours, product, operation.preferences]);

  const discard = () => {
    testDataRef.current = null;
    setTestData(null);
    setOpen(false);
  };

  const start = () => {
    if (issues.length || !product) return;

    const clone = structuredClone(w.data);
    const selectedProduct = clone.products.find(item => item.id === product.id)!;
    const variant = (selectedProduct.variants || []).find(item => variantAvailableForSale(item));
    const channel: Order['channel'] = operation.actionVisible('delivery')
      ? 'Delivery'
      : operation.actionVisible('pickup')
        ? 'Retirada'
        : operation.actionVisible('dineIn')
          ? 'Mesa'
          : 'Balcão';

    if (!clone.shifts.some(shift => !shift.closedAt)) {
      clone.shifts.push({
        id: `test-shift-${uid()}`,
        openedAt: now(),
        closedAt: '',
        initial: 0,
        counted: 0,
        note: 'Caixa temporário da simulação',
        operator: 'Teste guiado',
      });
    }

    const order: Order = {
      id: `test-order-${uid()}`,
      number: 0,
      customerId: '',
      customerName: 'Cliente de teste',
      phone: channel === 'Delivery' || channel === 'Retirada' ? '(00) 00000-0000' : '',
      address: channel === 'Delivery' ? 'Endereço fictício da simulação' : '',
      channel,
      tableId: '',
      lines: [{
        id: `test-line-${uid()}`,
        kind: 'Produto',
        description: variant ? `${selectedProduct.name} · ${variant.name}` : selectedProduct.name,
        brand: '',
        quantity: 1,
        price: variant?.price ?? selectedProduct.price,
        productId: selectedProduct.id,
        variantId: variant?.id,
        done: false,
        note: 'Item de teste — não será salvo',
        prepMinutes: selectedProduct.preparation || 0,
      }],
      notes: 'Simulação isolada do fluxo do restaurante.',
      status: 'Novo',
      delivery: channel === 'Delivery' ? 'Aguardando saída' : '',
      fee: channel === 'Delivery' ? clone.settings.deliveryFee : 0,
      discount: 0,
      createdAt: now(),
      events: [event('Pedido de teste criado em ambiente isolado')],
      stockConsumed: false,
      reserved: false,
      testMode: true,
    };

    clone.orders.push(order);
    testDataRef.current = clone;
    setTestData(clone);
  };

  const testMutate: Workspace['mutate'] = async (fn, message = 'Alteração simulada.') => {
    const current = testDataRef.current;
    if (!current) return false;
    const next = structuredClone(current);
    try {
      fn(next);
      testDataRef.current = next;
      setTestData(next);
      w.setError('');
      if (message) w.setNotice(`Teste: ${message}`);
      return true;
    } catch (reason) {
      w.setError(reason instanceof Error ? `Teste: ${reason.message}` : 'Não foi possível avançar a simulação.');
      return false;
    }
  };

  const testWorkspace = useMemo<Workspace | null>(() => testData ? ({
    ...w,
    data: testData,
    mutate: testMutate,
    syncState: 'confirmed',
  }) : null, [w, testData]);

  const testOrder = testData?.orders.find(item => item.testMode && item.id.startsWith('test-order-'));
  const complete = !!(testData && testOrder && testOrder.status === 'Concluído' && balance(testData, testOrder) === 0);

  const instruction = !testOrder
    ? ''
    : testOrder.status === 'Novo'
      ? '1. Confirme o pedido usando o mesmo botão da operação real.'
      : testOrder.status === 'Aceito'
        ? '2. Inicie o preparo. O estoque alterado abaixo existe apenas nesta cópia de teste.'
        : testOrder.status === 'Em preparo'
          ? '3. Marque o item como pronto e avance o pedido como a cozinha faria.'
          : testOrder.status === 'Pronto' && testOrder.channel === 'Delivery'
            ? '4. Faça a conferência de saída, registre a saída e depois confirme a entrega.'
            : testOrder.status === 'Pronto'
              ? '4. Conclua o pedido como faria no balcão ou retirada.'
              : balance(testData!, testOrder) > 0
                ? '5. Registre o recebimento. O caixa usado é fictício e existe somente nesta simulação.'
                : 'Fluxo completo validado. Nada desta simulação foi salvo no restaurante.';

  return <>
    <Button variant="secondary" onClick={() => { setOpen(true); if (!issues.length) start(); }}><FlaskConical size={16} />Teste guiado</Button>

    {open && <Modal title="Teste guiado do restaurante" wide onClose={discard}>
      <div className="artemis-guided-test">
        <p className="op-callout"><strong>Ambiente isolado.</strong> O teste usa o mesmo fluxo de pedido, cozinha, conferência e recebimento, mas trabalha sobre uma cópia temporária dos dados. Nada é enviado ao Supabase, estoque real, caixa ou relatórios.</p>

        {issues.length > 0 ? <>
          <section className="artemis-test-issues"><div><TriangleAlert size={18} /><strong>Configuração incompleta</strong></div>{issues.map(item => <p key={item}>{item}</p>)}</section>
          <div className="op-form-footer"><Button variant="secondary" onClick={discard}>Fechar</Button></div>
        </> : !testWorkspace || !testOrder ? <div className="op-form-footer"><Button onClick={start}>Iniciar simulação</Button></div> : <>
          <section className={complete ? 'artemis-test-ready' : 'artemis-test-guide'}>
            {complete ? <CheckCircle2 size={18} /> : <FlaskConical size={18} />}
            <span><strong>{complete ? 'Teste concluído' : 'Próxima ação'}</strong><small>{instruction}</small></span>
            <Badge>{testOrder.channel}</Badge>
          </section>

          <LeanArtemisOrderDetail w={testWorkspace} recordId={testOrder.id} testMode />

          <div className="op-form-footer">
            <Button variant="secondary" onClick={start}>Reiniciar teste</Button>
            <Button onClick={discard}>{complete ? 'Finalizar teste' : 'Encerrar simulação'}</Button>
          </div>
        </>}
      </div>

      <style jsx>{`
        .artemis-guided-test{display:grid;gap:16px}
        .artemis-test-issues,.artemis-test-ready,.artemis-test-guide{padding:14px;border:1px solid var(--op-line);border-radius:12px;background:var(--op-soft)}
        .artemis-test-issues>div,.artemis-test-ready,.artemis-test-guide{display:flex;align-items:center;gap:10px}
        .artemis-test-issues p{margin:6px 0 0}
        .artemis-test-ready span,.artemis-test-guide span{display:grid;gap:3px;flex:1}
        .artemis-test-ready small,.artemis-test-guide small{color:var(--op-muted);line-height:1.4}
      `}</style>
    </Modal>}
  </>;
}
