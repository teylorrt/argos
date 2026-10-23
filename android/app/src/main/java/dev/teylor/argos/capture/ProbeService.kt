package dev.teylor.argos.capture

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import dev.teylor.argos.data.*

class ProbeService : AccessibilityService() {
    companion object { var connected = false; private set }
    private var activeConversation: String? = null
    private var previous = emptyList<ScreenInterpreter.Message>()
    private var sendAt = 0L
    private var sentDraft: String? = null
    private var sendConversation: String? = null
    private var sendSession = ""
    private var cachedDraft: String? = null
    override fun onServiceConnected() { connected = true }
    override fun onInterrupt() { reset(); connected = false }
    override fun onDestroy() { connected = false; super.onDestroy() }
    private fun reset() { activeConversation = null; previous = emptyList(); sendAt = 0; sentDraft = null; sendConversation = null; cachedDraft = null }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val packageName = event?.packageName?.toString() ?: return
        val app = MessengerApps.packages[packageName] ?: return
        val settings = SettingsStore(this)
        if (!settings.canCapture(app, "accessibility")) { reset(); return }
        if (event.eventType == AccessibilityEvent.TYPE_VIEW_SCROLLED || event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) { reset(); return }
        val root = rootInActiveWindow ?: return
        if (root.packageName?.toString() != packageName) { reset(); return }
        val messages = mutableListOf<ScreenInterpreter.Message>()
        var title: String? = null; var draft: String? = null; var count = 0; var limited = false
        fun visit(node: AccessibilityNodeInfo, depth: Int) {
            if (count++ >= 1000 || depth > 40) { limited = true; return }
            val id = node.viewIdResourceName ?: ""
            val text = node.text?.toString()
            if (node.isEditable && !text.isNullOrBlank()) draft = text.take(32768)
            if (ScreenInterpreter.titleView(id) && !text.isNullOrBlank()) title = text.take(512)
            if (node.isVisibleToUser && !node.isEditable && !text.isNullOrBlank() && ScreenInterpreter.messageView(app, id)) {
                val parent = node.parent
                var displayedTime: String? = null
                if (parent != null) for (i in 0 until parent.childCount.coerceAtMost(40)) {
                    val child = parent.getChild(i) ?: continue
                    if (child.viewIdResourceName?.substringAfterLast('/') in setOf("date", "time", "message_time")) displayedTime = child.text?.toString()?.take(150)
                }
                val value = text.take(32768)
                messages += ScreenInterpreter.Message(value, displayedTime, "$value|$displayedTime")
            }
            for (i in 0 until node.childCount.coerceAtMost(100)) {
                if (count >= 1000) { limited = true; break }
                node.getChild(i)?.let { visit(it, depth + 1) }
            }
        }
        visit(root, 0)
        if (limited || title == null) {
            settings.prefs.edit().putString("adapter_$app", "Estrutura não reconhecida/incompleta; captura de tela aguardando compatibilidade").apply()
            reset(); return
        }
        val conversation = "$packageName|$title"
        settings.prefs.edit().putString("adapter_$app", "Experimental: estrutura reconhecida; validar no aparelho").apply()
        if (activeConversation != conversation) { previous = messages; activeConversation = conversation; sendAt = 0; cachedDraft = null }
        if (event.eventType == AccessibilityEvent.TYPE_VIEW_CLICKED) {
            val source = event.source
            val candidate = draft ?: cachedDraft
            if (source != null && ScreenInterpreter.sendControl(source.viewIdResourceName ?: "", source.contentDescription?.toString() ?: "") && candidate != null) {
                sendAt = android.os.SystemClock.elapsedRealtime(); sentDraft = candidate; sendConversation = conversation
                sendSession = java.util.UUID.randomUUID().toString()
            }
        }
        if (!draft.isNullOrBlank()) cachedDraft = draft
        val elapsed = android.os.SystemClock.elapsedRealtime() - sendAt
        if (sendAt > 0 && elapsed in 0..5000 && sendConversation == conversation) {
            val added = ScreenInterpreter.additions(previous, messages).filter { it.text == sentDraft }
            if (added.isNotEmpty()) {
                val value = added.first()
                val version = try { packageManager.getPackageInfo(packageName, 0).versionName ?: "unknown" } catch (_: Exception) { "unknown" }
                CaptureRepository.enqueue(this, Observation(app, packageName, "accessibility", value.text,
                    conversation = title, recipient = title, direction = "outgoing", displayedTime = value.displayedTime,
                    confidence = "heuristic", evidence = listOf("local_send_control_clicked", "draft_matches_new_visible_node", "delivery_not_confirmed"), appVersion = version,
                ), "accessibility|$sendSession")
                sendAt = 0; sentDraft = null
                cachedDraft = null
            }
        } else if (elapsed > 5000) { sendAt = 0; sentDraft = null }
        previous = messages
    }
}
