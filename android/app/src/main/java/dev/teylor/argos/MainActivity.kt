package dev.teylor.argos

import android.app.Activity
import android.os.Bundle
import android.content.Intent
import android.provider.Settings
import android.widget.*
import android.app.AlertDialog
import dev.teylor.argos.capture.MessageNotificationService
import dev.teylor.argos.capture.ProbeService
import dev.teylor.argos.data.*
import dev.teylor.argos.sync.SyncScheduler
import java.time.Instant
import java.util.UUID

class MainActivity : Activity() {
    private lateinit var store: SettingsStore
    private val exportQueue = 41
    override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); store = SettingsStore(this); render() }
    override fun onResume() { super.onResume(); if (::store.isInitialized) render() }
    private fun render() {
        val layout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(32, 60, 32, 32) }
        fun label(value: String, size: Float = 16f): TextView = TextView(this).apply { text = value; textSize = size; setPadding(0, 12, 0, 12); layout.addView(this) }
        fun button(value: String, action: () -> Unit) { layout.addView(Button(this).apply { text = value; setOnClickListener { action() } }) }
        fun input(hintText: String, value: String = "", password: Boolean = false): EditText = EditText(this).apply {
            hint = hintText; setText(value); if (password) inputType = 129
            layout.addView(this)
        }
        fun toggle(title: String, key: String, default: Boolean) {
            layout.addView(Switch(this).apply { text = title; isChecked = store.prefs.getBoolean(key, default); setPadding(0, 16, 0, 16)
                setOnCheckedChangeListener { _, checked -> store.prefs.edit().putBoolean(key, checked).commit() }
            })
        }
        label("◉ ARGOS", 28f)
        label("Arquivo pessoal de mensagens", 20f)
        label("${android.os.Build.MODEL} · Android ${android.os.Build.VERSION.RELEASE}\n${if (store.paused) "PAUSADO" else "CAPTURA SOLICITADA"} · ${store.status}")
        label("Acessibilidade: ${if (ProbeService.connected) "conectada" else "desconectada"}\nNotificações: ${if (MessageNotificationService.connected) "conectadas" else "desconectadas"}\nDispositivo: ${store.deviceId.ifEmpty { "aguardando registro" }}\nÚltima sincronização: ${store.prefs.getString("lastSync", "nenhuma")}")
        val queueState = label("Carregando fila…")
        CaptureRepository.executor.execute {
            val dao = CaptureRepository.database(this).queue()
            val summary = "Fila: ${dao.count()} registros / ${dao.bytes() / 1024} KiB · Rejeitados: ${dao.rejected()}\nMais antigo: ${dao.oldest()?.let { Instant.ofEpochMilli(it).toString() } ?: "nenhum"}\n" + dao.errors().joinToString("\n") { "${it.eventId.take(8)}: ${it.error}" }
            runOnUiThread { queueState.text = summary }
        }
        label("Configuração", 22f)
        val server = input("URL do servidor (HTTPS)", store.server)
        val code = input("Código de pareamento", password = true)
        label("Debug aceita HTTP para teste por USB/emulador. Release exige HTTPS. A URL só pode mudar com fila vazia e aparelho desvinculado.", 12f)
        button("Salvar servidor / parear") {
            val target = server.text.toString().trim().trimEnd('/')
            val pairing = code.text.toString().trim()
            CaptureRepository.executor.execute {
                if (target != store.server && (store.deviceId.isNotEmpty() || CaptureRepository.database(this).queue().count() > 0)) {
                    runOnUiThread { Toast.makeText(this, "Desvincule e esvazie/exporte a fila antes de trocar o servidor.", Toast.LENGTH_LONG).show() }
                } else {
                    store.server = target
                    if (pairing.isNotEmpty()) { store.paused = true; store.pairing = pairing; store.status = "Aguardando registro com rede"; SyncScheduler.now(this) }
                    runOnUiThread { render() }
                }
            }
        }
        label("Aplicativos e fontes", 22f)
        label("Ative apenas suas contas. As duas fontes são registradas separadamente; podem observar a mesma mensagem. Adaptadores de tela são experimentais.", 13f)
        for ((pkg, app) in MessengerApps.packages) {
            val version = try { packageManager.getPackageInfo(pkg, 0).versionName ?: "?" } catch (_: Exception) { "não instalado" }
            toggle("${app.replaceFirstChar { it.uppercase() }} · $version", "app_$app", app == "whatsapp")
            label(store.prefs.getString("adapter_$app", "Tela ainda não avaliada")!!, 12f)
        }
        toggle("Capturar por acessibilidade (tela)", "accessibility", false)
        toggle("Capturar pelas notificações", "notification", false)
        button("Permissão de acessibilidade") { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
        button("Acesso às notificações") { startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) }
        button(if (store.paused) "Retomar captura e sincronização" else "Pausar tudo") {
            if (store.paused) {
                if (store.deviceId.isEmpty() || store.unlinkPending) Toast.makeText(this, "Faça o pareamento primeiro.", Toast.LENGTH_LONG).show()
                else { store.paused = false; store.status = "Retomado; aguardando eventos das fontes habilitadas"; SyncScheduler.now(this) }
            } else { store.paused = true; store.status = "Pausado. Requisição já recebida pelo servidor pode concluir."; SyncScheduler.pause(this) }
            render()
        }
        button("Sincronizar / atualizar estado") { SyncScheduler.now(this); render() }
        button("Liberar bloqueio local após corrigir causa") { store.blocked = false; store.status = "Bloqueio liberado; confira permissões e credencial"; render() }
        label("Simulação de ponta a ponta", 22f)
        label("Gera 12 mensagens sintéticas: 3 apps × 2 fontes × 2 direções. Exige registro, fontes/apps habilitados e captura retomada. No painel serão marcadas SIMULADO.", 13f)
        button("Gerar mensagens de demonstração") {
            if (store.paused || store.deviceId.isEmpty() || store.blocked) { Toast.makeText(this, "Registre e retome primeiro.", Toast.LENGTH_LONG).show(); return@button }
            for ((pkg, app) in MessengerApps.packages) for (source in listOf("accessibility", "notification")) for (direction in listOf("incoming", "outgoing")) {
                val outgoing = direction == "outgoing"
                val event = Observation(app, pkg, source, "Olá! Mensagem simulada do $app 📨\nAcentos: ação e café.",
                    "Conversa de teste", if (outgoing) "Eu (simulação)" else "Contato de teste", if (outgoing) "Contato de teste" else "Eu (simulação)",
                    direction, Instant.now().toString(), simulated = true, confidence = "structured", evidence = listOf("synthetic_fixture"), appVersion = "simulated")
                CaptureRepository.enqueue(this, event, "simulation|${UUID.randomUUID()}")
            }
            Toast.makeText(this, "Simulação solicitada para apps e fontes habilitados.", Toast.LENGTH_LONG).show()
        }
        label("Dados locais", 22f)
        button("Exportar fila cifrada") { startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).apply { type = "application/x-ndjson"; putExtra(Intent.EXTRA_TITLE, "argos-encrypted-queue.ndjson"); addCategory(Intent.CATEGORY_OPENABLE) }, exportQueue) }
        button("Desvincular (preservar fila)") {
            AlertDialog.Builder(this).setMessage("Desativar coleta e solicitar revogação? Offline, a revogação ficará pendente. A fila será preservada.")
                .setPositiveButton("Desvincular") { _, _ -> store.paused = true; store.unlinkPending = true; store.pairing = ""; store.status = "Revogação remota pendente"; SyncScheduler.now(this); render() }.setNegativeButton("Cancelar", null).show()
        }
        button("Apagar fila local") {
            AlertDialog.Builder(this).setMessage("Apagar definitivamente todos os envelopes locais, incluindo rejeitados? Exporte antes se quiser preservar os dados.")
                .setPositiveButton("Apagar") { _, _ -> store.paused = true; SyncScheduler.pause(this); CaptureRepository.executor.execute { CaptureRepository.database(this).queue().clear(); store.blocked = false; runOnUiThread { render() } } }.setNegativeButton("Cancelar", null).show()
        }
        setContentView(ScrollView(this).apply { addView(layout) })
    }
    @Deprecated("Activity result API kept for minimal native Activity")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == exportQueue && resultCode == RESULT_OK) {
            val uri = data?.data ?: return
            CaptureRepository.executor.execute {
                try {
                    contentResolver.openOutputStream(uri)?.bufferedWriter()?.use { output ->
                        CaptureRepository.database(this).query("SELECT eventId,envelope,state,error FROM queue ORDER BY createdAt", null).use { cursor ->
                            while (cursor.moveToNext()) output.appendLine(org.json.JSONObject().put("eventId", cursor.getString(0)).put("envelope", cursor.getString(1)).put("state", cursor.getString(2)).put("error", cursor.getString(3) ?: org.json.JSONObject.NULL).toString())
                        }
                    }
                    runOnUiThread { Toast.makeText(this, "Fila cifrada exportada", Toast.LENGTH_LONG).show() }
                } catch (_: Exception) { runOnUiThread { Toast.makeText(this, "Falha na exportação", Toast.LENGTH_LONG).show() } }
            }
        }
    }
}
