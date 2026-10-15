package com.hukang.barcode

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import com.google.zxing.RGBLuminanceSource
import com.google.zxing.Result
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import java.time.Instant
import kotlin.math.max
import kotlin.math.min

/**
 * Offline barcode decoding only. This module deliberately does not use
 * expo-camera: Expo Camera's Android barcode implementation brings Google
 * ML Kit and Play Services into the production graph. Camera preview/capture
 * can hand a local file/content URI to scanImage without changing this
 * decoder boundary.
 */
class HukangBarcodeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("HukangBarcode")
    View(LiveBarcodeView::class) {
      Events("onBarcode", "onError")
      Prop("active") { view: LiveBarcodeView, active: Boolean -> view.setActive(active) }
      Prop("torch") { view: LiveBarcodeView, torch: Boolean -> view.setTorch(torch) }
    }
    AsyncFunction("exportArchive") { payload: String, assets: List<Map<String, Any?>> ->
      LocalExport.create(context(), payload, assets)
    }

    /** Decode EAN-13, EAN-8, UPC-A or UPC-E from an app-local image. */
    AsyncFunction("scanImage") { uri: String ->
      BarcodeImageDecoder(context()).decode(uri)
    }
  }

  private fun context(): Context = appContext.reactContext?.applicationContext
    ?: throw IllegalStateException("Android context is unavailable")
}

private class BarcodeImageDecoder(private val context: Context) {
  companion object {
    private const val MAX_SOURCE_BYTES = 50L * 1024L * 1024L
    private const val MAX_PIXELS = 16_000_000L
  }

  fun decode(uriValue: String): List<Map<String, Any?>> {
    val uri = Uri.parse(uriValue)
    require(uri.scheme == "file" || uri.scheme == "content") {
      "条码图片必须来自本地 file:// 或 content:// URI；拒绝网络地址。"
    }
    // A content provider may omit or lie about its size. Materialize with a
    // streaming byte limit before EXIF/bitmap parsing, then remove the copy.
    val copy = if (uri.scheme == "content") copyBoundedContent(uri) else null
    try {
      return decodeLocal(copy?.let(Uri::fromFile) ?: uri, uriValue)
    } finally { copy?.delete() }
  }

  private fun decodeLocal(uri: Uri, sourceUri: String): List<Map<String, Any?>> {
    val orientation = readExifOrientation(uri)
    val bitmap = decodeBitmap(uri)
    var oriented: Bitmap? = null
    try {
      oriented = applyOrientation(bitmap, orientation)
      val image = oriented ?: bitmap
      val source = image.toIntArraySource()
      return FoodBarcodeDecoder.decode(source.matrix, image.width, image.height)
        .map { result -> result.toMap(image.width, image.height, sourceUri) }
    } finally {
      if (oriented != null && oriented !== bitmap) oriented.recycle()
      bitmap.recycle()
    }
  }

  private fun copyBoundedContent(uri: Uri): File {
    val file = File.createTempFile("barcode-source-", ".image", context.cacheDir)
    try {
      requireNotNull(context.contentResolver.openInputStream(uri)) { "无法打开本地图片。" }.use { input ->
        file.outputStream().use { output ->
          val bytes = ByteArray(8192)
          var total = 0L
          while (true) {
            val count = input.read(bytes)
            if (count < 0) break
            total += count
            require(total <= MAX_SOURCE_BYTES) { "条码图片超过 50 MB。" }
            output.write(bytes, 0, count)
          }
        }
      }
      return file
    } catch (error: Exception) {
      file.delete()
      throw error
    }
  }

  private fun readExifOrientation(uri: Uri): Int {
    return try {
      open(uri).use { stream ->
        ExifInterface(stream).getAttributeInt(
          ExifInterface.TAG_ORIENTATION,
          ExifInterface.ORIENTATION_NORMAL,
        )
      }
    } catch (_: Exception) {
      ExifInterface.ORIENTATION_NORMAL
    }
  }

  private fun decodeBitmap(uri: Uri): Bitmap {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    open(uri).use { input -> BitmapFactory.decodeStream(input, null, bounds) }
    require(bounds.outWidth > 0 && bounds.outHeight > 0) { "无法读取条码图片。" }
    var sample = 1
    while ((bounds.outWidth.toLong() / sample) * (bounds.outHeight.toLong() / sample) > MAX_PIXELS) {
      sample *= 2
    }
    val options = BitmapFactory.Options().apply {
      inSampleSize = sample
      inPreferredConfig = Bitmap.Config.ARGB_8888
    }
    return open(uri).use { input ->
      BitmapFactory.decodeStream(input, null, options)
        ?: throw IllegalArgumentException("条码图片解码失败。")
    }
  }

  private fun open(uri: Uri): InputStream {
    return when (uri.scheme) {
      "file" -> {
        val path = requireNotNull(uri.path) { "file URI 缺少路径。" }
        val file = File(path)
        require(file.isFile && file.length() <= MAX_SOURCE_BYTES) { "条码图片不存在或超过 50 MB。" }
        FileInputStream(file)
      }
      else -> error("Unsupported URI scheme")
    }
  }

  private fun applyOrientation(bitmap: Bitmap, orientation: Int): Bitmap? {
    val matrix = Matrix()
    when (orientation) {
      ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.setScale(-1f, 1f)
      ExifInterface.ORIENTATION_ROTATE_180 -> matrix.setRotate(180f)
      ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.setScale(1f, -1f)
      ExifInterface.ORIENTATION_TRANSPOSE -> {
        matrix.setRotate(90f)
        matrix.postScale(-1f, 1f)
      }
      ExifInterface.ORIENTATION_ROTATE_90 -> matrix.setRotate(90f)
      ExifInterface.ORIENTATION_TRANSVERSE -> {
        matrix.setRotate(-90f)
        matrix.postScale(-1f, 1f)
      }
      ExifInterface.ORIENTATION_ROTATE_270 -> matrix.setRotate(-90f)
      else -> return null
    }
    return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
  }

  private fun Bitmap.toIntArraySource(): RGBLuminanceSource {
    val pixels = IntArray(width * height)
    getPixels(pixels, 0, width, 0, 0, width, height)
    return RGBLuminanceSource(width, height, pixels)
  }

  private fun Result.toMap(width: Int, height: Int, source: String): Map<String, Any?> {
    val bounds = resultPoints
      ?.filter { point -> point != null && point.x.isFinite() && point.y.isFinite() }
      ?.let { points ->
        if (points.isEmpty()) null else mapOf(
          "left" to points.minOf { max(0f, min(width.toFloat(), it.x)) },
          "top" to points.minOf { max(0f, min(height.toFloat(), it.y)) },
          "right" to points.maxOf { max(0f, min(width.toFloat(), it.x)) },
          "bottom" to points.maxOf { max(0f, min(height.toFloat(), it.y)) },
        )
      }
    return mapOf(
      "rawValue" to text,
      "format" to barcodeFormat.name,
      "source" to "image",
      "decodedAt" to Instant.now().toString(),
      "boundingBox" to bounds,
      "imageWidth" to width,
      "imageHeight" to height,
      "sourceUri" to source,
    )
  }
}
