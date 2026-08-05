package com.lilongtao.talkio

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.webkit.JavascriptInterface
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import java.security.MessageDigest
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class SecretStoreBridge(context: Context) {
    private val storageDir = File(context.noBackupFilesDir, "provider-secrets")
    private val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }

    init {
        storageDir.mkdirs()
    }

    @JavascriptInterface
    fun set(account: String, secret: String): String = respond {
        validateAccount(account)
        if (secret.isEmpty()) {
            secretFile(account).delete()
            return@respond null
        }

        val cipher = Cipher.getInstance(CIPHER_TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val encrypted = cipher.doFinal(secret.toByteArray(Charsets.UTF_8))
        val payload = byteArrayOf(PAYLOAD_VERSION, cipher.iv.size.toByte()) + cipher.iv + encrypted
        val target = secretFile(account)
        val temporary = File(storageDir, "${target.name}.tmp")
        temporary.writeBytes(payload)
        if (!temporary.renameTo(target)) {
            temporary.delete()
            throw IllegalStateException("Unable to persist encrypted secret")
        }
        null
    }

    @JavascriptInterface
    fun get(account: String): String = respond {
        validateAccount(account)
        val file = secretFile(account)
        if (!file.exists()) return@respond null

        val payload = file.readBytes()
        if (payload.size < 3 || payload[0] != PAYLOAD_VERSION) {
            throw IllegalStateException("Invalid encrypted secret payload")
        }
        val ivLength = payload[1].toInt() and 0xff
        if (ivLength !in 12..16 || payload.size <= 2 + ivLength) {
            throw IllegalStateException("Invalid encrypted secret IV")
        }
        val iv = payload.copyOfRange(2, 2 + ivLength)
        val encrypted = payload.copyOfRange(2 + ivLength, payload.size)
        val cipher = Cipher.getInstance(CIPHER_TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(128, iv))
        String(cipher.doFinal(encrypted), Charsets.UTF_8)
    }

    @JavascriptInterface
    fun delete(account: String): String = respond {
        validateAccount(account)
        if (secretFile(account).exists() && !secretFile(account).delete()) {
            throw IllegalStateException("Unable to delete encrypted secret")
        }
        null
    }

    private fun getOrCreateKey(): SecretKey {
        val existing = keyStore.getKey(KEY_ALIAS, null) as? SecretKey
        if (existing != null) return existing

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    private fun secretFile(account: String): File {
        val digest = MessageDigest.getInstance("SHA-256").digest(account.toByteArray(Charsets.UTF_8))
        val filename = digest.joinToString("") { byte -> "%02x".format(byte) }
        return File(storageDir, filename)
    }

    private fun validateAccount(account: String) {
        require(ACCOUNT_PATTERN.matches(account)) { "Invalid secret account" }
    }

    private fun respond(action: () -> String?): String = try {
        JSONObject().put("ok", true).put("value", action()).toString()
    } catch (error: Exception) {
        JSONObject()
            .put("ok", false)
            .put("error", error.message ?: "Native secret store failed")
            .toString()
    }

    companion object {
        private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
        private const val KEY_ALIAS = "talkio-provider-secrets-v1"
        private const val CIPHER_TRANSFORMATION = "AES/GCM/NoPadding"
        private const val PAYLOAD_VERSION: Byte = 1
        private val ACCOUNT_PATTERN = Regex("^[A-Za-z0-9._:-]{1,128}$")
    }
}
