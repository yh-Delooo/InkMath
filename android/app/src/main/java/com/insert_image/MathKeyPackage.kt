package com.supernote_math_llm

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class MathKeyPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(MathKeyModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

class MathKeyModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "SupernoteMathKeys"
  private val alias = "snmllm4e9a6c2f8b.keys.v1"
  private val prefs = context.getSharedPreferences(alias, 0)
  @Synchronized private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(alias, null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    }.generateKey()
  }
  @ReactMethod fun read(endpoint: String, promise: Promise) {
    try {
      val stored = prefs.getString(endpoint, null)
      if (stored == null) { promise.resolve(""); return }
      val parts = stored.split(":")
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)))
      cipher.updateAAD(endpoint.toByteArray(Charsets.UTF_8))
      promise.resolve(String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), Charsets.UTF_8))
    } catch (e: Exception) { promise.reject("KEY_READ", "无法读取已保存的 API Key，请重新填写。") }
  }
  @ReactMethod fun write(endpoint: String, value: String, promise: Promise) {
    try {
      val edit = prefs.edit()
      if (value.isEmpty()) edit.remove(endpoint) else {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        cipher.updateAAD(endpoint.toByteArray(Charsets.UTF_8))
        edit.putString(endpoint, Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" +
          Base64.encodeToString(cipher.doFinal(value.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP))
      }
      if (!edit.commit()) throw IllegalStateException()
      promise.resolve(true)
    } catch (e: Exception) { promise.reject("KEY_WRITE", "API Key 保存失败。") }
  }
}
