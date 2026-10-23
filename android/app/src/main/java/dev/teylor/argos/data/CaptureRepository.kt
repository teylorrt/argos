package dev.teylor.argos.data

import android.content.Context
import androidx.room.Room
import com.nimbusds.jose.EncryptionMethod
import com.nimbusds.jose.JWEAlgorithm
import com.nimbusds.jose.JWEHeader
import com.nimbusds.jose.JWEObject
import com.nimbusds.jose.Payload
import com.nimbusds.jose.crypto.RSAEncrypter
import com.nimbusds.jose.jwk.RSAKey
import dev.teylor.argos.sync.SyncScheduler
import java.security.MessageDigest
import java.util.concurrent.Executors

object CaptureRepository {
    val executor = Executors.newSingleThreadExecutor()
    @Volatile private var database: QueueDatabase? = null
    fun database(context: Context): QueueDatabase = database ?: synchronized(this) {
        database ?: Room.databaseBuilder(context.applicationContext, QueueDatabase::class.java, "argos.db").build().also { database = it }
    }
    fun digest(value: String) = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    fun enqueue(context: Context, observation: Observation, identity: String) {
        executor.execute {
            val settings = SettingsStore(context)
            if (!settings.canCapture(observation.app, observation.source)) return@execute
            try {
                val db = database(context); val dao = db.queue()
                val fingerprint = digest(identity)
                if (dao.isSeen(fingerprint) > 0) return@execute
                val key = RSAKey.parse(settings.publicKey)
                val jwe = JWEObject(JWEHeader.Builder(JWEAlgorithm.RSA_OAEP_256, EncryptionMethod.A256GCM).keyID(key.keyID).build(), Payload(observation.json(settings.deviceId).toString()))
                jwe.encrypt(RSAEncrypter(key))
                val envelope = jwe.serialize()
                db.runInTransaction {
                    if (!settings.canCapture(observation.app, observation.source) || dao.isSeen(fingerprint) > 0) return@runInTransaction
                    dao.pruneSeen(System.currentTimeMillis() - 30L * 86400000)
                    if (dao.bytes() + envelope.length > 50L * 1024 * 1024 || dao.seenCount() >= 50000) {
                        settings.blocked = true; settings.status = "Limite local atingido; capturas bloqueadas. Sincronize ou exporte a fila."
                        return@runInTransaction
                    }
                    dao.insert(QueueItem().apply { eventId = observation.eventId; this.envelope = envelope; createdAt = System.currentTimeMillis() })
                    dao.seen(SeenItem().apply { this.fingerprint = fingerprint; createdAt = System.currentTimeMillis() })
                }
                SyncScheduler.now(context)
            } catch (_: Exception) { settings.blocked = true; settings.status = "Falha ao cifrar/persistir; captura bloqueada para evitar perda silenciosa." }
        }
    }
}
