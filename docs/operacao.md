# Operação

## Ambiente local

`scripts/start.ps1` gera `infra/.env` quando ausente e sobe o projeto Docker
`argos`. API/painel ficam na porta 3000, vinculada somente a 127.0.0.1. PostgreSQL
não publica porta. Volumes `argos_postgres` e `argos_keys` preservam banco e chaves.
O health check consulta PostgreSQL. Logs registram códigos operacionais, sem
mensagens, envelopes, códigos de pareamento ou credenciais.

`scripts/demo.ps1` cria uma instalação sintética, envia 12 eventos cifrados e
revoga a credencial do simulador ao terminar. Pode repetir; cada execução gera
novos eventos. Não confunda esses eventos com captura real.

Parar sem apagar volumes:

```powershell
docker compose --project-name argos --env-file infra/.env -f infra/compose.yaml stop
```

Para atualizar, execute `scripts/start.ps1` novamente. Migrações SQL numeradas
são aplicadas com transação e lock, registradas em `schema_migrations`.

## HTTPS

Em um servidor com DNS válido e portas 80/443 disponíveis, adicione
`ARGOS_DOMAIN=seu-dominio` a `infra/.env` e execute:

```powershell
docker compose --project-name argos --env-file infra/.env -f infra/compose.yaml -f infra/compose.https.yaml up -d --build --wait
```

Caddy termina TLS e a API usa cookies Secure. Use `https://seu-dominio` no APK
release. Essa implantação exige domínio/DNS e não foi executada nesta máquina.
Para teste USB com APK debug, `adb reverse` permite usar o servidor local sem
publicá-lo na rede. Não troque debug por release sobre a mesma instalação: as
assinaturas são diferentes; permaneça no mesmo canal para preservar dados.

## Credenciais e leitura

O proprietário usa OWNER_TOKEN, separado da credencial de cada dispositivo.
Painel troca o token por cookie HttpOnly/SameSite Strict de 8 horas; o token de
proprietário não fica em localStorage. Mutações por cookie exigem CSRF. Sessões
expiram ao reiniciar a API. Dispositivos não podem consultar mensagens.

Pareamento dura 15 minutos e tem uso único. Se a resposta de registro se perder,
gere novo código e repareie a mesma instalação; o servidor mantém o deviceId e
invalida a credencial anterior. Não há recuperação baseada apenas no UUID.
Credenciais de dispositivo expiram em 365 dias; novo pareamento reemite acesso.

O servidor é o destinatário da chave de leitura, conforme premissa do MVP.
Texto, participantes, conversa e evidências ficam no JWE. Fora dele ficam IDs,
hash do envelope, versão do schema, app, fonte, marca de simulação, observedAt
e receivedAt para filtro e retenção. As chaves privadas residem no volume de
chaves separado do banco e nunca no APK.

## Backup, restauração e rotação

```powershell
.\scripts\backup.ps1
.\scripts\verify-backup.ps1 -BackupDirectory .\infra\backups\DATA-HORA
```

O backup inclui dump PostgreSQL binário e arquivo de chaves. Verificação restaura
em projeto isolado `argos-restore-check`, exige banco de destino vazio e decifra
até 100 amostras. Para repetir, use outro `-ProjectName argos-restore-novo`.
Nenhum banco/chave original é sobrescrito. Uma restauração para servir usuários
deve reutilizar os volumes restaurados e as credenciais de configuração, em vez
de gerar chaves novas. O projeto isolado não publica API nem porta do banco.

Guarde também `infra/.env` e `.tools/signing/` em backup protegido separado.
A assinatura release é indispensável para atualizar sem desinstalar. Não rode
rotação de chaves simultaneamente ao backup. A chave anterior permanece necessária
para arquivos antigos e filas offline.

Rotação (reinicie a API depois):

```powershell
docker compose --project-name argos --env-file infra/.env -f infra/compose.yaml exec -T api node dist/keys-cli.js --rotate
docker compose --project-name argos --env-file infra/.env -f infra/compose.yaml restart api
```

Retenção padrão: 90 dias no servidor, verificada ao iniciar e a cada hora,
configurável por RETENTION_DAYS. Backups são manuais, sem descarte automático;
uma política inicial possível é sete cópias diárias, a ser aplicada pelo proprietário.
Excluir do banco não elimina cópias já existentes em backups.

## Fila e falhas

A fila Room contém envelopes cifrados, IDs, estado, tentativas, códigos de erro e
horário local. Limite de 50 MiB e 50 mil identidades de captura recentes; ao atingir,
novas capturas bloqueiam com aviso. Identidades de captura expiram após 30 dias.
Lotes têm até 100 eventos e aproximadamente 500 KiB no cliente; API impõe 512 KiB.
Cada evento é cifrado uma única vez. Retentativas usam os mesmos bytes.

WorkManager exige conectividade, usa espera exponencial e recuperação periódica
de 15 minutos. Execução pode atrasar por energia/sistema. Revogação remota só é
aprendida pelo aparelho ao se comunicar. Erros permanentes ficam no diagnóstico;
chave desconhecida exige restauração de chaves antes de retomar. Exportar a fila
gera NDJSON com envelopes e códigos; não decifra mensagens no armazenamento local.
