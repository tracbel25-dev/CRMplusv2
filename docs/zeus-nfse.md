# Zeus — NFS-e

## Objetivo

O módulo fiscal do Zeus prepara a emissão de Nota Fiscal de Serviço a partir de uma OS, mantém os dados fiscais separados por conta da oficina e preserva o histórico de cada tentativa/emissão.

## Fluxo implementado

1. O usuário autenticado acessa `/zeus/fiscal`.
2. O backend valida sessão, conta ativa e acesso ao Zeus pela Store central.
3. A configuração fiscal é salva no Supabase exclusivo do Zeus usando `tenant_key` obtida no servidor.
4. Uma NFS-e pode ser preparada a partir de uma OS ou manualmente.
5. O rascunho fiscal registra tomador, código e descrição do serviço, valor e vínculo opcional com a OS.
6. O histórico fiscal é lido apenas pelo backend autorizado e sempre filtrado pela conta.

## Persistência

Aplicar a migration:

`supabase/zeus/migrations/20260910195500_zeus_nfse.sql`

Ela cria:

- `fiscal_profiles`
- `service_invoices`

As tabelas usam RLS, não são abertas para `anon`/`authenticated` e são acessadas pelo backend do Zeus com a credencial secreta do projeto operacional.

## Emissão direta

A transmissão fiscal não é marcada como concluída sem retorno real do emissor. No estado atual, a ação de emissão preserva o registro como `pending_configuration` enquanto a infraestrutura fiscal externa não estiver configurada.

Para habilitar a transmissão nacional é necessário concluir, em ambiente de homologação, o conector que:

- monta a DPS conforme o leiaute vigente do Sistema Nacional da NFS-e;
- utiliza o certificado digital do contribuinte de forma exclusivamente server-side;
- envia a DPS ao endpoint oficial de geração;
- registra o XML/retorno real, chave de acesso, número e erros do emissor;
- consulta a nota pela chave quando necessário;
- impede que uma falha de rede seja apresentada como nota autorizada.

Municípios que utilizem emissor próprio exigirão adaptadores específicos, selecionados pela configuração fiscal do prestador.

## Variáveis do servidor

Além de `ZEUS_SUPABASE_SECRET_KEY`, o `.env.example` reserva:

- `ZEUS_NFSE_ENVIRONMENT`
- `ZEUS_NFSE_NATIONAL_BASE_URL`
- `ZEUS_NFSE_CERTIFICATE_PFX_B64`
- `ZEUS_NFSE_CERTIFICATE_PASSWORD`

Não colocar certificado ou senha em variáveis `NEXT_PUBLIC_*`, banco acessível ao navegador, logs ou payloads de resposta.

## Pendências para produção

- acesso administrativo ao Supabase exclusivo do Zeus para aplicar/verificar a migration;
- certificado digital e senha do contribuinte em ambiente seguro;
- confirmação de credenciamento/habilitação no emissor utilizado pelo município;
- validação em homologação do XML/DPS e da autenticação mTLS/assinatura exigida pelo emissor;
- testes de rejeição, idempotência, timeout e consulta após resposta inconclusiva.
