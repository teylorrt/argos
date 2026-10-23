# Verificação da versão 0.2

Verificações realizadas em 23/10/2026 com dados sintéticos:

Resultado final: **8 testes Node/painel e 6 testes Android passaram**, nenhum
teste pulado na execução com ARGOS_INTEROP_DIR definido. Builds debug/release e
lint Android concluíram com sucesso. O lint ainda informa avisos de versões de
dependências, persistência síncrona de preferências e revisão de texto.

| Área | Evidência |
| --- | --- |
| Backend | TypeScript strict compila; testes usam PostgreSQL 17 real no Docker |
| Pareamento | Expiração, consumo concorrente, novo pareamento da mesma instalação e invalidação da credencial anterior |
| Ingestão | Unicidade, mesmo envelope já recebido, conflito de bytes, resposta parcial e IDs incompatíveis |
| Falha de rede | Socket destruído depois do commit; reenvio confirma já recebido e mantém uma única linha |
| Criptografia | Header, ciphertext e tag adulterados rejeitados; algoritmos fora da lista rejeitados; rotação preserva chave antiga |
| Autorização | Token de dispositivo não lê mensagens; revogação bloqueia envio; cookie e CSRF verificados |
| Painel | Teste DOM verifica texto, remetente/destinatário, fonte, simulação, filtros e ausência de interpretação de HTML de mensagens |
| Android | Debug e release assinados compilam; lint sem erros, com avisos de dependências/estilo |
| Room | Reabrir o banco preserva ID, bytes, tentativas e rejeição; transação interrompida não deixa gravação parcial |
| Captura | Testes de diferença de snapshots preservam multiplicidade e não transformam a mesma árvore em novo registro |
| Interoperabilidade | Kotlin/Nimbus em JVM cifra texto longo com acentos, emoji e quebras; Node/jose decifra e rejeita adulterações |
| Operação | Docker Compose saudável; 12 observações simuladas aceitas; backup restaurado em banco/volume de chaves isolados e 12 amostras decifradas |

O navegador de automação não está disponível nesta sessão: o painel foi testado
por HTTP e DOM, sem inspeção visual em navegador. O teste Nimbus é JVM; os
provedores criptográficos e permissões no Android real ainda exigem teste final.
Reabertura de banco simula a fronteira de persistência; não substitui matar o
processo durante upload num aparelho. Captura real, cobertura por mensageiro,
energia, atualização de APK e piloto de 3–7 dias ainda não foram medidos.

## Repetir

Backend, com Node >=22 e Docker:

```powershell
.\scripts\test-server.ps1
```

O script usa apenas o banco `argos_test` na porta 55432. A suíte limpa esse banco
de teste. Não aponte TEST_DATABASE_URL ao banco do painel.

Android e interoperabilidade, com JAVA_HOME/ANDROID_HOME configurados:

```powershell
cd server
npm ci
npm run interop:prepare
cd ..
$env:ARGOS_INTEROP_DIR = "$PWD/.tools/interop"
.\android\gradlew.bat -p android :app:testDebugUnitTest :app:lintDebug
cd server
npm run interop:verify
```

O teste cruzado é pulado se ARGOS_INTEROP_DIR não estiver definido. Os demais
testes Android permanecem independentes. Não se atribui cobertura real aos
resultados do simulador. Use [a matriz de aparelho](prova-whatsapp.md) no aceite.
