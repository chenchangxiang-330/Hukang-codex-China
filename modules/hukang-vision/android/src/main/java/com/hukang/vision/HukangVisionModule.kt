package com.hukang.vision

import android.content.Context
import android.os.SystemClock
import com.paddle.ocr.EngineConfig
import com.paddle.ocr.PaddleOCRConfig
import com.paddle.ocr.engine.OCREngine
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.time.Instant
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicBoolean

/** Local image operations and native inference only; no network, semantic parser or fallback. */
class HukangVisionModule : Module() {
  private val destroyed = AtomicBoolean(false)
  private val queue = Executors.newSingleThreadExecutor { runnable -> Thread(runnable, "Hukang-OCR") }
  // Accessed only by queue: OpenCV/session initialization and inference cannot race.
  private var engine: OCREngine? = null
  private var modelHashes: Map<String, String> = emptyMap()

  override fun definition() = ModuleDefinition {
    Name("HukangVision")

    AsyncFunction("prepareImage") { uri: String, promise: Promise ->
      submit(promise, "IMAGE_PREPARE_FAILED") {
        val started = SystemClock.elapsedRealtime()
        val store = ImageStore(context())
        val result = store.prepare(uri)
        store.recordPreprocessing(result, SystemClock.elapsedRealtime() - started, 0L)
      }
    }

    AsyncFunction("transformImage") { uri: String, rotationDegrees: Int, crop: Map<String, Double>?, promise: Promise ->
      submit(promise, "IMAGE_TRANSFORM_FAILED") {
        val started = SystemClock.elapsedRealtime()
        val store = ImageStore(context())
        val result = store.transform(uri, rotationDegrees, crop)
        val previousMs = (result["preprocessingMs"] as? Number)?.toLong() ?: 0L
        store.recordPreprocessing(result, SystemClock.elapsedRealtime() - started, previousMs)
      }
    }

    AsyncFunction("recognize") { uri: String, promise: Promise ->
      submit(promise, "OCR_FAILED") { recognizeImage(uri) }
    }

    AsyncFunction("fileSha256") { uri: String, promise: Promise ->
      submit(promise, "FILE_HASH_FAILED") { ImageStore(context()).fileSha256(uri) }
    }

    OnDestroy {
      // Module teardown can be requested more than once. Release sessions on
      // the inference queue, after an in-flight inference has relinquished them.
      if (destroyed.compareAndSet(false, true)) {
        queue.execute { engine?.release(); engine = null }
        queue.shutdown()
      }
    }
  }

  private fun context(): Context = appContext.reactContext?.applicationContext
    ?: throw IllegalStateException("Android context is unavailable")

  private fun submit(promise: Promise, code: String, action: () -> Map<String, Any?>) {
    if (destroyed.get()) {
      promise.reject("MODULE_DESTROYED", "OCR module is no longer active", null)
      return
    }
    try {
      queue.execute {
        try {
          check(!destroyed.get()) { "OCR module is no longer active" }
          val result = action()
          if (destroyed.get()) promise.reject("MODULE_DESTROYED", "OCR module is no longer active", null)
          else promise.resolve(result)
        } catch (error: Throwable) {
          promise.reject(code, error.message ?: "Local operation failed", error)
        }
      }
    } catch (error: RejectedExecutionException) {
      promise.reject("MODULE_DESTROYED", "OCR module is no longer active", error)
    }
  }

  private fun recognizeImage(uri: String): Map<String, Any?> {
    val started = SystemClock.elapsedRealtime()
    val store = ImageStore(context())
    val metadata = store.metadata(uri)
    val bitmap = store.decodePrepared(uri)
    val imageDecodeMs = SystemClock.elapsedRealtime() - started
    val sampler = MemorySampler()
    var samplingFinished = false
    try {
      var loadMs = 0L
      if (engine == null) {
        val loadStarted = SystemClock.elapsedRealtime()
        verifyModels(context())
        System.loadLibrary("opencv_java4")
        engine = OCREngine(context(), PaddleOCRConfig(), EngineConfig(numThreads = 2),
          detModelAsset = "$MODEL_DIRECTORY/detector.onnx",
          recModelAsset = "$MODEL_DIRECTORY/recognizer.onnx",
          recConfigAsset = "$MODEL_DIRECTORY/inference.yml")
        loadMs = SystemClock.elapsedRealtime() - loadStarted
      }
      val activeEngine = requireNotNull(engine)
      val result = activeEngine.run(bitmap)
      val blocks = result.results.mapIndexed { index, item ->
        require(item.confidence.isFinite() && item.confidence in 0f..1f) { "OCR returned invalid confidence" }
        val points = item.box.points
        require(points.all { it.x.isFinite() && it.y.isFinite() }) { "OCR returned invalid geometry" }
        mapOf("id" to "line-$index", "text" to item.text, "page" to 0,
          "confidence" to item.confidence,
          "boundingBox" to mapOf("left" to points.minOf { it.x }, "top" to points.minOf { it.y },
            "right" to points.maxOf { it.x }, "bottom" to points.maxOf { it.y }),
          "polygon" to points.map { mapOf("x" to it.x, "y" to it.y) })
      }
      val memory = sampler.finish()
      samplingFinished = true
      return store.saveRun(mapOf(
        "id" to java.util.UUID.randomUUID().toString(),
        "createdAt" to Instant.now().toString(),
        "rawText" to result.results.joinToString("\n") { it.text },
        "blocks" to blocks,
        "page" to 0,
        "imageUri" to uri,
        "originalImageUri" to metadata["originalUri"],
        "sourceImageHash" to metadata["sourceImageHash"],
        "processedImageHash" to metadata["processedImageHash"],
        "preprocessingTransform" to metadata["transform"],
        "width" to bitmap.width, "height" to bitmap.height,
        "engineVersion" to "PaddleOCR-v3.7.0-hukang.1/ONNX-Runtime-1.21.1-CPU",
        "modelVersion" to "PP-OCRv5_mobile_det_onnx+PP-OCRv5_mobile_rec_onnx",
        "modelHashes" to modelHashes,
        "modelLoadMs" to loadMs,
        "modelColdLoadMs" to activeEngine.coldLoadTimeMs,
        "imageDecodeMs" to imageDecodeMs,
        "ocrMs" to result.totalTimeMs,
        "totalMs" to (SystemClock.elapsedRealtime() - started),
        "timings" to mapOf(
          "detPreprocessMs" to result.detPreprocessMs, "detInferenceMs" to result.detInferenceMs,
          "detPostprocessMs" to result.detPostprocessMs, "recPreprocessMs" to result.recPreprocessMs,
          "recInferenceMs" to result.recInferenceMs, "recPostprocessMs" to result.recPostprocessMs,
          "pipelineOverheadMs" to result.pipelineOverheadMs,
          "detInputShape" to result.detInputShape, "recInputShapes" to result.recInputShapes),
        "memory" to memory
      ))
    } finally {
      if (!samplingFinished) sampler.finish()
      bitmap.recycle()
    }
  }

  private fun verifyModels(context: Context) {
    val manifest = context.assets.open("$MODEL_DIRECTORY/manifest.json").bufferedReader().use { JSONObject(it.readText()) }
    val models = manifest.getJSONObject("models")
    val verified = mutableMapOf<String, String>()
    for ((kind, filename) in listOf("detector" to "detector.onnx", "recognizer" to "recognizer.onnx")) {
      val expected = EXPECTED_MODEL_HASHES.getValue(kind)
      require(models.getJSONObject(kind).getString("sha256") == expected) { "Bundled model manifest hash mismatch: $kind" }
      val actual = context.assets.open("$MODEL_DIRECTORY/$filename").use { ImageStore.sha256(it) }
      require(actual == expected) { "Bundled model SHA-256 mismatch: $kind" }
      verified[kind] = actual
      // The recognizer dictionary lives in its official YAML. A matching ONNX
      // hash alone cannot protect decoding from a replaced/reordered dictionary.
      val configFilename = if (kind == "detector") "detector.yml" else "inference.yml"
      val expectedConfigHash = models.getJSONObject(kind).getString("configSha256")
      require(expectedConfigHash.matches(Regex("[0-9a-f]{64}"))) { "Official configuration hash is not locked: $kind" }
      val actualConfigHash = context.assets.open("$MODEL_DIRECTORY/$configFilename").use { ImageStore.sha256(it) }
      require(actualConfigHash == expectedConfigHash) { "Bundled configuration SHA-256 mismatch: $kind" }
      verified["${kind}Config"] = actualConfigHash
    }
    modelHashes = verified.toMap()
  }

  companion object {
    private const val MODEL_DIRECTORY = "models/paddleocr/v5-mobile"
    private val EXPECTED_MODEL_HASHES = mapOf(
      "detector" to "a431985659dc921974177a95adcfbb90fd9e51989a5e04d70d0b75f597b6e61d",
      "recognizer" to "da72dc72ca4dc220df0dfde68c1dedc31c58d3e76a25871122e5056227d50092"
    )
  }
}
