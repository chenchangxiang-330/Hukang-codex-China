package com.hukang.china

import android.app.Instrumentation
import android.app.Activity
import android.content.Context
import android.os.Bundle
import java.io.File

/** Installed only on disposable CI emulators, in a separately signed test APK.
 * This class is never compiled into the delivered application APK. No live key. */
class ConnectionProbe : Instrumentation() {
  private var action = ""
  override fun onCreate(arguments: Bundle?) { super.onCreate(arguments); action = arguments?.getString("mode") ?: ""; start() }
  override fun onStart() {
    val result = Bundle()
    try {
      val context = targetContext
      val type = Class.forName("com.hukang.ai.SecureConnection")
      val secure = type.getConstructor(Context::class.java).newInstance(context)
      val read = type.getMethod("read")
      val write = type.getMethod("write", String::class.java)
      val delete = type.getMethod("delete")
      val fixture = """{"config":{"provider":"custom","baseUrl":"https://example.invalid/v1","apiKey":"INSTRUMENTATION-NON-SECRET","model":"native-fixture"},"result":{"endpoint":"https://example.invalid/v1/chat/completions","requestedModel":"native-fixture","responseModel":"native-fixture","response":"isolated fixture, not a provider test","testedAt":"2026-11-03T00:00:00.000Z"}}"""
      when(action) {
        "write" -> {
          write.invoke(secure, fixture)
          check(read.invoke(secure) == fixture)
          val bytes = File(context.noBackupFilesDir,"ai-connection.enc").readBytes()
          check(!bytes.toString(Charsets.UTF_8).contains("INSTRUMENTATION-NON-SECRET"))
        }
        "verify" -> check(read.invoke(secure) == fixture)
        "delete" -> { delete.invoke(secure); check(read.invoke(secure) == null) }
        else -> error("Unknown probe mode")
      }
      result.putString("stream", "SECURE_PROBE_PASS:$action\n")
      finish(Activity.RESULT_OK, result)
    } catch (_: Throwable) {
      result.putString("stream", "SECURE_PROBE_FAILED:$action\n")
      finish(Activity.RESULT_CANCELED, result)
    }
  }
}
