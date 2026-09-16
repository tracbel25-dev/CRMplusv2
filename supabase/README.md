# Supabase operacional por aplicativo

Os bancos operacionais são independentes do Supabase central da CRM PLUS Store.

- Zeus: `supabase/zeus/schema.sql` → somente `diejjfzvoopcuqulqkqr`
- Artemis: `supabase/artemis/schema.sql` → somente `sqbjqjjnusmqotlkegyt`

## Como reconstruir um banco operacional

`schema.sql` é o **baseline de bootstrap**. Ele não substitui o histórico de migrations.

Para uma instalação nova:

1. execute o `schema.sql` do aplicativo;
2. aplique **todas** as migrations da pasta `migrations/` em ordem de timestamp;
3. valide que nenhuma migration ficou pendente antes de publicar o aplicativo.

O estado esperado do banco é sempre **baseline + migrations**. Em produção, o histórico de migrations é a fonte de verdade da evolução do schema.

Nunca reutilize SQL de um aplicativo no outro e nunca execute estes arquivos no Supabase central da Store.

A sessão continua sendo autenticada pela Store central. O backend valida conta, aplicativo e permissões antes de acessar os bancos operacionais; `anon` e `authenticated` permanecem sem CRUD direto nesses bancos.
