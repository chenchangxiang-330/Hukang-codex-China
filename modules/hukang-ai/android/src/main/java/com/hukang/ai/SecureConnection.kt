package com.hukang.ai

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** One encrypted, atomic record; the encryption key never leaves Android Keystore.
 * noBackupFilesDir excludes both the encrypted record and its atomic backup. */
class SecureConnection(context: Context) {
  private val file = AtomicFile(File(context.noBackupFilesDir, "ai-connection.enc"))
  private val alias = "hukang.ai.connection.v1"
  private val aad = "hukang.connection.v1".toByteArray()
  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(alias, null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256).setRandomizedEncryptionRequired(true).build())
    }.generateKey()
  }
  @Synchronized fun read(): String? {
    if (!file.baseFile.exists() && !File(file.baseFile.path + ".bak").exists()) return null
    val bytes = file.openRead().use { it.readBytes() }
    require(bytes.size in 29..32768 && bytes[0].toInt() == 1)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(1, 13)))
    cipher.updateAAD(aad)
    return cipher.doFinal(bytes.copyOfRange(13, bytes.size)).toString(Charsets.UTF_8)
  }
  @Synchronized fun write(value: String) {
    require(value.toByteArray().size <= 24000)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key()); cipher.updateAAD(aad)
    val encrypted = byteArrayOf(1) + cipher.iv + cipher.doFinal(value.toByteArray(Charsets.UTF_8))
    val stream = file.startWrite()
    try { stream.write(encrypted); file.finishWrite(stream) }
    catch (error: Throwable) { file.failWrite(stream); throw error }
  }
  @Synchronized fun delete() {
    // Atomically replace credentials with a non-secret tombstone first. A crash
    // cannot resurrect the old atomic backup or leave an unreadable old record.
    write("null")
    file.delete()
  }
}
