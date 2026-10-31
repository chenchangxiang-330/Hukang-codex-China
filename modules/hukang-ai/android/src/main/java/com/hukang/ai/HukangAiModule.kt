package com.hukang.ai

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.net.URI
import java.net.SocketTimeoutException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import javax.net.ssl.HttpsURLConnection

/** Explicit foreground AI calls only. No redirects, cookies, cache, retries or logging.
 * Platform certificate validation is never bypassed. Credentials are never persisted. */
class HukangAiModule : Module() {
  private val queue = Executors.newFixedThreadPool(2)
  private val connections = ConcurrentHashMap<String, HttpsURLConnection>()
  private val cancelled = ConcurrentHashMap.newKeySet<String>()
  private val destroyed = AtomicBoolean(false)

  override fun definition() = ModuleDefinition {
    Name("HukangAi")
    Function("cancel") { id: String ->
      cancelled.add(id)
      connections.remove(id)?.disconnect()
    }
    AsyncFunction("post") { id: String, endpoint: String, key: String, body: String, timeoutMs: Int, promise: Promise ->
      if (destroyed.get()) {
        promise.reject("AI_CANCELLED", "Request cancelled", null)
      } else queue.execute {
        var connection: HttpsURLConnection? = null
        try {
          val uri = URI(endpoint)
          require(uri.scheme == "https" && uri.host != null && uri.userInfo == null && uri.query == null && uri.fragment == null)
          require(key.isNotEmpty() && key.length <= 4096 && key.all { it.code in 33..126 })
          val bytes = body.toByteArray(Charsets.UTF_8)
          require(bytes.size <= 6_000_000)
          check(!destroyed.get() && !cancelled.contains(id))
          connection = uri.toURL().openConnection() as HttpsURLConnection
          connections[id] = connection
          check(!destroyed.get() && !cancelled.contains(id))
          connection.instanceFollowRedirects = false
          connection.useCaches = false
          connection.connectTimeout = timeoutMs.coerceIn(1000, 60000)
          connection.readTimeout = timeoutMs.coerceIn(1000, 60000)
          connection.requestMethod = "POST"
          connection.doOutput = true
          // Fixed-length streaming prevents transparent replay of a charged POST.
          connection.setFixedLengthStreamingMode(bytes.size)
          connection.setRequestProperty("Authorization", "Bearer $key")
          connection.setRequestProperty("Content-Type", "application/json")
          connection.setRequestProperty("Accept", "application/json")
          connection.setRequestProperty("Cache-Control", "no-store")
          connection.outputStream.use { it.write(bytes) }
          val status = connection.responseCode
          // Never follow a redirect or forward credentials to a different host.
          val stream = if (status in 200..299) connection.inputStream else connection.errorStream
          val output = ByteArrayOutputStream()
          stream?.use {
            val buffer = ByteArray(8192)
            while (true) {
              check(!destroyed.get() && !cancelled.contains(id))
              val count = it.read(buffer)
              if (count < 0) break
              if (output.size() + count > 1_000_000) throw ResponseTooLarge()
              output.write(buffer, 0, count)
            }
          }
          check(!destroyed.get() && !cancelled.contains(id))
          promise.resolve(mapOf("status" to status, "body" to output.toString("UTF-8"), "url" to endpoint))
        } catch (_: SocketTimeoutException) {
          promise.reject("AI_TIMEOUT", "Request timed out", null)
        } catch (_: ResponseTooLarge) {
          promise.reject("AI_FORMAT", "Response is too large", null)
        } catch (_: Throwable) {
          // Native exception messages may include URLs or server text; never bridge them.
          promise.reject(if (cancelled.contains(id) || destroyed.get()) "AI_CANCELLED" else "AI_NETWORK", "Request failed", null)
        } finally {
          connections.remove(id)
          connection?.disconnect()
          cancelled.remove(id)
        }
      }
    }
    OnDestroy {
      destroyed.set(true)
      connections.values.forEach { it.disconnect() }
      connections.clear()
      queue.shutdownNow()
      cancelled.clear()
    }
  }
  private class ResponseTooLarge : Exception()
}
