'use client';

import { useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { useStoreAccess } from '@/lib/account/storeAccess';
import { createStoreClient } from '@/lib/supabase/storeClient';
import { clientMessage } from '@/lib/clientMessage';
import { Button } from './ui';

async function resizeProfilePhoto(file: File) {
  const source = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível ler esta imagem.'));
    image.src = URL.createObjectURL(file);
  });
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível preparar a imagem.');
  const scale = Math.max(size / source.naturalWidth, size / source.naturalHeight);
  const width = source.naturalWidth * scale;
  const height = source.naturalHeight * scale;
  context.drawImage(source, (size - width) / 2, (size - height) / 2, width, height);
  URL.revokeObjectURL(source.src);
  return canvas.toDataURL('image/jpeg', .82);
}

export function ProfilePhotoSetting() {
  const access = useStoreAccess();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const photo = typeof access.user?.user_metadata?.avatar_data_url === 'string' ? access.user.user_metadata.avatar_data_url : '';
  const initials = (access.member?.displayName || access.user?.user_metadata?.name || access.user?.email || 'U').slice(0, 2).toUpperCase();

  const save = async (value: string) => {
    setBusy(true);
    setError('');
    try {
      const { error: updateError } = await createStoreClient().auth.updateUser({ data: { avatar_data_url: value } });
      if (updateError) throw updateError;
      await access.refresh();
    } catch (reason) {
      setError(clientMessage(reason, 'Não foi possível atualizar sua foto.'));
    } finally { setBusy(false); }
  };

  return <div className="op-profile-photo-setting">
    <div className="op-profile-photo-preview">{photo ? <img src={photo} alt="Foto de perfil"/> : <span>{initials}</span>}</div>
    <div className="op-profile-photo-copy"><strong>Foto de perfil</strong><small>Ela aparece no canto superior do Zeus.</small>{error && <small className="op-error-text">{error}</small>}</div>
    <div className="op-actions"><Button variant="secondary" disabled={busy} onClick={() => inputRef.current?.click()}><Camera size={16}/>{photo ? 'Trocar foto' : 'Adicionar foto'}</Button>{photo && <Button variant="text" disabled={busy} onClick={() => { void save(''); }}><Trash2 size={15}/>Remover</Button>}</div>
    <input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={async event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; try { await save(await resizeProfilePhoto(file)); } catch (reason) { setError(clientMessage(reason, 'Não foi possível usar esta imagem.')); } }}/>
    <style jsx global>{`.op-profile-photo-setting{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:14px;padding:14px;border:1px solid var(--op-line);border-radius:12px;background:color-mix(in srgb,var(--op-paper) 94%,var(--op-accent) 6%)}.op-profile-photo-preview{width:58px;height:58px;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:color-mix(in srgb,var(--op-accent) 15%,var(--op-paper));color:var(--op-accent);font-weight:900}.op-profile-photo-preview img{width:100%;height:100%;object-fit:cover}.op-profile-photo-copy{display:grid;gap:3px}.op-profile-photo-copy small{color:var(--op-muted)}@media(max-width:720px){.op-profile-photo-setting{grid-template-columns:auto 1fr}.op-profile-photo-setting>.op-actions{grid-column:1/-1}}`}</style>
  </div>;
}
