'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Camera, Settings2, Trash2, X } from 'lucide-react';
import type { AppId } from '@/lib/operations/model';
import { useStoreAccess } from '@/lib/account/storeAccess';
import { createStoreClient } from '@/lib/supabase/storeClient';
import { clientMessage } from '@/lib/clientMessage';

export const ZEUS_HOME_COUNTERS_KEY = 'crmplus:zeus:home-section-counters';

async function resizeProfilePhoto(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Não foi possível ler esta imagem.'));
      element.src = url;
    });
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível preparar a imagem.');
    const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
    return canvas.toDataURL('image/jpeg', .82);
  } finally { URL.revokeObjectURL(url); }
}

export function ProfileMenu({ app, canConfigure, fallbackName }: { app: AppId; canConfigure: boolean; fallbackName: string }) {
  const access = useStoreAccess();
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showCounters, setShowCounters] = useState(true);
  const photo = typeof access.user?.user_metadata?.avatar_data_url === 'string' ? access.user.user_metadata.avatar_data_url : '';
  const name = access.member?.displayName || access.user?.user_metadata?.name || fallbackName || access.user?.email || 'Usuário';
  const initials = name.slice(0, 2).toUpperCase();

  useEffect(() => { if (app === 'zeus') setShowCounters(localStorage.getItem(ZEUS_HOME_COUNTERS_KEY) !== '0'); }, [app]);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const savePhoto = async (value: string) => {
    setBusy(true); setError('');
    try {
      const { error: updateError } = await createStoreClient().auth.updateUser({ data: { avatar_data_url: value } });
      if (updateError) throw updateError;
      await access.refresh();
    } catch (reason) { setError(clientMessage(reason, 'Não foi possível atualizar sua foto.')); }
    finally { setBusy(false); }
  };

  return <div className="op-profile-menu" ref={menuRef}>
    <button type="button" className="op-user op-user-button" aria-label="Perfil" aria-expanded={open} onClick={() => setOpen(value => !value)}>{photo ? <img src={photo} alt=""/> : <span>{initials}</span>}</button>
    {open && <section className="op-profile-popover">
      <header><div className="op-profile-large">{photo ? <img src={photo} alt="Foto de perfil"/> : <span>{initials}</span>}</div><div><strong>{name}</strong><small>{access.user?.email || ''}</small></div><button type="button" className="op-icon" aria-label="Fechar" onClick={() => setOpen(false)}><X size={17}/></button></header>
      <div className="op-profile-actions"><button type="button" disabled={busy} onClick={() => inputRef.current?.click()}><Camera size={16}/>{photo ? 'Trocar foto' : 'Adicionar foto'}</button>{photo && <button type="button" disabled={busy} onClick={() => { void savePhoto(''); }}><Trash2 size={15}/>Remover foto</button>}</div>
      {app === 'zeus' && <label className="op-profile-toggle"><span><strong>Contadores na tela inicial</strong><small>Mostra quantidade e aviso de novos itens nas seções recolhidas.</small></span><input type="checkbox" checked={showCounters} onChange={event => { const value = event.target.checked; setShowCounters(value); localStorage.setItem(ZEUS_HOME_COUNTERS_KEY, value ? '1' : '0'); window.dispatchEvent(new CustomEvent('zeus-home-counters-change', { detail: value })); }}/></label>}
      {canConfigure && <Link href={`/${app}/configuracoes`} onClick={() => setOpen(false)}><Settings2 size={16}/>Abrir configurações</Link>}
      {error && <small className="op-error-text">{error}</small>}
      <input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={async event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; try { await savePhoto(await resizeProfilePhoto(file)); } catch (reason) { setError(clientMessage(reason, 'Não foi possível usar esta imagem.')); } }}/>
    </section>}
    <style jsx global>{`.op-profile-menu{position:relative}.op-user-button{border:0;cursor:pointer;padding:0;overflow:hidden}.op-user-button img,.op-user-button>span{width:100%;height:100%;display:grid;place-items:center;object-fit:cover}.op-profile-popover{position:absolute;right:0;top:calc(100% + 10px);z-index:11000;width:min(360px,calc(100vw - 24px));padding:14px;display:grid;gap:13px;border:1px solid var(--op-line);border-radius:14px;background:var(--op-paper);box-shadow:0 20px 60px rgba(0,0,0,.24);color:var(--op-ink)}.op-profile-popover header{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:11px}.op-profile-popover header>div:nth-child(2){display:grid;gap:2px;min-width:0}.op-profile-popover header small{overflow:hidden;text-overflow:ellipsis;color:var(--op-muted)}.op-profile-large{width:48px;height:48px;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:color-mix(in srgb,var(--op-accent) 15%,var(--op-paper));color:var(--op-accent);font-weight:900}.op-profile-large img{width:100%;height:100%;object-fit:cover}.op-profile-actions{display:flex;gap:8px;flex-wrap:wrap}.op-profile-actions button,.op-profile-popover>a{min-height:38px;display:flex;align-items:center;gap:7px;padding:8px 10px;border:1px solid var(--op-line);border-radius:9px;background:var(--op-paper);color:var(--op-ink);font:inherit;text-decoration:none;cursor:pointer}.op-profile-toggle{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:11px;border:1px solid var(--op-line);border-radius:10px}.op-profile-toggle>span{display:grid;gap:3px}.op-profile-toggle small{color:var(--op-muted);line-height:1.35}.op-profile-toggle input{width:18px;height:18px}@media(max-width:600px){.op-profile-popover{position:fixed;top:72px;right:12px}}`}</style>
  </div>;
}
