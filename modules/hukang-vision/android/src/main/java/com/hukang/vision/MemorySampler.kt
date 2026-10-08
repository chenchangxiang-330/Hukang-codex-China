package com.hukang.vision

import android.os.Debug
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Sampled process PSS is observable evidence, not a guarantee of absolute peak RSS. */
internal class MemorySampler {
  private val executor = Executors.newSingleThreadScheduledExecutor()
  private var peakPssKb = 0L
  private var peakJavaBytes = 0L
  private var peakNativeBytes = 0L
  private var count = 0L
  private val task = executor.scheduleAtFixedRate({ sample() }, 0, 50, TimeUnit.MILLISECONDS)

  @Synchronized private fun sample() {
    val memory = Debug.MemoryInfo()
    Debug.getMemoryInfo(memory)
    val runtime = Runtime.getRuntime()
    peakPssKb = maxOf(peakPssKb, memory.totalPss.toLong())
    peakJavaBytes = maxOf(peakJavaBytes, runtime.totalMemory() - runtime.freeMemory())
    peakNativeBytes = maxOf(peakNativeBytes, Debug.getNativeHeapAllocatedSize())
    count++
  }

  fun finish(): Map<String, Number> {
    task.cancel(false)
    executor.shutdown()
    sample()
    return synchronized(this) {
      mapOf("observedPeakPssKb" to peakPssKb, "observedPeakJavaHeapBytes" to peakJavaBytes,
        "observedPeakNativeHeapBytes" to peakNativeBytes, "samplingIntervalMs" to 50, "sampleCount" to count)
    }
  }
}
