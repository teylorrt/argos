# Argos

Arquivo pessoal de mensagens com Android/Kotlin, API Node/TypeScript, PostgreSQL
e painel web. Captura experimental para WhatsApp, Instagram e Messenger por
acessibilidade e notificações; simulação das duas fontes para testar todo o fluxo.

## Iniciar

Com Docker Desktop ativo, na raiz do projeto:

```powershell
.\scripts\start.ps1
.\scripts\demo.ps1
```

Abra **http://localhost:3000**. Use o valor de `OWNER_TOKEN` de `infra/.env` para
entrar. O primeiro comando gera as credenciais locais; esse arquivo não vai para
o Git. O segundo insere 12 mensagens marcadas como **SIMULADO**.

O painel mostra texto, app, fonte, conversa, remetente, destinatário, direção e
horários. Há filtros por aplicativo, fonte, dados reais/simulados e período,
paginação e busca nos registros já carregados. Campos ausentes ficam desconhecidos.
O proprietário pode consultar detalhes, excluir registros e revogar aparelhos.

## Testar no Android

1. Compile com `.\scripts\build-apk.ps1` ou abra `android/` no Android Studio.
2. Instale `android/app/build/outputs/apk/debug/app-debug.apk`.
3. Conecte o celular por USB com depuração autorizada. Execute
   `adb reverse tcp:3000 tcp:3000` (ADB em `%LOCALAPPDATA%\Android\Sdk\platform-tools`).
4. No painel, crie um pareamento. No app, configure `http://127.0.0.1:3000`, cole o
   código e salve. Em emulador Android, use `http://10.0.2.2:3000`.
5. Aguarde o registro e atualize o estado. Selecione aplicativos e fontes, conceda
   os dois acessos nas configurações Android e toque em **Retomar**.
6. Use **Gerar mensagens de demonstração** para testar Android → JWE → Room →
   WorkManager → API → PostgreSQL → painel. Depois teste conversas controladas reais.

O app começa pausado. Pausar impede novas capturas/lotes; requisições em curso
podem concluir. Desvincular preserva a fila e solicita revogação, inclusive quando
a rede voltar. A fila cifrada pode ser exportada ou apagada por escolha explícita.

## Build, operação e validação

- Android: SDK 37, mínimo API 26, AGP 9.4.0, Gradle 9.6.0 e JDK do Android Studio.
- Backend: Node 24.10.0 no Docker; desenvolvimento local exige Node >=22.
- `.\scripts\build-apk.ps1 -Release` gera APK assinado. Preserve `.tools/signing/`
  para futuras atualizações. Debug e release usam assinaturas diferentes.
- APK release exige HTTPS; configuração Caddy disponível para servidor com domínio.
- [Operação, HTTPS, backups e chaves](docs/operacao.md).
- [Testes executados e como repeti-los](docs/testes.md).
- [Contrato de estados](contracts/states.md), [OpenAPI](contracts/openapi.yaml)
  e [payload cifrado](contracts/observation.schema.json).

## Limites da captura

Os adaptadores reais ainda precisam ser validados no aparelho. Acessibilidade
correlaciona clique de envio, rascunho e novo texto visível; não importa histórico
e não afirma entrega oficial. IDs de views e estrutura podem exigir ajustes após
atualizações dos mensageiros. Notificações usam MessagingStyle quando disponível;
no fallback, participantes e direção ficam desconhecidos. Conteúdo oculto pelo
aplicativo ou pelo Android não pode ser recuperado por essa fonte.

Fontes diferentes permanecem como observações separadas. Simulação comprova o
fluxo de transporte/leitura, não a cobertura real dos mensageiros. Áudio, imagens,
vídeo, histórico retroativo e correlação de edições/exclusões não estão implementados.
O [roteiro no aparelho](docs/prova-whatsapp.md) preserva esses limites.

Por solicitação do proprietário em 23/10/2026, a infraestrutura foi implementada
antes da aprovação da prova de captura prevista no [plano original](plano_implementacao_android_node_typescript.md).
