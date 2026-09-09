# Central VitalVeg V9 — Funcionário Digital de IA

## Objetivo
A Central VitalVeg deixa de ser uma caixa de email e passa a ser um funcionário digital operacional. O email é uma fonte de dados e histórico, não a interface principal de trabalho.

## Princípios
1. A IA lê todas as mensagens relevantes e reconstrói o contexto da conversa antes de decidir.
2. A IA transforma emails em ações: encomenda, alteração, confirmação, reclamação, pedido de informação, documento, publicidade, automático, sem ação, rever.
3. A IA extrai qualquer artigo pedido pelo cliente, mesmo que nunca tenha existido no catálogo.
4. Nenhum artigo desaparece por não estar numa lista interna.
5. A IA mostra confiança e sinaliza ambiguidades. Se a leitura for incerta, não inventa: pede validação humana.
6. O operador trabalha por exceção: vê primeiro o que precisa de decisão, não uma lista de emails.
7. Respostas são preparadas pela IA. Na fase inicial, só são enviadas após aprovação explícita do operador.
8. Todas as mensagens geridas pela Central recebem uma assinatura profissional indicando gestão por IA e validação humana.
9. O sistema fica preparado desde já para um futuro modo autónomo, com políticas por tipo de ação.
10. O logótipo VitalVeg usado na interface será apenas o original fornecido pelo utilizador; não recriar, redesenhar ou gerar substitutos.

## Página inicial — Centro de Operações IA
A primeira página deve responder imediatamente a cinco perguntas:
- Quantas encomendas existem para a próxima entrega?
- Quantas mensagens a IA já tratou?
- O que está à espera da minha aprovação?
- Onde existe risco/ambiguidade?
- Qual foi a última sincronização real?

Blocos principais:
- `Próxima entrega` — data, nº de encomendas, clientes, artigos totais.
- `Precisa de mim` — respostas a aprovar, ambiguidades, reclamações, indisponibilidades, pedidos fora da regra.
- `Processado pela IA` — ações concluídas sem necessidade de decisão, mas ainda auditáveis.
- `Alertas` — email desligado, sincronização atrasada, erro IMAP/SMTP, falha de impressão, artigo desconhecido com baixa confiança.
- `Atividade da IA` — cronologia curta do que o funcionário digital fez.

## Fluxo de uma nova mensagem
1. Servidor recebe/sincroniza mensagem e guarda o original.
2. Agrupa por conversa e recupera contexto anterior relevante.
3. IA analisa intenção, urgência, cliente, loja, artigos, quantidades, unidades, datas e alterações.
4. IA produz uma estrutura JSON validada.
5. Motor de regras aplica entrega terça/quinta/sábado e corte das 14:00.
6. Se for encomenda, cria ou atualiza a ordem operacional.
7. Se houver alteração, consolida o pedido final e mantém o histórico das versões.
8. IA prepara resposta sugerida.
9. Política de autonomia decide: `aprovar`, `rever`, ou futuramente `autoexecutar`.
10. Interface mostra apenas o resultado operacional, com acesso ao email original quando necessário.

## Estrutura de análise da IA
Cada análise deve produzir, no mínimo:
- `messageType`
- `confidence` entre 0 e 1
- `needsHumanReview`
- `reviewReasons[]`
- `customerName`
- `customerEmail`
- `storeName`
- `threadIntent`
- `orderAction`: `none | create | amend | cancel | confirm`
- `deliveryDateExplicit`
- `deliveryDateResolved`
- `items[]` com `quantity`, `unit`, `product`, `notes`, `confidence`
- `availabilityMentions[]`
- `complaintSummary`
- `requestedAnswer`
- `suggestedReply`
- `sourceMessageIds[]`

## Regras de encomenda
- Dias de entrega: terça, quinta e sábado.
- Segunda -> terça; quarta -> quinta; sexta -> sábado, salvo indicação explícita.
- Mensagem recebida num dia de entrega antes das 14:00: revisão humana se pretender o próprio dia.
- Após as 14:00 do próprio dia: próxima entrega.
- Datas explícitas no email prevalecem quando inequívocas.
- Emails históricos nunca são reciclados para uma entrega futura.
- `RE:` e alterações pertencem ao ciclo original sempre que o contexto indicar continuidade.
- Última instrução válida do cliente prevalece, mas versões anteriores ficam auditáveis.

## Qualquer artigo é válido
A extração não usa uma whitelist para decidir se uma linha entra na encomenda. O catálogo conhecido serve apenas como ajuda. Uma linha com quantidade/unidade/produto deve ser preservada mesmo que o produto seja novo.

Exemplo:
- `6 molhos nabiças`
- `2 cx agrião`
- `3 kg batata-doce`
- `4 olhos de nabiças`

No último caso, se "olhos" parecer improvável, a IA não apaga a linha. Mantém exatamente o pedido e marca baixa confiança para revisão.

## Estados operacionais
- `IA processou`
- `Aguardando aprovação`
- `Precisa de revisão`
- `Confirmada`
- `Alterada`
- `Preparação`
- `Carregada`
- `Entregue`
- `Encerrada`
- `Histórica`

## Respostas por IA
Na primeira fase:
- IA redige.
- Operador vê contexto, resposta e razões.
- Botões: `Aprovar e enviar`, `Editar`, `Rejeitar`, `Abrir email original`.
- Nunca enviar automaticamente sem política ativa.

Assinatura base obrigatória nas mensagens geridas pelo sistema:

`VitalVeg · Central Inteligente de Comunicações`

`Esta mensagem foi analisada e preparada pelo nosso sistema autónomo com recurso a Inteligência Artificial e validada antes do envio.`

A assinatura poderá ser ajustada por contexto, mas nunca deve afirmar autonomia total enquanto existir validação humana obrigatória.

## Futuro modo autónomo
A arquitetura deve nascer com níveis de autonomia:
- Nível 0 — só analisa e sugere.
- Nível 1 — prepara tudo e pede aprovação antes de enviar.
- Nível 2 — autoexecuta apenas ações de baixo risco previamente autorizadas, por exemplo confirmação simples de receção.
- Nível 3 — autonomia alargada por regras, mantendo auditoria e possibilidade de travão imediato.

Ações que devem continuar bloqueadas por defeito mesmo em modo autónomo:
- descontos/preços fora de tabela;
- reclamações sensíveis;
- indisponibilidades sem alternativa definida;
- alterações de quantidade ambíguas;
- mensagens com confiança baixa;
- decisões comerciais não configuradas.

## Interface
Menu principal:
- Hoje
- Entregas
- Precisa de mim
- Encomendas
- Clientes
- Atividade IA
- Emails / Histórico
- Regras e autonomia
- Definições

`Emails / Histórico` é secundário. Não deve ser o ecrã de entrada.

## Impressão
Impressão deve gerar documento independente da UI, sem depender de elementos escondidos.

Folha diária:
- data de entrega;
- nº total de encomendas;
- cliente/loja;
- nº da ordem;
- artigos e quantidades finais consolidados;
- caixas de verificação: preparado, conferido, carregado, entregue;
- observações;
- paginação limpa e compacta.

## Auditoria
Cada decisão relevante deve registar:
- mensagem de origem;
- análise da IA;
- confiança;
- regra aplicada;
- alterações manuais do operador;
- texto finalmente enviado;
- data/hora;
- utilizador/dispositivo quando aplicável.

## Segurança
- Palavra-passe do email apenas no servidor, cifrada.
- Nunca expor credenciais ao browser após configuração.
- Sessão de dispositivos autorizados independente das credenciais IMAP.
- Respostas e ações exigem autorização segundo política.
- Logs nunca guardam palavras-passe nem segredos.

## Critério de publicação
Não publicar V9 em produção até os fluxos abaixo passarem em teste real:
1. sincronizar Recebidos + Enviados;
2. classificar conversas;
3. transformar uma encomenda nova em ordem;
4. preservar produto desconhecido;
5. aplicar alteração por RE:;
6. não reciclar encomendas históricas;
7. sugerir resposta IA;
8. aprovar e enviar;
9. guardar cópia nos Enviados;
10. imprimir encomendas do dia;
11. usar PC e telemóvel com o mesmo backend;
12. mostrar estado de sincronização verdadeiro;
13. permitir encomenda manual;
14. pesquisar cliente, artigo e ordem;
15. manter assinatura de gestão por IA em todas as mensagens enviadas pela Central.
