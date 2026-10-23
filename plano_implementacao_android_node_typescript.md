# Plano de implementação do aplicativo Android de mensagens

**Android Kotlin e servidor Node com TypeScript**

22 de outubro de 2026  |  Versão 1.0  |  Planejamento técnico

O objetivo é construir um APK de uso pessoal que, após uma configuração manual, registre o aparelho no servidor quando houver conectividade, passe a observar mensagens de saída elegíveis e envie registros criptografados. O backend será desenvolvido em Node.js com TypeScript.

A primeira entrega será uma prova de captura no aparelho real. Só depois de comprovar cobertura útil no WhatsApp o desenvolvimento avança para o fluxo completo e para Instagram e Messenger. O resultado será um arquivo de mensagens observadas, com cobertura documentada por aplicativo e versão.

## Escopo e decisões

| Item | Definição |
| --- | --- |
| Confirmado | Contas pessoais; instalação manual por APK; configuração e acessos concedidos no aparelho; registro e sincronização automáticos; servidor Node.js e TypeScript. |
| Primeira versão | Um proprietário, um aparelho conhecido, texto em conversas individuais do WhatsApp. Instagram e Messenger entram em etapas próprias. |
| Premissa de criptografia | Para estimar o MVP, o servidor poderá decifrar para validar registros e atender consultas autorizadas; o banco guarda conteúdo cifrado. Esta decisão proposta ainda é ajustável. |
| Consulta inicial | API autenticada e ferramentas de teste. Um painel web elaborado fica para uma entrega posterior. |
| Extensões posteriores | Áudios, fotos, vídeos, grupos, histórico retroativo completo e suporte a vários modelos de celular exigem novas validações. |

## Critério central de investimento

Se a prova não distinguir mensagens de saída de histórico ou de outros elementos com qualidade útil, o escopo deve ser revisto antes de investir no backend completo. Acessibilidade expõe conteúdo da interface e pode fornecer dados desatualizados; não é uma API oficial de confirmação de envio. [S1]

As estimativas são de esforço de engenharia. O plano não representa implementação concluída nem teste já executado no aparelho.

## 1. Arquitetura proposta

A aplicação terá três responsabilidades separadas: observar mensagens elegíveis, persistir registros cifrados e sincronizá-los. Essa separação permite testar o transporte com dados sintéticos enquanto a captura é validada no Android.

| Camada | Escolha proposta | Responsabilidade |
| --- | --- | --- |
| App Android | Kotlin e Jetpack Compose | Configuração, estado, seleção dos apps, pausa e diagnóstico. |
| Captura | AccessibilityService e adaptadores por app | Interpretar informações expostas por interfaces validadas. |
| Persistência local | Room sobre SQLite | Fila transacional de envelopes já cifrados e metadados mínimos. |
| Sincronização | WorkManager e cliente HTTPS | Registro, envio em lotes, retomada e confirmação. |
| Criptografia | JWE; Nimbus no Android e jose no Node | Formato padronizado e teste de interoperabilidade. |
| Backend | Node.js LTS, TypeScript strict e Fastify | Pareamento, identidade, ingestão, consulta e revogação. |
| Banco e operação | PostgreSQL, migrações SQL e contêineres | Integridade, recuperação, retenção e implantação reproduzível. |

Room oferece persistência local sobre SQLite; a documentação prevê sua combinação com WorkManager e um backend próprio. Room sozinho não deve ser tratado como criptografia do conteúdo. O plano grava o envelope cifrado antes de inseri-lo na fila. [S2]

### Organização do código

No Android, separar os módulos de interface, configuração, captura, correlação, criptografia, fila e sincronização. Cada mensageiro terá um adaptador independente e uma versão de interpretação registrada no evento. No backend, separar os módulos de pareamento, dispositivos, observações, chaves, consulta e operação.

Um repositório pode conter android/, server/, contracts/ e infra/. O diretório contracts/ guarda OpenAPI, esquemas JSON e exemplos sintéticos do protocolo; não tenta compartilhar código Kotlin com TypeScript. Fixar versões das dependências e da linha LTS do Node ao iniciar a implementação.

### Escolhas de simplicidade

Um único serviço HTTP e o PostgreSQL atendem ao primeiro recorte. A fila durável pertence ao Android. Não há necessidade inicial de broker, Redis, microsserviços ou conexão permanente com o servidor. Fastify fornece validação e serialização por esquema para restringir entradas e respostas. [S3]

## 2. Configuração e estados de funcionamento

### Sequência operacional

1. Na primeira abertura, informar o destino do servidor, inserir o pareamento, selecionar os apps e habilitar os acessos nas configurações do Android. A ativação do serviço depende de ação local do usuário. [S1]
2. Salvar a preferência de iniciar automaticamente após o registro. Até haver cadastro válido, manter a coleta operacional desabilitada.
3. Com rede disponível e execução permitida pelo sistema, registrar a instalação. Persistir a identidade, a credencial protegida e a chave pública do destinatário antes de mudar para ativo.
4. Com cadastro válido, preferência ativa, serviço conectado e adaptador compatível, observar mensagens elegíveis. Registrar, cifrar e persistir os eventos antes de agendar o envio.
5. Após esse primeiro registro, continuar enfileirando offline. Quando houver conectividade, sincronizar as pendências sem criar um novo dispositivo.
6. Pausar, revogar ou perder uma condição necessária altera o estado visível. Retomar nunca concede novamente uma permissão que o usuário revogou.

| Dimensão | Estados que precisam ser distinguidos |
| --- | --- |
| Vínculo | Não configurado; aguardando registro; registrado; revogado. |
| Acesso Android | Não concedido; habilitado mas serviço desconectado; conectado; revogado. |
| Coleta | Desativada; ativa; pausada; incompatível; bloqueada por limite local. |
| Sincronização | Sem pendências; aguardando rede; enviando; nova tentativa; bloqueada por credencial ou chave. |

### Comandos e efeitos

Pausar tudo impede novas observações e novos lotes, preserva os dados pendentes e tenta cancelar o trabalho em curso. Uma requisição já recebida pelo servidor pode concluir; a interface deve comunicar esse limite. A preferência de pausa permanece após reinício e atualização do APK.

Desvincular desativa localmente coleta e envio e solicita revogação ao servidor. Se estiver offline, a revogação remota fica pendente e isso é mostrado ao usuário. O destino da fila deve ser explícito: preservar para exportação autorizada ou apagar por escolha do proprietário.

A revogação no servidor bloqueia novas requisições assim que efetivada. Um aparelho offline só toma conhecimento ao se comunicar novamente. Não prometer parada remota instantânea da coleta offline.

## 3. Prova de captura e critérios de avanço

Usar o aparelho e as contas do proprietário, com conversas de teste controladas. A prova registra somente evidências necessárias para medir a captura; não precisa enviar conteúdo real ao servidor. Na primeira tarefa, anotar modelo, versão do Android, idioma e versões dos mensageiros.

### Perguntas que a prova precisa responder

- O texto, a conversa e a direção da mensagem estão disponíveis com evidência suficiente? Campos ausentes permanecem ausentes; não devem ser inferidos como fatos.
- É possível distinguir nova observação de conteúdo reapresentado após reabertura, rolagem, troca de conversa ou recriação do processo?
- Os indicadores permitem diferenciar pendência de envio de mensagem exibida como enviada? Quando não permitem, registrar estado desconhecido.
- Duas mensagens legítimas com o mesmo texto continuam distinguíveis? Um hash de texto, conversa e minuto não é uma identidade suficiente.

### Experimento inicial

Executar cerca de 100 ações controladas, com uma planilha de referência produzida manualmente: textos curtos e longos, acentos e emoji, mensagens idênticas em sequência, pendência de rede, edição, troca de conversa e reabertura de histórico. Definir os casos elegíveis antes de medir; falhas não devem ser removidas do denominador.

| Métrica | O que medir |
| --- | --- |
| Cobertura | Mensagens elegíveis corretamente observadas divididas pelas mensagens elegíveis enviadas no teste. |
| Falsos registros | Rascunhos, elementos alheios ou conteúdo antigo classificados incorretamente como nova saída. |
| Repetições | A mesma mensagem gerando novos registros de captura ao reaparecer. |
| Inconclusivos | Casos em que conversa, direção, novidade ou estado não podem ser estabelecidos. |
| Tempo | Latência da observação local, separada da latência de sincronização. |

Meta experimental proposta: observar pelo menos 95% dos textos simples elegíveis com a conversa aberta no aparelho testado, sem classificar rascunhos como enviados e sem confundir os casos controlados de histórico. A meta é um critério de avanço, não uma taxa de funcionamento já demonstrada.

### Decisão ao final da prova

Avançar quando os campos necessários estiverem disponíveis e os erros forem compreendidos e aceitáveis. Se novidade, direção ou conversa continuarem sistematicamente ambíguas, reduzir o requisito para arquivo de mensagens observadas ou suspender o adaptador. O relatório deve preservar a cobertura real, inclusive os casos que falharam.

Uma mensagem sincronizada de outro dispositivo pode aparecer no celular. Registrar o aparelho observador, sem afirmar que ele foi o aparelho de origem. Edição e exclusão só recebem relação explícita quando houver evidência; desaparecer da tela não comprova exclusão.

## 4. Implementação do aplicativo Android

| Tarefa | Entrega | Critério de conclusão |
| --- | --- | --- |
| A01 Configuração | Tela de servidor, pareamento, apps e acessos. | Sem registro e autorização local não há coleta operacional. |
| A02 Estado real | Combinar preferência, vínculo, acesso e conexão do serviço. | Não mostrar ativo apenas por existir uma preferência salva. |
| A03 Adaptador inicial | Interpretação validada do WhatsApp. | Reproduzir a medição da prova com versão identificada. |
| A04 Observação | Modelo comum e correlação conservadora. | Rascunhos e conteúdo antigo não viram envios confirmados. |
| A05 Criptografia | Cifrar e persistir envelope antes de envio. | A fila não contém texto de mensagens em claro. |
| A06 Fila | Transações, IDs estáveis, estados e limites. | Reabrir processo recupera itens já persistidos. |
| A07 Sincronização | Trabalhos únicos com rede disponível. | Retentativas usam os mesmos IDs e envelopes. |
| A08 Controles | Pausa, retomada, desvinculação e diagnóstico. | Pausa persiste e não é desfeita pelo servidor ou reinício. |
| A09 APK | Assinatura, versão e atualização manual. | Atualização preserva configuração, identidade e fila. |

### Persistência e agendamento

Usar Room para a fila e os metadados transacionais. Configurações não sensíveis podem ficar em um armazenamento de preferências separado. Proteger a credencial com uma chave do Android Keystore; o Keystore guarda a chave usada para proteção, não uma string de token como se fosse uma chave criptográfica. [S2, S8]

O WorkManager deve receber referências ao trabalho, e não conteúdo das mensagens. Ele drena a fila em tarefas finitas com condição de rede e reagendamento após falhas. A execução não é instantânea garantida; condições e otimizações do Android podem adiá-la. Não usar polling contínuo para simular uma conexão permanente. [S4]

### Comportamento diante de mudanças

Uma versão não reconhecida do mensageiro exige revalidação. Se a estrutura observada deixar de satisfazer os critérios do adaptador, apresentar incompatibilidade e interromper a classificação daquele app. Manter os registros já persistidos disponíveis para sincronização autorizada.

O listener de notificações fica fora da primeira versão centrada em mensagens enviadas. Caso seja adicionado para recebidas, será uma fonte separada, com habilitação própria e sem confundir notificações com confirmação de envio. [S10]

## 5. Backend e contrato de API

Implementar um serviço Fastify em TypeScript estrito, com validação de entrada, autenticação por escopo, acesso ao PostgreSQL, erros estáveis e logs operacionais sem conteúdo. Os esquemas são definidos no servidor. O dispositivo pode enviar registros e consultar seu estado; somente o proprietário pode ler mensagens e administrar o vínculo. [S3]

| Método e rota | Acesso | Responsabilidade |
| --- | --- | --- |
| POST /v1/enrollments | Proprietário | Criar pareamento com validade e uso único. |
| POST /v1/devices/register | Pareamento | Registrar instalação e emitir credencial. |
| GET /v1/devices/me | Dispositivo | Consultar situação e configuração. |
| GET /v1/crypto/recipient-key | Dispositivo | Obter chave pública ativa e kid. |
| POST /v1/observations/batch | Dispositivo | Receber lote e confirmar por registro. |
| GET /v1/observations | Proprietário | Listar metadados com paginação por cursor. |
| GET /v1/observations/:id | Proprietário | Consultar conteúdo autorizado. |
| POST /v1/devices/:id/revoke | Proprietário | Revogar credencial e vínculo. |
| DELETE /v1/observations/:id | Proprietário | Excluir um registro autorizado. |

### Identidade e pareamento

Gerar um identificador aleatório de instalação e uma credencial opaca individual, revogável e com política de expiração. O servidor guarda o hash da credencial. A identidade do proprietário tem autenticação separada; no MVP, a administração pode usar uma ferramenta local autenticada, sem implementar um painel web completo.

O pareamento deve expirar e ser consumido transacionalmente. Um installationId não é prova de identidade. Se o servidor cadastrar o aparelho mas a resposta se perder, a recuperação precisa comprovar o mesmo pareamento; nunca entregar credenciais apenas ao receber um UUID.

Primeira implementação: repetir o registro sem criar duplicatas e, se a resposta de credenciais não puder ser recuperada com segurança, solicitar novo código manual para reemitir uma credencial e revogar a anterior. Uma recuperação totalmente automática desse caso fica condicionada a um protocolo autenticado e testado.

### Critérios de ingestão

Autenticar e limitar o lote. Antes de aceitar um novo registro, verificar a tag do JWE, validar o esquema decifrado e comparar eventId e deviceId com a requisição autenticada; persistir o envelope original. Usar respostas por item: accepted, already_received, rejected_permanent ou retryable. Rejeições permanentes ficam visíveis no app, sem novas tentativas infinitas.

## 6. Dados e garantias de entrega

| Entidade | Campos essenciais |
| --- | --- |
| devices | ID, proprietário, installationId, estado, hash da credencial, versão, último contato e revogação. |
| enrollments | Proprietário, hash do código, expiração, consumo e instalação vinculada. |
| observations | deviceId, eventId, JWE, hash do envelope, schemaVersion e receivedAt. |
| key_versions | kid, chave pública, referência segura da chave privada, ativação e retirada. |
| audit_events | Ações administrativas, resultado e horário, sem mensagens ou segredos. |
| Fila local | eventId, envelope, estado, tentativas, próxima tentativa, erro estável e confirmação. |

### Conteúdo dentro do envelope

Incluir eventId, deviceId, origem observada, versão do mensageiro, versão do adaptador, texto, identificação disponível da conversa, observedAt, horário exibido quando disponível e qualidade da identificação. Armazenar data e hora absolutas em UTC; preservar separadamente o texto do horário exibido se não houver informação suficiente para convertê-lo.

O relógio do celular pode estar incorreto. receivedAt é atribuído pelo servidor e observedAt pelo aparelho; nenhum dos dois deve ser apresentado como confirmação oficial do horário de envio da plataforma. O texto e os identificadores da conversa ficam cifrados. Metadados externos devem ser mínimos e documentados.

### Idempotência de transporte

Criar unicidade por deviceId e eventId. Para o mesmo ID e o mesmo envelope, responder already_received. Se o mesmo ID chegar com bytes diferentes, devolver conflito e preservar o original. Só responder accepted depois do commit durável. PostgreSQL fornece restrições e ON CONFLICT para implementar a decisão transacional. [S9]

Gerar eventId uma vez, ao criar o registro local, e persistir o envelope cifrado. Uma retentativa transmite os mesmos bytes. Recriptografar o mesmo evento em toda tentativa produziria envelopes diferentes e atrapalharia a detecção de conflito.

### Tratamento da fila

Uma confirmação parcial remove somente itens aceitos ou já recebidos. Erros temporários retornam à fila com espera crescente; 401, revogação e erro de chave exigem tratamento próprio. Registros rejeitados permanentemente ficam em estado de diagnóstico. Um reinício pode repetir envios; a idempotência absorve essa repetição.

Proposta inicial de limites: até 100 eventos ou 512 KiB por lote e 50 MiB para a fila cifrada, ajustáveis após medição. Ao atingir o limite local, pausar novas capturas e avisar. Não descartar silenciosamente dados. O transporte preserva o que já foi persistido; não recupera eventos de interface que nunca foram capturados.

## 7. Criptografia e gestão das chaves

Adotar JWE como formato de transporte e de armazenamento do conteúdo. O app cifra cada observação antes de gravá-la na fila. O servidor armazena o envelope original e só disponibiliza conteúdo a uma consulta autorizada. HTTPS com validação de certificado continua obrigatório. [S5, S12]

| Decisão | Configuração proposta |
| --- | --- |
| Formato | JWE compacto; alg, enc e kid no cabeçalho protegido; schemaVersion no payload autenticado. |
| Algoritmos | RSA-OAEP-256 para proteger a chave de conteúdo e A256GCM para o payload. |
| Android | Nimbus JOSE + JWT, com compatibilidade a confirmar no aparelho de referência. |
| Node e TypeScript | Biblioteca jose, lista fixa de algoritmos permitidos e validação do contexto. |
| Chave do destinatário | Pública obtida do servidor autenticado; privada fora do APK e do banco de mensagens. |
| Segredos locais | Chave no Android Keystore para proteger a credencial e auxiliares sensíveis. |

Nimbus documenta suporte a Java/Android e aos algoritmos propostos; jose documenta JWE no Node.js. A escolha precisa ser comprovada por um teste de interoperabilidade, não apenas por uma lista de dependências. [S6, S7]

### Teste obrigatório antes da integração

Cifrar no Android e decifrar no Node dados sintéticos com acentos, emoji, texto longo e quebras de linha. Alterar header, ciphertext ou tag deve provocar rejeição. Confirmar SHA-256 também no MGF1 do RSA-OAEP-256; a documentação Android alerta para diferenças de defaults entre provedores. Bibliotecas geram chaves e IVs; não fixar IV nem implementar primitivas manualmente. [S11, S13]

Vincular eventId e deviceId ao conteúdo autenticado e compará-los com os identificadores externos e a credencial da requisição. Cifrar para a chave pública não autentica, por si só, o aparelho remetente. A API continua exigindo a identidade individual do dispositivo.

### Rotação recuperação e leitura

Novos registros usam a chave pública ativa. Preservar chaves privadas anteriores enquanto houver arquivos ou filas que dependam delas. Backup só é recuperável se dados, referências e chaves necessárias puderem ser restaurados; testar esse procedimento sem incluir chaves e mensagens em logs. [S8]

Premissa do MVP: o servidor consegue decifrar. Se a decisão for impedir leitura pelo servidor, a chave privada deverá ficar no dispositivo de consulta; recuperação, busca e interface mudam. Essa alternativa deve ser fechada na fase F0, antes de implementar o protocolo e o acesso aos dados.

## 8. Fases dependências e estimativas

Estimativas de engenharia para um desenvolvedor com experiência em Kotlin e Node.js, um aparelho de referência e consulta por API. São faixas de esforço, sem compromisso de prazo; não incluem aprendizado da plataforma ou um painel elaborado.

| Fase | Entrega | Depende de | Esforço |
| --- | --- | --- | --- |
| F0 | Recorte, aparelho, leitura pelo servidor e contrato de estados. | Início | 4 a 8 h |
| F1 | Prova local de captura WhatsApp e relatório de cobertura. | F0 | 16 a 32 h |
| F2 | Contrato OpenAPI e teste JWE Kotlin para Node. | F1 aprovada | 8 a 16 h |
| F3 | App com configuração, estados, fila e agendamento. | F2 | 24 a 40 h |
| F4 | Backend com pareamento, ingestão, consulta e chaves. | F2 | 32 a 56 h |
| F5 | Integração e recuperação das falhas prioritárias. | F3 e F4 | 16 a 28 h |
| F6 | Piloto, operação, APK assinado e documentação. | F5 | 8 a 16 h |
| F7 | Adaptador e testes específicos do Instagram. | F6 e prova própria | 16 a 32 h |
| F8 | Adaptador e testes específicos do Messenger. | F6 e prova própria | 16 a 32 h |

MVP WhatsApp: 108 a 196 horas de esforço. Com reserva de 20% a 30%, planejar aproximadamente 130 a 255 horas. Os três aplicativos, se as provas forem viáveis: 140 a 260 horas antes da reserva, ou aproximadamente 170 a 340 horas com reserva.

O piloto exige ainda 3 a 7 dias corridos de observação; apenas as horas de revisão e correção estão estimadas em F6. A 10 horas de trabalho por semana, o orçamento do MVP corresponde a cerca de 13 a 26 semanas. O calendário deve ser ajustado à disponibilidade real.

### Entregas de cada passagem

- F1: matriz do aparelho, casos controlados, métricas e decisão explícita de avançar ou revisar.
- F2: esquemas e exemplos sintéticos, erros definidos e teste cruzado de cifra passando.
- F3 e F4: fluxo funcional com mensagens sintéticas e controles de pausa e revogação.
- F5: relatório dos testes críticos, sem perda silenciosa de itens persistidos nem duplicatas de transporte.
- F6: APK e servidor reproduzíveis, restauração comprovada e limitações conhecidas documentadas.

F3 e F4 podem avançar em paralelo após congelar o contrato. A soma de esforço não diminui automaticamente com duas pessoas. Instagram e Messenger reaproveitam a infraestrutura, mas cada um precisa de uma validação independente de captura.

## 9. Backlog para iniciar o desenvolvimento

Transformar os itens abaixo em tarefas do repositório. Cada uma deve produzir uma evidência verificável, não apenas código compilando.

| ID | Tarefa | Aceite verificável |
| --- | --- | --- |
| P01 | Registrar aparelho, Android, idioma e versões dos apps. | Matriz de suporte inicial preenchida. |
| P02 | Definir tipo de observação, captura ativa e pausas. | Contrato distingue observação, pendência e confirmação. |
| P03 | Criar prova local WhatsApp com dados controlados. | Relatório contém cobertura e falsos registros. |
| P04 | Escolher quem possui a chave de leitura. | Decisão registrada antes do protocolo. |
| P05 | Definir schemas e resposta por item. | Exemplos válidos, inválidos e repetidos documentados. |
| P06 | Executar cifra cruzada Android e Node. | Texto íntegro; alterações e algoritmos indevidos rejeitados. |
| P07 | Criar pareamento, identidade e revogação. | Código expirado e token revogado não autorizam envio. |
| P08 | Persistir fila cifrada e aplicar limites. | Encerrar processo não perde itens confirmados localmente. |
| P09 | Implementar ingestão e confirmação após commit. | Resposta perdida seguida de reenvio cria um único registro. |
| P10 | Implementar trabalho finito de sincronização. | Offline retém fila; retorno de rede retoma quando permitido. |
| P11 | Criar consulta autorizada e retenção. | Proprietário lê; token do dispositivo não lê histórico. |
| P12 | Concluir testes no aparelho e operação. | Pausa, atualização, restauração e piloto documentados. |

### Primeiras sessões de trabalho

Começar por P01, P02 e P03. Esse recorte responde à maior incerteza do projeto. Um protótipo de transporte pode ser preparado com eventos sintéticos, mas a construção do backend completo depende da decisão da prova de captura.

Depois da prova, executar P04, P05 e P06 em conjunto: a localização da chave de leitura altera o contrato e os testes. Só então distribuir as tarefas de Android e servidor para avançar em paralelo.

A cada alteração de parser ou de versão do mensageiro, repetir os cenários que verificam identidade da conversa, direção, histórico e mensagens idênticas. Não é necessário repetir toda a infraestrutura de transporte se ela não tiver sido alterada e não houver risco novo.

## 10. Testes da captura e do aplicativo

| Cenário | Resultado esperado |
| --- | --- |
| Instalar sem configurar | Nenhuma coleta operacional ou envio de conteúdo. |
| Cadastro concluído sem acesso Android | Estado bloqueado por acesso; não mostrar ativo. |
| Digitar e apagar rascunho | Não registrar como mensagem enviada. |
| Reabrir conversa e carregar histórico | Não transformar reapresentação em envio novo ocorrido agora. |
| Dois textos idênticos sucessivos | Preservar ambos quando distinguíveis; não deduplicar só por texto. |
| Envio pendente ou falho | Estado pendente ou desconhecido; sem confirmação inventada. |
| Mensagem sincronizada de outro aparelho | Identificar o observador, sem inventar o dispositivo de origem. |
| Editar ou remover conteúdo | Associar somente quando houver evidência; ausência não comprova exclusão. |
| Trocar conversa durante processamento | Não atribuir texto à conversa incorreta. |
| Revogar acessibilidade | Parar novas observações e apresentar a causa. |
| Pausar com lote agendado | Não iniciar nova coleta ou lote; esclarecer eventual requisição em curso. |
| Reiniciar aparelho ou processo | Respeitar pausa e permissões; recuperar registros já persistidos. |
| Atualizar APK | Preservar dados, identidade e ativação anterior, com a mesma assinatura. |
| Atualizar mensageiro | Revalidar compatibilidade; falha reconhecida não gera classificação inventada. |
| Fila atingir limite | Pausar captura, preservar pendências e mostrar o motivo. |

### Como avaliar a captura

Usar casos com resultado conhecido e compará-los com as observações. Testes de funções ajudam na normalização e correlação, mas o aceite depende do aparelho real. Registrar versões, quantidade de casos, omissões, falsos registros e inconclusivos.

Uma falha na captura antes da persistência não é uma falha de transporte. As duas métricas devem aparecer separadas no relatório. A conclusão do piloto vale somente para o aparelho, versões e recorte observados.

## 11. Testes do servidor e da sincronização

| Cenário | Resultado esperado |
| --- | --- |
| Registro com resposta perdida | Não multiplicar instalações; recuperação comprova pareamento ou exige novo código. |
| Código expirado ou consumido | Rejeitar a tentativa; não autorizar pela instalação isoladamente. |
| Rede disponível sem acesso ao servidor | Manter pendências e reagendar; conectividade não significa entrega. |
| Servidor grava e a resposta se perde | Reenvio do mesmo eventId e envelope retorna já recebido. |
| Mesmo eventId e envelope diferente | Conflito explícito, sem sobrescrever o original. |
| Confirmação parcial do lote | Remover apenas os itens confirmados. |
| Processo termina durante upload | Retomar fila; retentativas preservam os IDs e os bytes. |
| Token revogado ou de outro aparelho | Bloquear ingestão e acesso indevido; não processar conteúdo como autorizado. |
| Revogação remota enquanto offline | Servidor já bloqueia; app aprende a revogação na próxima comunicação. |
| JWE alterado ou algoritmo fora da lista | Rejeitar; nunca aceitar texto parcialmente decifrado. |
| eventId ou deviceId incompatível | Comparar envelope e autenticação; rejeitar inconsistência. |
| Rotação com fila antiga pendente | Aceitar e recuperar envelopes de chaves ainda válidas para transição. |
| Restauração de backup | Recuperar dados e chaves, testar leitura autorizada de amostras. |
| Logs e erros de produção | Não expor texto, token, pareamento, chave privada ou envelope completo. |

### Testes que sustentam a entrega

Automatizar idempotência, limites, escopos de autenticação, transações, adulteração criptográfica e compatibilidade do contrato. Incluir ao menos um teste que interrompa a resposta depois do commit e outro que encerre o app com itens pendentes.

Não depender apenas de testes com banco em memória. Validar a unicidade e a transação com PostgreSQL real em ambiente de teste. Usar dados sintéticos e credenciais específicas de teste. Os cenários no telefone devem verificar também o comportamento de energia e de segundo plano observado naquele modelo.

## 12. Operação e critérios de conclusão

### Implantação inicial

Preparar um ambiente com API Node, PostgreSQL e HTTPS. Usar migrações reproduzíveis, credenciais por ambiente, limites de requisição e health checks que não revelem segredos. O proprietário terá autenticação separada e poderá consultar o vínculo, revogar o dispositivo e excluir registros.

Guardar a chave de assinatura do APK em local protegido, com cópia de recuperação. Atualizações manuais usam a mesma assinatura e devem preservar a fila. Durante desenvolvimento, usar os meios oficiais de instalação e teste do Android. A documentação vigente mantém ADB como fluxo de desenvolvimento; conferir as regras do canal de distribuição quando houver expansão. [S14]

### Retenção e observabilidade

Proposta de partida: apagar itens locais após confirmação e manter registros no servidor por 90 dias, configurável. A retenção deve ser escolhida na fase F0. Backups seguem uma janela própria documentada; excluir do banco não equivale a remover instantaneamente todas as cópias de backup.

Medir quantidade e idade do item mais antigo da fila, sucesso de sincronização, falhas por motivo, estado do serviço, incompatibilidades por app e consumo durante o piloto. Logs registram contagens e códigos de erro, sem conteúdo das mensagens. Uma visão de saúde exibe último envio confirmado e número de pendências.

### Conclusão do MVP

- O fluxo configuração manual, registro, captura autorizada, fila cifrada e confirmação funciona no aparelho de referência.
- A prova de captura tem resultados documentados e cobertura útil no recorte escolhido.
- Os testes críticos de filas, idempotência, autorização e interoperabilidade criptográfica passam.
- Pausa, desvinculação, limite de armazenamento e falhas de permissão apresentam estados claros.
- O piloto de 3 a 7 dias não revela perda silenciosa de registros persistidos ou duplicação de transporte.
- O APK assinado, as migrações, a configuração do servidor e a restauração podem ser reproduzidos.

### Expansão para os outros mensageiros

Instagram e Messenger reutilizam pareamento, criptografia, fila e API. Cada nova integração começa por uma prova local e acrescenta sua própria matriz de compatibilidade. A expansão não muda o significado do registro: continua sendo uma observação da interface, com origem e incerteza preservadas.

A decisão técnica imediata é executar a prova do WhatsApp no aparelho escolhido. A decisão de produto pendente é quem poderá decifrar as mensagens; o planejamento adota leitura autorizada pelo servidor para dimensionar o primeiro MVP.

## 13. Referências técnicas

Documentação oficial e dos mantenedores consultada em 22 de outubro de 2026. As referências sustentam capacidades e limites das tecnologias; arquitetura, metas e estimativas são propostas deste plano.

**[S1] Android AccessibilityService.** Ativação manual, ciclo de vida e conteúdo da janela. [Abrir fonte](https://developer.android.com/reference/android/accessibilityservice/AccessibilityService)

**[S2] Android Room.** Persistência local e combinação com sincronização. [Abrir fonte](https://developer.android.com/training/data-storage/room)

**[S3] Fastify Validation and Serialization.** Validação e serialização com esquemas. [Abrir fonte](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)

**[S4] Android Define work requests.** Condições, reagendamento e limites de tempo. [Abrir fonte](https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work)

**[S5] RFC 7516 JSON Web Encryption.** Formato JWE e criptografia autenticada. [Abrir fonte](https://www.rfc-editor.org/rfc/rfc7516)

**[S6] Nimbus JOSE and JWT.** Biblioteca Java e Android e algoritmos disponíveis. [Abrir fonte](https://connect2id.com/products/nimbus-jose-jwt)

**[S7] jose.** Biblioteca de JWE e JOSE para Node.js. [Abrir fonte](https://github.com/panva/jose)

**[S8] Android Keystore.** Proteção e uso das chaves locais. [Abrir fonte](https://developer.android.com/privacy-and-security/keystore)

**[S9] PostgreSQL INSERT.** Inserção, conflitos e unicidade. [Abrir fonte](https://www.postgresql.org/docs/current/sql-insert.html)

**[S10] Android NotificationListenerService.** Eventos de notificações e conexão do serviço. [Abrir fonte](https://developer.android.com/reference/android/service/notification/NotificationListenerService)

**[S11] Android Cryptography.** Algoritmos e diferenças de parâmetros OAEP. [Abrir fonte](https://developer.android.com/privacy-and-security/cryptography)

**[S12] Android Network security configuration.** Configuração de confiança e restrição de HTTP. [Abrir fonte](https://developer.android.com/privacy-and-security/security-config)

**[S13] RFC 7518 JSON Web Algorithms.** Definição de RSA-OAEP-256 e A256GCM. [Abrir fonte](https://www.rfc-editor.org/rfc/rfc7518)

**[S14] Android Developer Verification FAQ.** Canais de instalação e desenvolvimento por ADB. [Abrir fonte](https://developer.android.com/developer-verification/guides/faq)
