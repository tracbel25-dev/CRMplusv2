# Supabase operacional — Zeus e Artemis

Estado validado em 2026-09-08. O código dos aplicativos foi analisado antes das migrations. A regra aplicada foi: **o aplicativo define o banco**.

## Fronteira

O Supabase central da CRM PLUS Store continua responsável por Auth, conta, assinatura e acesso aos apps. Dados operacionais não são armazenados nele.

| App | Project Ref | URL | Banco operacional |
| --- | --- | --- | --- |
| Zeus | `diejjfzvoopcuqulqkqr` | `https://diejjfzvoopcuqulqkqr.supabase.co` | exclusivo do Zeus |
| Artemis | `sqbjqjjnusmqotlkegyt` | `https://sqbjqjjnusmqotlkegyt.supabase.co` | exclusivo do Artemis |

Cada projeto possui sua própria publishable key e sua própria legacy anon key. Chaves nunca devem ser reutilizadas entre os apps. Secret/service-role fica somente no backend.

## Zeus

Antes da alteração o schema `public` estava vazio. Não havia tabela existente a reaproveitar.

### Tabelas criadas e justificativa

- `tenants`, `tenant_settings`: correlação da conta e configurações reais da oficina, incluindo nomes de campos, módulos, filtros, validade de orçamento e tipos de atendimento.
- `customers`: tela de clientes e histórico.
- `assets`: veículos/equipamentos vinculados ao cliente.
- `appointments`: agenda diária/semanal e abertura de OS a partir do agendamento.
- `jobs`: ordem de serviço, etapa, situação, prazo, relato, diagnóstico e responsável.
- `job_tasks`: tarefas/serviços da execução.
- `job_events`: histórico e transições que também alimentam o lead time.
- `job_attachments`: metadados das evidências. O binário continua pendente de integração com storage/R2.
- `quotes`, `quote_lines`, `quote_events`: orçamento vinculado à OS ou orçamento de balcão.
- `quote_versions`, `quote_version_lines`: preservação das revisões existentes no fluxo de orçamento.
- `custom_fields`, `custom_field_values`: campos adicionais configuráveis já existentes no app.

Não foram criadas tabelas de dashboard ou lead time: esses valores são derivados das OS e eventos.

Migrations aplicadas:
- `20260909004956 zeus_operational_schema_v1`
- `20260909005303 zeus_harden_foreign_keys_and_indexes`

## Artemis

Antes da alteração o schema `public` estava vazio. Não havia tabela de negócio existente a reaproveitar.

### Tabelas criadas e justificativa

- `tenants`, `tenant_settings`: correlação da conta e configurações reais do restaurante, incluindo delivery, pedido mínimo, horários e configuração de campos/ações.
- `customers`: cadastro e histórico de pedidos.
- `products`: cardápio, disponibilidade, preço, preparo, ingredientes/alergênicos e controle de estoque.
- `restaurant_tables`: mesas/comandas e sessão aberta.
- `orders`: pedido, canal, cliente/snapshot, mesa, delivery, situação, taxas, desconto e cancelamento.
- `order_lines`: itens do pedido, preço/snapshot, observação e conclusão individual pela cozinha.
- `order_events`: histórico operacional do pedido.
- `payments`: recebimentos por pedido e turno.
- `cash_shifts`: abertura, conferência e fechamento do caixa.
- `cash_movements`: suprimento, sangria, despesa e devolução.
- `stock_movements`: histórico real de entrada/saída de produto.
- `custom_fields`, `custom_field_values`: campos adicionais configuráveis já existentes no app.

Não foram criadas tabelas de cozinha, relatórios ou reservas: cozinha é derivada de `orders/order_lines`, relatórios de pedidos/pagamentos/movimentações e a reserva de estoque já é derivada dos pedidos ativos.

Migrations aplicadas:
- `20260909005026 artemis_operational_schema_v1`
- `20260909005327 artemis_harden_foreign_keys_and_function_access`

## Segurança atual

RLS está habilitado em todas as tabelas operacionais. `anon` e `authenticated` não possuem CRUD direto nessas tabelas neste estágio.

Isso é proposital: a sessão do usuário hoje pertence ao Supabase central da Store. Uma publishable/anon key de um banco operacional identifica o projeto, mas não prova a conta da CRM PLUS Store. Liberar acesso direto baseado apenas em `tenant_key` permitiria falsificação desse valor no navegador.

Na integração, o backend deve validar a sessão central, confirmar o acesso ao app e resolver o `tenant_key` antes de acessar Zeus ou Artemis com credencial server-only, ou implementar uma ponte de autenticação equivalente antes de abrir políticas RLS para o frontend.

## Situação do código hoje

O schema está pronto, porém as telas ainda não persistem nele:

- `lib/operations/storage.ts` continua salvando a operação em `localStorage`, separada por conta e app.
- configurações operacionais de campos/ações continuam em armazenamento local do navegador.
- tipos de atendimento do Zeus continuam em `localStorage` próprio.
- anexos do Zeus continuam como base64 no navegador; `job_attachments` foi preparado apenas para os metadados/chave do futuro storage.

Portanto, **schema pronto não significa integração pronta**. A próxima etapa é substituir o workspace local por um adaptador de persistência por aplicativo, preservando os fluxos atuais.

## Mapeamento final

### Zeus

- Clientes → `customers`
- Veículos/equipamentos → `assets`
- Agenda → `appointments`
- Atendimentos/OS → `jobs`
- Diagnóstico → `jobs.diagnosis`
- Execução → `job_tasks`
- Histórico/lead time → `job_events`
- Fotos/evidências → `job_attachments` + storage a integrar
- Orçamento OS/balcão → `quotes`, `quote_lines`, `quote_events`
- Revisões → `quote_versions`, `quote_version_lines`
- Configurações/filtros/tipos → `tenant_settings`
- Campos extras → `custom_fields`, `custom_field_values`

### Artemis

- Clientes → `customers`
- Cardápio/estoque atual → `products`
- Mesas/comandas → `restaurant_tables`
- Pedidos/cozinha/delivery → `orders`, `order_lines`, `order_events`
- Recebimentos → `payments`
- Caixa → `cash_shifts`, `cash_movements`
- Movimentação de estoque → `stock_movements`
- Relatórios → derivados de pedidos/pagamentos/movimentações
- Configurações de delivery/campos/ações → `tenant_settings`
- Campos extras → `custom_fields`, `custom_field_values`
