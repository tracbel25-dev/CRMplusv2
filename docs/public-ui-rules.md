# Regras de interface pública — CRM PLUS Store

Estas regras devem ser respeitadas em alterações futuras da landing, catálogo, SEO e páginas públicas.

## Regra comercial obrigatória

**Preços pertencem somente à rota `/planos`.**

As rotas individuais dos aplicativos, como `/aplicativos/zeus`, `/aplicativos/artemis` e equivalentes, devem permanecer limpas e focadas em apresentar o produto.

Nessas rotas é proibido exibir ou embutir:

- preço, mensalidade ou valor promocional;
- texto como "a partir de", "por mês", "R$" ou equivalente;
- tabela ou cards de planos;
- comparação de preços;
- componente `PublicPricing` ou consulta de planos usada para renderizar valores;
- preço em `metadata`, título, descrição, Open Graph, Twitter Card, JSON-LD, dados estruturados ou qualquer outro conteúdo destinado a SEO;
- schema `Offer`, `price`, `priceCurrency` ou informação comercial equivalente que faça mecanismos de busca associarem um valor à página individual do aplicativo.

A página individual pode ter uma ação discreta como **"Conhecer planos"**, apontando para `/planos?app=<slug>`. O valor só aparece depois que o visitante entra na rota de planos.

Essa regra vale para todos os aplicativos atuais e futuros do CRM PLUS Store.

## Tela inicial (/inicio)

- A tela inicial é institucional/comercial e não deve exibir tabela de planos, comparação detalhada de planos ou matriz extensa de funções.
- A home pode direcionar para `/planos`, mas preços e comparações pertencem à rota de planos.
- Evitar blocos longos que quebrem o fluxo da landing.

## Planos (/planos)

- Preços, acessos e diferenças entre planos ficam concentrados nesta rota.
- A comparação deve ser objetiva, visual e responsiva.
- Não adicionar textos auxiliares redundantes quando a própria interface já comunica a informação.
- No mobile, manter todos os planos identificáveis sem exigir rolagem horizontal para entender a comparação.

## Comunicação pública

- Não exibir nomes de fornecedores, infraestrutura ou serviços técnicos na comunicação pública.
- Não citar provedores de IA, banco, storage, hospedagem, deploy, pagamento ou outras dependências técnicas em textos comerciais.
- Não exibir detalhes de implementação, arquitetura, APIs, banco, cloud, chaves, modelos ou integrações na landing e páginas comerciais.
- O cliente deve ver benefícios, funções, preço, acessos, status e ações — não a tecnologia usada por trás.
- Nas páginas individuais dos aplicativos, "preço" continua sendo exceção: deve aparecer somente em `/planos`.

## Catálogo (/aplicativos)

- O catálogo apresenta os aplicativos.
- Não mostrar planos nem valores dentro do catálogo.
- A ação comercial pode direcionar para `/planos`.
- Inclusão ou remoção de aplicativo deve refletir tanto no catálogo quanto na rota `/aplicativos`.

## Proteção contra regressão

O teste `tests/public-ui-rules.test.mjs` protege a rota `/aplicativos/[slug]`.

Qualquer alteração que reintroduza preço, componente de pricing, consulta pública de planos ou marcação de preço/Offer nessa rota deve falhar no `npm test` e, consequentemente, no workflow de verificação do repositório.
