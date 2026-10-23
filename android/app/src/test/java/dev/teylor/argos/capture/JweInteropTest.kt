package dev.teylor.argos.capture

import com.nimbusds.jose.*
import com.nimbusds.jose.crypto.RSAEncrypter
import com.nimbusds.jose.jwk.RSAKey
import org.junit.Assert.assertEquals
import org.junit.Assume.assumeNotNull
import org.junit.Test
import java.io.File

class JweInteropTest {
    @Test fun encryptWithAndroidLibraryForNodeVerification() {
        val input = System.getenv("ARGOS_INTEROP_DIR")
        assumeNotNull(input)
        val directory = File(input!!)
        val key = RSAKey.parse(File(directory, "public.json").readText())
        val payload = File(directory, "payload.json").readText()
        val jwe = JWEObject(JWEHeader.Builder(JWEAlgorithm.RSA_OAEP_256, EncryptionMethod.A256GCM).keyID(key.keyID).build(), Payload(payload))
        jwe.encrypt(RSAEncrypter(key))
        File(directory, "android.jwe").writeText(jwe.serialize())
        assertEquals(5, jwe.serialize().split('.').size)
    }
}
