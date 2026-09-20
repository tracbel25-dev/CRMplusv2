'use client';

import { ChangeEvent, useState } from 'react';
import { FileSearch, Upload, X } from 'lucide-react';
import { cents, uid } from '@/lib/operations/model';
import type { Workspace } from '@/lib/operations/storage';
import { createStoreClient } from '@/lib/supabase/storeClient';
import { Button } from './ui';

type ImportedRow = {
  id: string;
  selected: boolean;
  name: string;
  category: string;
  price: string;
  description: string;
  doubt: string;
};

async function token() {
  const { data } = await createStoreClient().auth.getSession();
  return data.session?.access_token || '';
}

function fileBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.readAsDataURL(file);
  });
}

export function ArtemisMenuImport({ w }: { w: Workspace }) {
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState('');
  const [rows, setRows] = useState<ImportedRow[]>([]);

  const analyze = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { w.setError('Use uma foto ou PDF de até 10 MB.'); return; }
    setBusy(true);
    try {
      const accessToken = await token();
      if (!accessToken) throw new Error('Entre com a conta do restaurante para importar o cardápio.');
      const base64 = await fileBase64(file);
      const response = await fetch('/api/ai/artemis/menu-import', {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ name: file.name, mime: file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : ''), base64 }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Não foi possível analisar o cardápio.');
      const products = Array.isArray(payload.products) ? payload.products : [];
      setRows(products.map((item: Record<string, unknown>) => ({
        id: uid(),
        selected: true,
        name: String(item.name || ''),
        category: String(item.category || ''),
        price: String(item.price || ''),
        description: String(item.description || ''),
        doubt: String(item.doubt || ''),
      })));
      setSource(file.name);
      w.setNotice('Extração concluída. Revise os itens antes de salvar.');
    } catch (reason) {
      w.setError(reason instanceof Error ? reason.message : 'Não foi possível importar o cardápio.');
    } finally {
      setBusy(false);
    }
  };

  const update = (id: string, patch: Partial<ImportedRow>) => setRows(current => current.map(row => row.id === id ? { ...row, ...patch } : row));

  const save = async () => {
    const selected = rows.filter(row => row.selected);
    if (!selected.length) { w.setError('Selecione pelo menos um produto para importar.'); return; }
    for (const row of selected) {
      if (!row.name.trim() || !row.category.trim()) { w.setError('Todos os itens selecionados precisam de nome e categoria.'); return; }
      if (!row.price.trim()) { w.setError(`Revise o preço de “${row.name}”. Preço vazio não será salvo como zero.`); return; }
      const price = Number(row.price.replace(',', '.'));
      if (!Number.isFinite(price) || price < 0) { w.setError(`Preço inválido em “${row.name}”.`); return; }
    }

    const duplicates = selected.filter(row => w.data.products.some(product =>
      product.name.trim().toLocaleLowerCase('pt-BR') === row.name.trim().toLocaleLowerCase('pt-BR') &&
      product.category.trim().toLocaleLowerCase('pt-BR') === row.category.trim().toLocaleLowerCase('pt-BR')
    ));
    if (duplicates.length) {
      w.setError(`Já existem itens com o mesmo nome/categoria: ${duplicates.slice(0, 3).map(row => row.name).join(', ')}. Desmarque ou edite antes de importar.`);
      return;
    }

    const ok = await w.mutate(data => {
      for (const row of selected) data.products.push({
        id: uid(),
        name: row.name.trim(),
        category: row.category.trim(),
        price: cents(row.price),
        description: row.description.trim(),
        allergens: '',
        preparation: 0,
        available: true,
        stockControlled: false,
        stock: 0,
        minimum: 0,
        variants: [],
      });
    }, `${selected.length} produto(s) importado(s) após revisão.`);
    if (ok) { setRows([]); setSource(''); }
  };

  return <section className="artemis-menu-import">
    <div className="artemis-menu-import-head">
      <div><span className="op-kicker">Entrada rápida</span><h2>Importar cardápio por foto ou PDF</h2><p>A IA extrai nome, categoria e preço para uma revisão. Nada é salvo ou publicado sem sua confirmação.</p></div>
      <label className={`op-button secondary ${busy ? 'disabled' : ''}`}><Upload size={17} />{busy ? 'Analisando…' : 'Selecionar arquivo'}<input type="file" hidden disabled={busy} accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" onChange={analyze} /></label>
    </div>

    {rows.length > 0 && <div className="artemis-import-review">
      <div className="artemis-import-review-title"><FileSearch size={18} /><div><strong>Revisão obrigatória</strong><small>{source} · {rows.length} item(ns) encontrados</small></div><Button variant="text" onClick={() => { setRows([]); setSource(''); }}><X size={15} />Descartar</Button></div>
      <div className="artemis-import-grid">
        {rows.map(row => <article key={row.id} className={row.selected ? '' : 'is-off'}>
          <label className="artemis-import-select"><input type="checkbox" checked={row.selected} onChange={event => update(row.id, { selected: event.target.checked })} /><span>Importar</span></label>
          <label><span>Produto</span><input value={row.name} onChange={event => update(row.id, { name: event.target.value })} /></label>
          <label><span>Categoria</span><input value={row.category} onChange={event => update(row.id, { category: event.target.value })} /></label>
          <label><span>Preço (R$)</span><input inputMode="decimal" value={row.price} onChange={event => update(row.id, { price: event.target.value })} placeholder="Revisar" /></label>
          <label className="wide"><span>Descrição</span><textarea rows={2} value={row.description} onChange={event => update(row.id, { description: event.target.value })} /></label>
          {row.doubt && <p className="op-callout"><strong>Confira:</strong> {row.doubt}</p>}
        </article>)}
      </div>
      <div className="op-form-footer"><Button onClick={() => void save()}>Confirmar e importar selecionados</Button></div>
    </div>}

    <style jsx>{`.artemis-menu-import{display:grid;gap:14px;margin-bottom:18px;padding:18px;border:1px solid var(--op-line);border-radius:16px;background:var(--op-paper)}.artemis-menu-import-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.artemis-menu-import-head h2{margin:4px 0 6px}.artemis-menu-import-head p{margin:0;color:var(--op-muted);max-width:720px}.artemis-import-review{display:grid;gap:12px}.artemis-import-review-title{display:flex;align-items:center;gap:10px}.artemis-import-review-title>div{display:grid}.artemis-import-review-title small{color:var(--op-muted)}.artemis-import-review-title :global(button){margin-left:auto}.artemis-import-grid{display:grid;gap:10px;max-height:560px;overflow:auto}.artemis-import-grid article{display:grid;grid-template-columns:auto minmax(180px,1.2fr) minmax(150px,.8fr) 130px;gap:10px;padding:12px;border:1px solid var(--op-line);border-radius:12px}.artemis-import-grid article.is-off{opacity:.55}.artemis-import-grid label{display:grid;gap:5px}.artemis-import-grid label>span{font-size:12px;color:var(--op-muted)}.artemis-import-grid .artemis-import-select{display:flex;align-items:center;gap:6px}.artemis-import-grid .wide,.artemis-import-grid .op-callout{grid-column:2/-1}.disabled{pointer-events:none;opacity:.55}@media(max-width:800px){.artemis-menu-import-head{display:grid}.artemis-import-grid article{grid-template-columns:1fr 1fr}.artemis-import-grid .wide,.artemis-import-grid .op-callout{grid-column:1/-1}}`}</style>
  </section>;
}
