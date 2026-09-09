# Supabase operacional por aplicativo

Os bancos operacionais são independentes do Supabase central da CRM PLUS Store.

- Zeus: `supabase/zeus/schema.sql` → somente `diejjfzvoopcuqulqkqr`
- Artemis: `supabase/artemis/schema.sql` → somente `sqbjqjjnusmqotlkegyt`

`schema.sql` é o snapshot canônico do estado esperado para bootstrap/revisão. A fonte de verdade de produção continua sendo o histórico de migrations do respectivo projeto Supabase.

As pastas `migrations/` guardam migrations novas versionadas no repositório a partir desta etapa. Nunca reutilize SQL de um aplicativo no outro e nunca execute estes arquivos no Supabase central da Store.

Até a ponte segura entre a sessão da Store e os bancos operacionais ser implementada, `anon` e `authenticated` permanecem sem CRUD direto. O backend deverá resolver o `tenant_key` após validar conta e acesso ao aplicativo.
