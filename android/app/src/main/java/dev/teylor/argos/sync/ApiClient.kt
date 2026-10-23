package dev.teylor.argos.sync

import dev.teylor.argos.data.SettingsStore
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI

class ApiException(val status: Int, val code: String) : Exception(code)
class ApiClient(private val settings: SettingsStore) {
    fun request(path: String, body: JSONObject? = null, authenticated: Boolean = true): JSONObject {
        val base = URI(settings.server)
        require(base.scheme == "https" || (dev.teylor.argos.BuildConfig.DEBUG && base.scheme == "http")) { "HTTPS obrigatório" }
        require(base.host != null && base.userInfo == null && base.query == null && base.fragment == null && (base.path.isNullOrEmpty() || base.path == "/")) { "URL inválida" }
        val connection = base.resolve(path).toURL().openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 15000; connection.readTimeout = 20000
            connection.instanceFollowRedirects = false
            connection.requestMethod = if (body == null) "GET" else "POST"
            connection.setRequestProperty("Accept", "application/json")
            if (authenticated) connection.setRequestProperty("Authorization", "Bearer ${settings.token}")
            if (body != null) {
                connection.doOutput = true; connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val status = connection.responseCode
            val input = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = input?.bufferedReader()?.use { it.readText() } ?: "{}"
            val result = try { JSONObject(text) } catch (_: Exception) { JSONObject() }
            if (status !in 200..299) throw ApiException(status, result.optString("error", "HTTP_$status"))
            return result
        } finally { connection.disconnect() }
    }
}
