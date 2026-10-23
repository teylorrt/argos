package dev.teylor.argos.sync

import android.content.Context
import androidx.work.*
import dev.teylor.argos.data.CaptureRepository
import dev.teylor.argos.data.SettingsStore
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.concurrent.TimeUnit

object SyncScheduler {
    fun now(context: Context) {
        val request = OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS).build()
        WorkManager.getInstance(context).enqueueUniqueWork("argos-sync", ExistingWorkPolicy.APPEND_OR_REPLACE, request)
    }
    fun periodic(context: Context) {
        val request = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES).setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork("argos-recovery", ExistingPeriodicWorkPolicy.KEEP, request)
    }
    fun pause(context: Context) { WorkManager.getInstance(context).cancelUniqueWork("argos-sync") }
}

class SyncWorker(context: Context, parameters: WorkerParameters) : Worker(context, parameters) {
    companion object { private val executionLock = java.util.concurrent.locks.ReentrantLock() }
    override fun doWork(): Result {
        if (!executionLock.tryLock()) return Result.retry()
        return try { synchronizeQueue() } finally { executionLock.unlock() }
    }
    private fun synchronizeQueue(): Result {
        val settings = SettingsStore(applicationContext)
        try {
            val api = ApiClient(settings)
            if (settings.pairing.isNotEmpty()) {
                val registered = api.request("/v1/devices/register", JSONObject().put("code", settings.pairing).put("installationId", settings.installationId)
                    .put("label", settings.prefs.getString("label", android.os.Build.MODEL)), false)
                settings.token = registered.getString("token")
                settings.publicKey = registered.getJSONObject("recipientKey").toString()
                settings.deviceId = registered.getString("deviceId")
                settings.pairing = ""; settings.blocked = false
                settings.status = "Registrado. Ative os acessos e retome a captura."
            }
            if (settings.deviceId.isEmpty()) return Result.success()
            if (settings.unlinkPending) {
                try { api.request("/v1/devices/me/revoke", JSONObject()) }
                catch (e: ApiException) { if (e.status != 401) throw e }
                settings.unlinkPending = false; settings.token = ""; settings.deviceId = ""; settings.publicKey = ""
                settings.blocked = true; settings.status = "Desvinculado. Fila preservada para exportação ou exclusão."
                return Result.success()
            }
            if (settings.paused) return Result.success()
            val state = api.request("/v1/devices/me")
            settings.publicKey = state.getJSONObject("recipientKey").toString()
            val dao = CaptureRepository.database(applicationContext).queue()
            var temporary = false
            repeat(5) {
                if (settings.paused || settings.unlinkPending || isStopped) return Result.success()
                val batch = JSONArray(); var bytes = 30
                for (item in dao.pending()) {
                    val value = JSONObject().put("eventId", item.eventId).put("envelope", item.envelope)
                    val size = value.toString().toByteArray(Charsets.UTF_8).size + 1
                    if (size > 500 * 1024) { dao.reject(item.eventId, "ITEM_TOO_LARGE"); continue }
                    if (bytes + size > 500 * 1024) break
                    batch.put(value); bytes += size
                }
                if (batch.length() == 0) {
                    settings.status = "Sem pendências; rejeitados: ${dao.rejected()}"
                    return Result.success()
                }
                if (settings.paused || isStopped) return Result.success()
                settings.status = "Sincronizando ${batch.length()} registros"
                val result = api.request("/v1/observations/batch", JSONObject().put("items", batch)).getJSONArray("items")
                val requested = (0 until batch.length()).map { batch.getJSONObject(it).getString("eventId") }.toSet()
                val confirmed = mutableSetOf<String>()
                for (i in 0 until result.length()) {
                    val item = result.getJSONObject(i); val id = item.getString("eventId")
                    if (id !in requested || !confirmed.add(id)) continue
                    when (item.getString("status")) {
                        "accepted", "already_received" -> dao.accepted(id)
                        "rejected_permanent" -> dao.reject(id, item.optString("code", "REJECTED"))
                        else -> {
                            val code = item.optString("code", "RETRY")
                            dao.retry(id, code); temporary = true
                            if (code == "UNKNOWN_KEY") {
                                settings.blocked = true; settings.paused = true
                                settings.status = "Chave indisponível no servidor; restaure as chaves antes de retomar. Fila preservada."
                                return Result.success()
                            }
                        }
                    }
                }
                for (missing in requested - confirmed) { dao.retry(missing, "MISSING_ACK"); temporary = true }
                settings.prefs.edit().putString("lastSync", Instant.now().toString()).apply()
                if (temporary) { settings.status = "Falha temporária; nova tentativa agendada"; return Result.retry() }
            }
            SyncScheduler.now(applicationContext)
            return Result.success()
        } catch (e: ApiException) {
            if (e.code == "PAIRING_EXPIRED_OR_USED") {
                settings.pairing = ""; settings.paused = true
                settings.status = "Pareamento expirado/usado ou resposta perdida. Gere novo código para recuperar a mesma instalação."
                return Result.success()
            }
            if (e.status == 401 || e.status == 403) {
                settings.blocked = true; settings.paused = true; settings.status = "Credencial revogada ou expirada; faça novo pareamento."
                return Result.success()
            }
            settings.status = "Servidor indisponível (${e.code}); fila preservada"
            return Result.retry()
        } catch (_: Exception) { settings.status = "Sem comunicação; fila preservada e nova tentativa agendada"; return Result.retry() }
    }
}
