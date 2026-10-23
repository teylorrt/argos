package dev.teylor.argos.capture

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import dev.teylor.argos.data.*
import java.time.Instant

class MessageNotificationService : NotificationListenerService() {
    companion object { var connected = false; private set }
    override fun onListenerConnected() { connected = true }
    override fun onListenerDisconnected() { connected = false }
    override fun onDestroy() { connected = false; super.onDestroy() }
    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return
        val app = MessengerApps.packages[sbn.packageName] ?: return
        val settings = SettingsStore(this)
        if (!settings.canCapture(app, "notification")) return
        val notification = sbn.notification
        if (notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
        val version = try { packageManager.getPackageInfo(sbn.packageName, 0).versionName ?: "unknown" } catch (_: Exception) { "unknown" }
        val style = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(notification)
        if (style != null) {
            val conversation = style.conversationTitle?.toString()?.take(512)
            val isGroup = style.isGroupConversation
            val account = style.user?.name?.toString()?.take(512)
            val occurrences = mutableMapOf<String, Int>()
            for (message in style.messages) {
                val text = message.text?.toString()?.take(32768) ?: continue
                if (text.isBlank()) continue
                val senderPerson = message.person
                val self = senderPerson == null
                val sender = if (self) account else senderPerson.name?.toString()?.take(512)
                val title = conversation ?: if (self) notification.extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.take(512) else sender
                val timestamp = message.timestamp.takeIf { it > 0 }?.let { Instant.ofEpochMilli(it).toString() }
                val baseIdentity = "notification|${sbn.packageName}|${sbn.key}|${message.timestamp}|$sender|$text"
                val occurrence = occurrences[baseIdentity] ?: 0
                occurrences[baseIdentity] = occurrence + 1
                val identity = "$baseIdentity|$occurrence"
                CaptureRepository.enqueue(this, Observation(
                    app, sbn.packageName, "notification", text, title, sender,
                    recipient = if (self) title else account,
                    direction = if (self) "outgoing" else "incoming", messageAt = timestamp,
                    confidence = "structured", evidence = listOf("android_messaging_style", "notification_is_not_delivery_confirmation"),
                    isGroup = isGroup, appVersion = version,
                ), identity)
            }
        } else {
            if (notification.category != Notification.CATEGORY_MESSAGE) return
            val extras = notification.extras
            val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.take(512)
            val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString()?.take(32768) ?: return
            if (text.isBlank()) return
            CaptureRepository.enqueue(this, Observation(
                app, sbn.packageName, "notification", text, conversation = title,
                confidence = "unknown", evidence = listOf("notification_text_fallback", "participants_and_direction_unverified"), appVersion = version,
            ), "notification-fallback|${sbn.key}|${notification.`when`}|$title|$text")
        }
    }
}
