# Navegação compacta

- A estrutura corporativa usa abas compartilhadas nas configurações de todos os apps. Cada aplicativo mantém seu design, vocabulário, permissões e módulos.
- Zeus e Kronos agrupam Em aberto e Histórico na mesma área de navegação. As URLs antigas de histórico continuam válidas e o item principal permanece selecionado.
- Artemis separa pedidos Em aberto e Histórico, incluindo cancelados. O histórico continua disponível quando não há pedidos ativos. Alertas, preparo e caixa mantêm seus fluxos existentes.
- Configurações: Dados, Campos, Operação, Acessos e Cópias de dados. Zeus também reúne filtros e orçamento em Preferências. Artemis usa Dados, Canais e delivery, Operação, Cardápio e Acessos.
- Grupos extensos de campos são recolhíveis. Trocar de aba mantém os componentes montados e preserva o preenchimento ainda não salvo.
- Clientes: Dados e abas próprias para os registros associados, como veículos, pedidos e histórico.
- Abas têm navegação por teclado (setas, Home e End), identificação acessível e rolagem horizontal em telas estreitas.
- Esta mudança é de interface. Não modifica schema, projetos, credenciais ou políticas do Supabase.

Verificação local: TypeScript, build de produção e 16 testes operacionais existentes aprovados.
