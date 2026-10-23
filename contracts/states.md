# Estados — P02

Vínculo: não configurado, aguardando registro, registrado, revogado.
Acesso: não concedido, habilitado/desconectado, conectado, revogado.
Coleta: desativada, ativa, pausada, incompatível, bloqueada por limite.
Sincronização: vazia, aguardando rede, enviando, retentativa, bloqueada.

Coleta ativa exige simultaneamente registro válido, preferência ativa, ausência
de pausa, serviço conectado, adaptador validado e espaço na fila.
Rede não é requisito para capturar depois do registro.

Observação não equivale a envio confirmado. Direção e estado de envio começam
como desconhecidos; somente evidências do adaptador validado podem alterá-los.
Reabertura de histórico não comprova novidade. Texto idêntico não comprova identidade.

Implementação 0.2: o proprietário solicitou o fluxo completo antes da prova real.
Adaptadores experimentais podem observar após registro, seleção explícita das
fontes/apps e retomada local. Não são apresentados como validados. O mesmo
transporte aceita observações sintéticas, sempre com `simulated=true` no JWE.

Pausa persiste e bloqueia captura e novos lotes. Pareamento e revogação pendentes
podem concluir enquanto pausado: não transmitem mensagens. Credencial inválida ou
chave ausente pausa e bloqueia; limite local bloqueia captura mas permite drenar a
fila. Respostas aceitas/já recebidas removem somente os respectivos envelopes.
Rejeições permanentes preservam o envelope em diagnóstico. A permissão Android
nunca é concedida automaticamente. Cada fonte tem acesso e seleção separados.

Desvincular pausa imediatamente e tenta revogação. Enquanto offline, o estado
remoto permanece pendente; depois da confirmação, a identidade ativa é removida
localmente. A fila é preservada para exportar, apagar ou recuperar pelo mesmo
servidor com novo pareamento. Troca de servidor exige fila vazia e desvinculação.
