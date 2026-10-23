package dev.teylor.argos.data

import android.app.Application
import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], application = Application::class)
class QueueRecoveryTest {
    private fun <T> QueueDatabase.closed(block: (QueueDatabase) -> T): T = try { block(this) } finally { close() }
    private fun database(context: Context, name: String) = Room.databaseBuilder(context, QueueDatabase::class.java, name).allowMainThreadQueries().build()
    @Test fun reopeningRecoversOriginalBytesAndRejectedState() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val name = "recovery-${java.util.UUID.randomUUID()}.db"
        val original = "protected.encrypted.key.ciphertext.tag"
        database(context, name).closed { db ->
            db.runInTransaction {
                db.queue().insert(QueueItem().apply { eventId = "stable-id"; envelope = original; createdAt = 1 })
                db.queue().seen(SeenItem().apply { fingerprint = "stable-capture"; createdAt = 1 })
            }
            db.queue().retry("stable-id", "NETWORK")
        }
        database(context, name).closed { db ->
            val item = db.queue().pending().single()
            assertEquals(original, item.envelope); assertEquals("stable-id", item.eventId)
            assertEquals(1, item.attempts); assertEquals(1, db.queue().isSeen("stable-capture"))
            db.queue().reject(item.eventId, "EVENT_CONFLICT")
        }
        database(context, name).closed { db ->
            assertTrue(db.queue().pending().isEmpty()); assertEquals(1, db.queue().rejected())
            assertEquals(original, db.queue().errors().single().envelope)
        }
        context.deleteDatabase(name)
    }
    @Test fun interruptedTransactionDoesNotLeaveHalfPersistedCapture() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        Room.inMemoryDatabaseBuilder(context, QueueDatabase::class.java).allowMainThreadQueries().build().closed { db ->
            try {
                db.runInTransaction {
                    db.queue().insert(QueueItem().apply { eventId = "a"; envelope = "ciphertext" })
                    throw IllegalStateException("interrupted")
                }
            } catch (_: IllegalStateException) { }
            assertEquals(0, db.queue().count()); assertEquals(0, db.queue().seenCount())
        }
    }
}
