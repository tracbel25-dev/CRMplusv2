# R2 — Zeus e Artemis

## Regra

Cada aplicativo usa credenciais e bucket próprios. O backend nunca recebe um `app` arbitrário além de `zeus` ou `artemis` e seleciona as variáveis correspondentes no servidor.

### Zeus

- `ZEUS_R2_ACCOUNT_ID`
- `ZEUS_R2_ACCESS_KEY_ID`
- `ZEUS_R2_SECRET_ACCESS_KEY`
- `ZEUS_R2_BUCKET`

Uso atual: **Fotos e evidências da ordem de serviço**.

Quando há sessão válida da CRM PLUS Store e acesso ao Zeus, a foto é enviada ao R2 e o `localStorage` guarda apenas a referência do objeto e uma URL assinada temporária. Ao abrir novamente, uma nova URL privada é gerada.

Sem sessão, o Zeus preserva o comportamento local anterior para imagens de até 750 KB. Isso mantém a fase atual do produto funcionando sem tornar o bucket público.

### Artemis

- `ARTEMIS_R2_ACCOUNT_ID`
- `ARTEMIS_R2_ACCESS_KEY_ID`
- `ARTEMIS_R2_SECRET_ACCESS_KEY`
- `ARTEMIS_R2_BUCKET`

O backend R2 está preparado e isolado para o Artemis. O app atual ainda não possui formulário de imagem/arquivo em produtos, pedidos ou cardápio, por isso nenhuma função artificial foi adicionada somente para consumir o bucket.

## Segurança

- nenhuma credencial R2 usa `NEXT_PUBLIC_`;
- `SECRET_ACCESS_KEY` só é lida no servidor;
- objetos são gravados sob `accounts/<accountId>/...`;
- leitura, upload e remoção exigem sessão válida na Store;
- o backend confirma que a conta possui o aplicativo ativo e que o membro possui acesso;
- uma conta não pode solicitar a URL de objeto pertencente a outro `accountId`;
- URLs de leitura são temporárias e assinadas;
- formatos aceitos pelo backend: JPG, PNG, WEBP e PDF;
- limite atual por arquivo: 8 MB;
- limite básico por instância: 20 uploads/minuto por usuário/app.

## Persistência operacional

A integração R2 não altera a decisão atual de manter os dados operacionais em `localStorage`. R2 é usado somente para objetos/arquivos.
