# Memória inteligente da IA — CRM PLUS

## Regra principal

Cada aplicativo possui IA, memória e consumo isolados. Zeus nunca consulta memória do Artemis e Artemis nunca consulta memória do Zeus.

A identidade e a autorização continuam no Supabase central da CRM PLUS Store. Depois da autorização, a API server-side do aplicativo usa apenas o Supabase operacional e a chave Groq daquele aplicativo.

## Escopos

- `tenant_private`: aprendizado exclusivo da empresa que gerou a correção.
- `app_knowledge`: conhecimento sanitizado e aprovado para o aplicativo. Correções de usuário nunca são promovidas automaticamente para este escopo.
- `session_only`: informação utilizável apenas no contexto atual e não transformada em lição reutilizável.

## O que pode aprender

Correções técnicas, sequência de verificação, terminologia, procedimentos confirmados e padrões operacionais podem gerar uma lição privada.

Uma correção isolada não vira verdade universal. A lição deve ser redigida de forma condicional, por exemplo: `em casos semelhantes, considerar/verificar...`.

Quando uma nova correção corresponde a uma lição privada existente, a lição é reforçada por `confirmations` e `confidence` em vez de criar cópias.

## O que não vira memória reutilizável

- preço, proposta, margem ou informação comercial de concorrente;
- senha, token, API key, secret key ou outra credencial;
- telefone, e-mail, CPF ou outro dado pessoal detectado;
- qualquer conteúdo que a etapa de sanitização considere inseguro para generalização.

Esses conteúdos podem ser necessários na operação atual, mas não são promovidos a `ai_lessons`.

## Tabelas por aplicativo

Cada Supabase operacional possui suas próprias tabelas:

- `ai_interactions`: registra a assistência e permite ligar a correção à resposta que a originou;
- `ai_feedback`: registra o resultado da correção e seu escopo de retenção;
- `ai_lessons`: memória reutilizável, com confiança, confirmações, tags e escopo.

Todas ficam com RLS habilitado, sem grants para `anon` ou `authenticated`. O acesso ocorre exclusivamente no backend com a credencial server-side do projeto operacional.

## Fluxo Zeus — diagnóstico

1. O usuário autenticado solicita assistência.
2. A API valida conta e acesso ao Zeus na Store.
3. O Zeus consulta apenas lições relevantes do Supabase Zeus para aquela empresa, mais conhecimento de aplicativo explicitamente aprovado.
4. A Groq recebe o caso atual e as poucas lições relevantes como referências, nunca como fatos provados.
5. A resposta é registrada com um `interactionId`.
6. Se o técnico alterar a sugestão antes de salvar, o sistema pergunta se a correção deve melhorar futuras sugestões da empresa.
7. Se autorizado, a correção passa por filtros de sensibilidade e por uma etapa de generalização da Groq.
8. A lição segura é criada ou reforça uma lição já existente.

## Princípio de qualidade

Memória não substitui evidência. Em qualquer conflito, o caso atual prevalece. A IA deve separar fato observado, hipótese e verificação recomendada e nunca inventar medição, teste, peça, código de falha ou causa.
