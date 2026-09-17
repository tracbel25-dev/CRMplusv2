'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { useStoreAccess } from '@/lib/account/storeAccess';
import { createStoreClient } from '@/lib/supabase/storeClient';
import { clientMessage } from '@/lib/clientMessage';
import { ZEUS_HOME_COUNTERS_KEY } from './ProfileMenu';
import { Button } from './ui';

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
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível preparar a imagem.');
    const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
    return canvas.toDataURL('image/jpeg', .82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ProfileSettingsControls({ fallbackName }: { fallbackName: string }) {
  const access = useStoreAccess();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showCounters, setShowCounters] = useState(true);
  const photo = typeof access.user?.user_metadata?.avatar_data_url === 'string' ? access.user.user_metadata.avatar_data_url : '';
  const name = access.member?.displayName || access.user?.user_metadata?.name || fallbackName || access.user?.email || 'Usuário';
  const initials = name.slice(0, 2).toUpperCase();

  useEffect(() => {
    setShowCounters(localStorage.getItem(ZEUS_HOME_COUNTERS_KEY) !== '0');
    const sync = (event: Event) => setShowCounters((event as CustomEvent<boolean>).detail !== false);
    window.addEventListener('zeus-home-counters-change', sync as EventListener);
    return () => window.removeEventListener('zeus-home-counters-change', sync as EventListener);
  }, []);

  const savePhoto = async (value: string) => {
    setBusy(true);
    setError('');
    try {
      const { error: updateError } = await createStoreClient().auth.updateUser({ data: { avatar_data_url: value } });
      if (updateError) throw updateError;
      await access.refresh();
    } catch (reason) {
      setError(clientMessage(reason, 'Não foi possível atualizar sua foto.'));
    } finally {
      setBusy(false);
    }
  };

  const setCounters = (value: boolean) => {
    setShowCounters(value);
    localStorage.setItem(ZEUS_HOME_COUNTERS_KEY, value ? '1' : '0');
    window.dispatchEvent(new CustomEvent('zeus-home-counters-change', { detail: value }));
  };

  return <div className="zeus-profile-settings">
    <div className="zeus-profile-settings-row">
      <div className="zeus-profile-settings-avatar">{photo ? <img src={photo} alt="Foto de perfil" /> : <span>{initials}</span>}</div>
      <div className="zeus-profile-settings-copy"><strong>Foto de perfil</strong><small>Usada no canto superior do Zeus.</small>{error && <small className="op-error-text">{error}</small>}</div>
      <div className="op-actions"><Button variant="secondary" disabled={busy} onClick={() => inputRef.current?.click()}><Camera size={16}/>{photo ? 'Trocar foto' : 'Adicionar foto'}</Button>{photo && <Button variant="text" disabled={busy} onClick={() => { void savePhoto(''); }}><Trash2 size={15}/>Remover</Button>}</div>
      <input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={async event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        try { await savePhoto(await resizeProfilePhoto(file)); }
        catch (reason) { setError(clientMessage(reason, 'Não foi possível usar esta imagem.')); }
      }} />
    </div>
    <label className="zeus-profile-settings-toggle">
      <span><strong>Contadores na tela inicial</strong><small>Mostra quantidade e aviso “Novo” nas seções recolhidas.</small></span>
      <input type="checkbox" checked={showCounters} onChange={event => setCounters(event.target.checked)} />
    </label>
    <style jsx global>{`.zeus-profile-settings{display:grid;gap:12px}.zeus-profile-settings-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:14px}.zeus-profile-settings-avatar{width:58px;height:58px;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:color-mix(in srgb,var(--op-accent) 15%,var(--op-paper));color:var(--op-accent);font-weight:900}.zeus-profile-settings-avatar img{width:100%;height:100%;object-fit:cover}.zeus-profile-settings-copy{display:grid;gap:3px}.zeus-profile-settings-copy small,.zeus-profile-settings-toggle small{color:var(--op-muted)}.zeus-profile-settings-toggle{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:13px 14px;border:1px solid var(--op-line);border-radius:11px}.zeus-profile-settings-toggle>span{display:grid;gap:3px}.zeus-profile-settings-toggle input{width:18px;height:18px}@media(max-width:720px){.zeus-profile-settings-row{grid-template-columns:auto 1fr}.zeus-profile-settings-row>.op-actions{grid-column:1/-1}}`}</style>
  </div>;
}
