# Prova WhatsApp — F0/F1

Status: fluxo Android/API/painel implementado com simulação e adaptadores
experimentais; medição em aparelho real ainda não executada. A pedido do
proprietário, a infraestrutura avançou antes do aceite de F1.
Resultados automatizados em [testes.md](testes.md).

## Matriz P01

Preencher usando os valores exibidos no app, sem registrar conversas reais no Git.

| Campo | Valor |
| --- | --- |
| Modelo | Pendente |
| Android / API | Pendente |
| Idioma | Pendente |
| WhatsApp | Pendente |
| Adaptador | accessibility/experimental-1 e notification/experimental-1; não validados no aparelho |

## Roteiro P03

1. Instalar APK debug, parear com o servidor e verificar que começa pausado.
2. Selecionar WhatsApp e as duas fontes; habilitar os acessos manualmente e retomar.
3. Gerar mensagens de demonstração; verificar SIMULADO, participantes, app e fonte no painel.
4. Em conversa controlada, enviar textos com a tela aberta para testar acessibilidade;
   receber notificações para testar MessagingStyle/fallback.
5. Comparar cada observação com a ação original e com a fonte registrada.
6. Pausar; repetir ações e verificar que nenhuma nova captura entra na fila.
7. Encerrar e reabrir o processo: pausa deve permanecer; fila deve ser preservada.
8. Revogar cada acesso: o app deve mostrar o respectivo serviço desconectado.
9. Desligar rede depois do registro, enviar mensagens, reiniciar processo e religar
   rede. Retentativas devem preservar IDs e não duplicar o transporte.
10. Repetir separadamente em Instagram e Messenger; não extrapolar o resultado do WhatsApp.

O parser de tela depende de IDs de views candidatos e de correlação entre
rascunho, clique de enviar e novo nó. Não usa posição do balão como prova de
direção, não importa histórico e não afirma confirmação oficial de envio.
Envio por teclado/voz, estruturas diferentes e dados não expostos podem faltar.
Notificações usam os dados que o app publicou; no fallback não inferem
participantes nem direção. Resumos de grupo e mensagens históricas de notificações
são ignorados; conteúdo de mídia não é extraído. A mesma mensagem nas duas fontes
gera duas observações, sem tentar deduplicá-las apenas por texto.

Para o aceite de captura, executar 100 ações previamente definidas: 20 textos
curtos, 10 longos, 10 com acentos/emoji, 10 idênticos sucessivos, 10 offline,
10 rascunhos apagados, 10 reaberturas de histórico, 10 trocas de conversa,
5 edições e 5 recriações de processo. Fixar elegibilidade antes da execução.
Registrar por ação: ID, cenário, elegível, saída esperada, saída observada,
falso registro, repetição, inconclusivo e latência. Não remover falhas.

Cobertura = acertos / envios elegíveis. Denominador zero significa não medido.
Meta proposta: cobertura >=95%, sem rascunhos classificados como envio e sem
histórico classificado como novo. Sem resultados, não há aprovação de F1.

## Decisões de implementação

- Servidor pode decifrar para consulta autorizada, seguindo a premissa do MVP.
- Retenção padrão de 90 dias, configurável no ambiente.
- Interface Android usa Activity nativa nesta versão; migração para Jetpack Compose
  fica como melhoria de interface, sem impacto no contrato ou no transporte.
- O relatório final deve preservar omissões e incertezas, mesmo com transporte funcionando.
