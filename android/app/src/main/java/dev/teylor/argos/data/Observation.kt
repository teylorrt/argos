package dev.teylor.argos.data

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.UUID

data class Observation(
    val app: String, val packageName: String, val source: String, val text: String,
    val conversation: String? = null, val sender: String? = null, val recipient: String? = null,
    val direction: String = "unknown", val messageAt: String? = null,
    val displayedTime: String? = null, val simulated: Boolean = false,
    val confidence: String = "unknown", val evidence: List<String> = emptyList(),
    val isGroup: Boolean? = null, val appVersion: String = "unknown",
    val eventId: String = UUID.randomUUID().toString(), val observedAt: String = Instant.now().toString(),
) {
    fun json(deviceId: String): JSONObject = JSONObject().apply {
        put("schemaVersion", 1); put("eventId", eventId); put("deviceId", deviceId)
        put("app", app); put("packageName", packageName); put("source", source)
        put("simulated", simulated); put("text", text); put("direction", direction)
        put("deliveryState", "observed")
        put("conversation", JSONObject().put("id", JSONObject.NULL).put("title", conversation ?: JSONObject.NULL).put("isGroup", isGroup ?: JSONObject.NULL))
        put("sender", sender ?: JSONObject.NULL); put("recipient", recipient ?: JSONObject.NULL)
        put("observedAt", observedAt); put("messageAt", messageAt ?: JSONObject.NULL)
        put("displayedTime", displayedTime ?: JSONObject.NULL); put("appVersion", appVersion)
        put("adapterVersion", if (simulated) "simulator/1" else "$source/experimental-1")
        put("confidence", confidence); put("evidence", JSONArray(evidence)); put("relatedEventId", JSONObject.NULL)
    }
}

object MessengerApps {
    val packages = mapOf("com.whatsapp" to "whatsapp", "com.instagram.android" to "instagram", "com.facebook.orca" to "messenger")
}
