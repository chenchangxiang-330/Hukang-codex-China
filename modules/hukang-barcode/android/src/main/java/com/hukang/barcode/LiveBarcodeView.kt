package com.hukang.barcode

import android.content.Context
import android.os.SystemClock
import android.view.MotionEvent
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.NotFoundException
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** CameraX only delivers local frames; ZXing decodes without ML Kit or any service. */
class LiveBarcodeView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  override val shouldUseAndroidLayout = true
  val onBarcode by EventDispatcher()
  val onError by EventDispatcher()
  private val previewView = PreviewView(context).apply {
    implementationMode = PreviewView.ImplementationMode.COMPATIBLE
    scaleType = PreviewView.ScaleType.FILL_CENTER
  }
  private var executor = Executors.newSingleThreadExecutor()
  private var provider: ProcessCameraProvider? = null
  private var camera: Camera? = null
  private var preview: Preview? = null
  private var analysis: ImageAnalysis? = null
  @Volatile private var enabled = false
  @Volatile private var epoch = 0
  private var torch = false
  private val delivered = AtomicBoolean(false)
  private var lastFrame = 0L
  init {
    addView(previewView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    previewView.setOnTouchListener { _, event ->
      if (event.action == MotionEvent.ACTION_UP) {
        val point = previewView.meteringPointFactory.createPoint(event.x, event.y)
        camera?.cameraControl?.startFocusAndMetering(FocusMeteringAction.Builder(point).build())
        performClick()
      }
      true
    }
  }
  override fun performClick(): Boolean { super.performClick(); return true }
  fun setActive(value: Boolean) {
    if (enabled == value) return
    enabled = value; epoch++
    if (value) { delivered.set(false); bind() } else releaseCamera()
  }
  fun setTorch(value: Boolean) {
    torch = value
    camera?.let { if (it.cameraInfo.hasFlashUnit()) it.cameraControl.enableTorch(value) }
  }
  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (executor.isShutdown) executor = Executors.newSingleThreadExecutor()
    post { if (enabled) bind() }
  }
  override fun onDetachedFromWindow() {
    epoch++; releaseCamera(); executor.shutdown(); super.onDetachedFromWindow()
  }
  private fun releaseCamera() {
    analysis?.clearAnalyzer()
    camera?.cameraControl?.enableTorch(false)
    val owned = listOfNotNull(preview, analysis).toTypedArray()
    if (owned.isNotEmpty()) provider?.unbind(*owned)
    preview = null; analysis = null; camera = null
  }
  private fun bind() {
    if (!enabled || !isAttachedToWindow || preview != null) return
    val token = epoch
    val future = ProcessCameraProvider.getInstance(context)
    future.addListener({
      if (!enabled || !isAttachedToWindow || token != epoch || preview != null) return@addListener
      try {
        val owner = appContext.currentActivity as? LifecycleOwner ?: throw IllegalStateException("相机页面尚未准备好，请重新打开拍一拍。")
        provider = future.get()
        val p = Preview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
        val a = ImageAnalysis.Builder().setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).setTargetResolution(android.util.Size(1280, 720)).build()
        a.setAnalyzer(executor) { image -> analyze(image, token) }
        camera = provider!!.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, p, a)
        preview = p; analysis = a; setTorch(torch)
      } catch (error: Exception) {
        releaseCamera(); onError(mapOf("message" to "无法打开相机：${error.message ?: "请检查权限"}"))
      }
    }, ContextCompat.getMainExecutor(context))
  }
  private fun analyze(image: ImageProxy, token: Int) {
    try {
      if (!enabled || token != epoch || delivered.get()) return
      val time = SystemClock.elapsedRealtime()
      if (time - lastFrame < 250) return
      lastFrame = time
      val width = image.width; val height = image.height
      val plane = image.planes[0]; val buffer = plane.buffer.duplicate(); val start = buffer.position()
      val bytes = ByteArray(width * height)
      for (y in 0 until height) for (x in 0 until width) {
        val offset = start + y * plane.rowStride + x * plane.pixelStride
        if (offset < buffer.limit()) bytes[y * width + x] = buffer.get(offset)
      }
      val reader = MultiFormatReader().apply {
        setHints(mapOf(DecodeHintType.POSSIBLE_FORMATS to listOf(BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E), DecodeHintType.TRY_HARDER to true))
      }
      // CameraX keeps the sensor buffer in its native orientation and reports
      // the display correction separately.  Decode the corrected orientation
      // first, then try the other right-angle orientations for devices or
      // labels that arrive rotated relative to the preview.  Using the
      // reported value is important: the previous raw/+90-only loop failed
      // when CameraX reported 180 or 270 degrees (for example after a
      // landscape orientation change).
      val cameraRotation = ((image.imageInfo.rotationDegrees % 360) + 360) % 360
      val rotations = listOf(cameraRotation, 0, 90, 180, 270).distinct()
      for (rotation in rotations) {
        val oriented = rotateLuma(bytes, width, height, rotation)
        try {
          val source = PlanarYUVLuminanceSource(oriented.data, oriented.width, oriented.height, 0, 0, oriented.width, oriented.height, false)
          val result = reader.decodeWithState(BinaryBitmap(HybridBinarizer(source)))
          if (result.text.isNotBlank() && delivered.compareAndSet(false, true)) {
            post { if (enabled && token == epoch && isAttachedToWindow) onBarcode(mapOf("rawValue" to result.text, "format" to result.barcodeFormat.name)) }
          }
          break
        } catch (_: NotFoundException) {
        } finally { reader.reset() }
      }
    } catch (_: Exception) {
      // An undecodable frame is not an application failure; try the next frame.
    } finally { image.close() }
  }

  private data class LumaFrame(val data: ByteArray, val width: Int, val height: Int)

  /** Rotate a tightly packed Y plane without introducing an image dependency. */
  private fun rotateLuma(data: ByteArray, width: Int, height: Int, degrees: Int): LumaFrame {
    return when (degrees) {
      0 -> LumaFrame(data, width, height)
      90 -> LumaFrame(ByteArray(data.size).also { output ->
        for (y in 0 until height) for (x in 0 until width) {
          output[x * height + (height - 1 - y)] = data[y * width + x]
        }
      }, height, width)
      180 -> LumaFrame(ByteArray(data.size).also { output ->
        for (y in 0 until height) for (x in 0 until width) {
          output[(height - 1 - y) * width + (width - 1 - x)] = data[y * width + x]
        }
      }, width, height)
      270 -> LumaFrame(ByteArray(data.size).also { output ->
        for (y in 0 until height) for (x in 0 until width) {
          output[(width - 1 - x) * height + y] = data[y * width + x]
        }
      }, height, width)
      else -> error("Unsupported camera rotation: $degrees")
    }
  }
}
