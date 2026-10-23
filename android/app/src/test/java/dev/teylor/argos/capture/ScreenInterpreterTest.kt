package dev.teylor.argos.capture

import org.junit.Assert.*
import org.junit.Test

class ScreenInterpreterTest {
    private fun message(text: String) = ScreenInterpreter.Message(text, "12:30", "$text|12:30")
    @Test fun repeatedIdenticalTextsRetainMultiplicity() {
        assertEquals(1, ScreenInterpreter.additions(listOf(message("oi")), listOf(message("oi"), message("oi"))).size)
    }
    @Test fun reopenedHistoryDoesNotProduceAnAddition() {
        val previous = listOf(message("a"), message("b"))
        assertTrue(ScreenInterpreter.additions(previous, previous).isEmpty())
    }
    @Test fun composerIsNeverAMessageView() {
        assertFalse(ScreenInterpreter.messageView("whatsapp", "com.whatsapp:id/entry"))
        assertFalse(ScreenInterpreter.sendControl("com.whatsapp:id/attachment", "Anexar"))
        assertTrue(ScreenInterpreter.sendControl("com.whatsapp:id/send", ""))
    }
}
