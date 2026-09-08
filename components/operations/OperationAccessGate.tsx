'use client';

import type { ReactNode } from 'react';
import type { AppId } from '@/lib/operations/model';

/**
 * Protótipo atual: os aplicativos devem abrir sem exigir login.
 * A estrutura de conta e permissões permanece no projeto para a etapa futura,
 * mas não bloqueia rotas operacionais até a autenticação real ser conectada.
 */
export function OperationAccessGate({ children }: { app: AppId; children: ReactNode }) {
  return <>{children}</>;
}
