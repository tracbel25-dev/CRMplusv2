# E-mails de autenticação — CRM PLUS

Fonte de verdade dos e-mails enviados pelo Supabase Auth.

## Padrão visual

- Remetente: `CRM PLUS <nao-responda@crmplus.store>`
- Fundo claro e cartão central
- Cabeçalho preto CRM PLUS Store
- Tipografia limpa
- CTA preto
- Textos 100% em português
- Sem menção a Supabase ou a fornecedores
- Notas de segurança discretas

## Assuntos

### Autenticação
- Confirmação: `Confirme seu e-mail | CRM PLUS`
- Recuperação de senha: `Redefina sua senha | CRM PLUS`
- Convite: `Convite para acessar o CRM PLUS`
- Magic Link: `Seu acesso ao CRM PLUS`
- Alteração de e-mail: `Confirme seu novo e-mail | CRM PLUS`
- Reautenticação: `Seu código de segurança | CRM PLUS`

### Notificações de segurança
- Senha alterada: `Sua senha foi alterada | CRM PLUS`
- E-mail alterado: `Seu e-mail foi alterado | CRM PLUS`
- Telefone alterado: `Seu telefone foi alterado | CRM PLUS`
- MFA adicionado: `Nova verificação adicionada | CRM PLUS`
- MFA removido: `Verificação removida | CRM PLUS`
- Identidade vinculada: `Novo método de acesso vinculado | CRM PLUS`
- Identidade removida: `Método de acesso removido | CRM PLUS`

## Arquivos

### Autenticação
- `confirmation.html`
- `recovery.html`
- `invite.html`
- `magic-link.html`
- `email-change.html`
- `reauthentication.html`

### Notificações
- `password-changed.html`
- `email-changed.html`
- `phone-changed.html`
- `mfa-factor-enrolled.html`
- `mfa-factor-unenrolled.html`
- `identity-linked.html`
- `identity-unlinked.html`

## Produção

Em projetos hospedados, alterar os arquivos do repositório não atualiza automaticamente o Supabase Auth. Os templates devem ser sincronizados pelo Management API ou pela tela Authentication → Emails.

Use o script `scripts/sync-supabase-auth-emails.mjs` com um Personal Access Token do Supabase para aplicar todos de uma vez.
