# E-mails de autenticação — CRM PLUS Store

Templates versionados para o Supabase Auth do projeto central `sodcfarvfhkdjecjmdwc`.

Assuntos sugeridos:

- Confirmação de cadastro: `Confirme sua conta | CRM PLUS Store`
- Recuperação de senha: `Redefina sua senha | CRM PLUS Store`
- Reautenticação: `{{ .Token }} é seu código CRM PLUS`
- Senha alterada: `Sua senha foi alterada | CRM PLUS Store`
- 2FA ativada: `Autenticação em dois fatores ativada | CRM PLUS Store`
- 2FA removida: `Autenticação em dois fatores removida | CRM PLUS Store`

Arquivos:

- `confirmation.html` → Confirm signup
- `recovery.html` → Reset password
- `reauthentication.html` → Reauthentication
- `password-changed.html` → Password changed notification
- `mfa-enrolled.html` → MFA factor enrolled notification
- `mfa-unenrolled.html` → MFA factor unenrolled notification

Os templates usam somente variáveis oficiais do Supabase (`ConfirmationURL`, `Token`, `SiteURL`, `Email` e `FactorType`). O conteúdo deve ser aplicado em Authentication → Email Templates/Notifications no projeto hospedado. Não versionar credenciais SMTP.
