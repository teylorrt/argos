package dev.teylor.argos.capture

object ScreenInterpreter {
    data class Message(val text: String, val displayedTime: String?, val key: String)
    fun additions(previous: List<Message>, current: List<Message>): List<Message> {
        val counts = previous.groupingBy { it.key }.eachCount().toMutableMap()
        return current.filter { message ->
            val count = counts[message.key] ?: 0
            if (count > 0) { counts[message.key] = count - 1; false } else true
        }
    }
    fun sendControl(id: String, description: String): Boolean {
        val suffix = id.substringAfterLast('/').lowercase()
        return suffix in setOf("send", "send_button", "button_send", "send_message", "row_thread_composer_button_send") ||
            description.trim().lowercase() in setOf("enviar", "send", "send message", "enviar mensagem")
    }
    fun messageView(app: String, id: String): Boolean {
        val suffix = id.substringAfterLast('/').lowercase()
        return when (app) {
            "whatsapp" -> suffix == "message_text"
            "instagram" -> suffix in setOf("direct_text_message_text_view", "message_text", "direct_message_text")
            "messenger" -> suffix in setOf("message_text", "message_text_view", "message_body")
            else -> false
        }
    }
    fun titleView(id: String): Boolean = id.substringAfterLast('/').lowercase() in setOf("conversation_contact_name", "contact_name", "thread_title", "title_name", "action_bar_title", "thread_name", "thread_title_view")
}
