package dev.teylor.argos.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class SettingsStore(context: Context) {
    val prefs = context.getSharedPreferences("argos", Context.MODE_PRIVATE)
    var paused: Boolean
        get() = prefs.getBoolean("paused", true)
        set(value) { prefs.edit().putBoolean("paused", value).commit() }
    var server: String
        get() = prefs.getString("server", "http://10.0.2.2:3000")!!
        set(value) { prefs.edit().putString("server", value.trimEnd('/')).commit() }
    var deviceId: String
        get() = prefs.getString("device", "")!!
        set(value) { prefs.edit().putString("device", value).commit() }
    var publicKey: String
        get() = prefs.getString("publicKey", "")!!
        set(value) { prefs.edit().putString("publicKey", value).commit() }
    val installationId: String
        get() = prefs.getString("installation", null) ?: UUID.randomUUID().toString().also { prefs.edit().putString("installation", it).commit() }
    var status: String
        get() = prefs.getString("status", "Não configurado")!!
        set(value) { prefs.edit().putString("status", value).apply() }
    var blocked: Boolean
        get() = prefs.getBoolean("blocked", false)
        set(value) { prefs.edit().putBoolean("blocked", value).commit() }
    var unlinkPending: Boolean
        get() = prefs.getBoolean("unlink", false)
        set(value) { prefs.edit().putBoolean("unlink", value).commit() }
    fun sourceEnabled(source: String) = prefs.getBoolean(source, false)
    fun appEnabled(app: String) = prefs.getBoolean("app_$app", app == "whatsapp")
    fun canCapture(app: String, source: String) = !paused && !blocked && !unlinkPending && deviceId.isNotEmpty() && publicKey.isNotEmpty() && appEnabled(app) && sourceEnabled(source)
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey("argos-credential", null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder("argos-credential", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    private fun readSecret(name: String): String {
            val encoded = prefs.getString(name, null) ?: return ""
            val bytes = Base64.decode(encoded, Base64.NO_WRAP)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
            return String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8)
    }
    private fun writeSecret(name: String, value: String) {
            if (value.isEmpty()) { prefs.edit().remove(name).commit(); return }
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
            prefs.edit().putString(name, Base64.encodeToString(cipher.iv + cipher.doFinal(value.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)).commit()
    }
    var token: String
        get() = readSecret("credential")
        set(value) { writeSecret("credential", value) }
    var pairing: String
        get() = readSecret("pairing")
        set(value) { writeSecret("pairing", value) }
}
