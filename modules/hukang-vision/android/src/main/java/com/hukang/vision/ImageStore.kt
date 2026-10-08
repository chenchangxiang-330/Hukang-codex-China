package com.hukang.vision

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.graphics.RectF
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.InputStream
import java.security.MessageDigest
import java.util.UUID
import kotlin.math.ceil
import kotlin.math.floor

/** Owns lossless derived images and immutable source copies in app-private storage. */
internal class ImageStore(private val context: Context) {
  private val images = File(context.filesDir, "ocr-lab/images").apply { mkdirs() }
  private val runs = File(context.filesDir, "ocr-lab/runs").apply { mkdirs() }

  fun prepare(uri: String): Map<String, Any?> {
    val source = File(images, "${UUID.randomUUID()}.source")
    try {
      openLocal(uri).use { input ->
        source.outputStream().use { output ->
          val buffer = ByteArray(64 * 1024)
          var copied = 0L
          while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            copied += count
            require(copied <= MAX_SOURCE_BYTES) { "Image is larger than the 50 MB import limit" }
            output.write(buffer, 0, count)
          }
          require(copied > 0) { "Image file is empty" }
        }
      }
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeFile(source.path, bounds)
      require(bounds.outWidth > 0 && bounds.outHeight > 0) { "Unsupported or unreadable image" }
      var sample = 1
      while (ceil(bounds.outWidth.toDouble() / sample) > MAX_SIDE ||
        ceil(bounds.outHeight.toDouble() / sample) > MAX_SIDE ||
        ceil(bounds.outWidth.toDouble() / sample) * ceil(bounds.outHeight.toDouble() / sample) > MAX_PIXELS
      ) sample *= 2
      val bitmap = BitmapFactory.decodeFile(source.path, BitmapFactory.Options().apply {
        inSampleSize = sample
        inPreferredConfig = Bitmap.Config.ARGB_8888
      }) ?: throw IllegalArgumentException("Image decoding failed")
      val reportedOrientation = ExifInterface(source).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
      // EXIF 0 means undefined, and malformed values do not identify a valid
      // transform. Treat them as normal while preserving the reported value.
      val orientation = reportedOrientation.takeIf { it in 1..8 } ?: ExifInterface.ORIENTATION_NORMAL
      var oriented: Bitmap? = null
      try {
        val step = orientationMatrix(orientation, bitmap.width, bitmap.height)
        oriented = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, step, true)
        val total = Matrix().apply {
          setScale(bitmap.width.toFloat() / bounds.outWidth, bitmap.height.toFloat() / bounds.outHeight)
          postConcat(step)
        }
        val operations = listOf(
          mapOf("kind" to "decode", "sampleSize" to sample, "width" to bitmap.width, "height" to bitmap.height),
          mapOf("kind" to "exif", "orientation" to orientation, "reportedOrientation" to reportedOrientation)
        )
        return saveDerived(oriented, mapOf(
          "originalUri" to Uri.fromFile(source).toString(),
          "sourceImageHash" to sha256(source),
          "sourceOrientation" to orientation,
          "transform" to mapOf("matrix" to matrixValues(total), "operations" to operations,
            "originalWidth" to bounds.outWidth, "originalHeight" to bounds.outHeight)
        ))
      } finally {
        if (oriented !== bitmap) oriented?.recycle()
        bitmap.recycle()
      }
    } catch (error: Throwable) {
      source.delete()
      throw error
    }
  }

  /** Crop is measured on the current processed image; crop executes before rotation. */
  fun transform(uri: String, rotation: Int, crop: Map<String, Double>?): Map<String, Any?> {
    require(rotation % 90 == 0) { "Rotation must be a multiple of 90 degrees" }
    val metadata = metadata(uri)
    val bitmap = decodePrepared(uri)
    var cropped: Bitmap? = null
    var rotated: Bitmap? = null
    try {
      val total = Matrix().apply {
        val values = ((metadata["transform"] as Map<*, *>)["matrix"] as List<*>).map { (it as Number).toFloat() }.toFloatArray()
        require(values.size == 9) { "Invalid image transform" }
        setValues(values)
      }
      val oldTransform = metadata["transform"] as Map<*, *>
      val operations = (oldTransform["operations"] as List<*>).toMutableList()
      var input = bitmap
      if (crop != null) {
        val leftValue = crop["left"] ?: throw IllegalArgumentException("Crop left is required")
        val topValue = crop["top"] ?: throw IllegalArgumentException("Crop top is required")
        val rightValue = crop["right"] ?: throw IllegalArgumentException("Crop right is required")
        val bottomValue = crop["bottom"] ?: throw IllegalArgumentException("Crop bottom is required")
        require(listOf(leftValue, topValue, rightValue, bottomValue).all { it.isFinite() }) { "Invalid crop coordinates" }
        require(leftValue >= 0 && topValue >= 0 && rightValue <= bitmap.width && bottomValue <= bitmap.height &&
          rightValue > leftValue && bottomValue > topValue) { "Crop is outside the image or empty" }
        val left = floor(leftValue).toInt()
        val top = floor(topValue).toInt()
        val right = ceil(rightValue).toInt()
        val bottom = ceil(bottomValue).toInt()
        cropped = Bitmap.createBitmap(bitmap, left, top, right - left, bottom - top)
        input = cropped
        total.postTranslate(-left.toFloat(), -top.toFloat())
        operations.add(mapOf("kind" to "crop", "left" to left, "top" to top, "right" to right, "bottom" to bottom))
      }
      val degrees = ((rotation % 360) + 360) % 360
      val step = Matrix().apply { setRotate(degrees.toFloat()) }
      normalizeBounds(step, input.width, input.height)
      rotated = Bitmap.createBitmap(input, 0, 0, input.width, input.height, step, true)
      total.postConcat(step)
      operations.add(mapOf("kind" to "rotate", "degreesClockwise" to degrees))
      return saveDerived(rotated, mapOf(
        "originalUri" to metadata["originalUri"],
        "sourceImageHash" to metadata["sourceImageHash"],
        "sourceOrientation" to metadata["sourceOrientation"],
        "transform" to mapOf("matrix" to matrixValues(total), "operations" to operations,
          "originalWidth" to oldTransform["originalWidth"], "originalHeight" to oldTransform["originalHeight"])
      ))
    } finally {
      if (rotated !== cropped && rotated !== bitmap) rotated?.recycle()
      if (cropped !== bitmap) cropped?.recycle()
      bitmap.recycle()
    }
  }

  fun metadata(uri: String): Map<String, Any?> {
    val file = preparedFile(uri)
    val sidecar = File(file.path + ".json")
    require(sidecar.isFile) { "Image must be prepared before OCR or transforms" }
    return jsonObjectToMap(JSONObject(sidecar.readText()))
  }

  fun decodePrepared(uri: String): Bitmap {
    val file = preparedFile(uri)
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.path, bounds)
    require(bounds.outWidth > 0 && bounds.outHeight > 0 && bounds.outWidth <= MAX_SIDE && bounds.outHeight <= MAX_SIDE &&
      bounds.outWidth.toLong() * bounds.outHeight <= MAX_PIXELS) { "Prepared image is invalid or exceeds decode limits" }
    return BitmapFactory.decodeFile(file.path, BitmapFactory.Options().apply { inPreferredConfig = Bitmap.Config.ARGB_8888 })
      ?: throw IllegalArgumentException("Prepared image decoding failed")
  }

  fun saveRun(result: Map<String, Any?>): Map<String, Any?> {
    val file = File(runs, "${UUID.randomUUID()}.json")
    val complete = result + ("evidenceUri" to Uri.fromFile(file).toString())
    file.writeText(JSONObject(complete).toString(2))
    return complete
  }

  private fun saveDerived(bitmap: Bitmap, lineage: Map<String, Any?>): Map<String, Any?> {
    val file = File(images, "${UUID.randomUUID()}.png")
    try {
      file.outputStream().use { require(bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)) { "Image encoding failed" } }
      val result = lineage + mapOf("uri" to Uri.fromFile(file).toString(), "width" to bitmap.width,
        "height" to bitmap.height, "processedImageHash" to sha256(file))
      File(file.path + ".json").writeText(JSONObject(result).toString())
      return result
    } catch (error: Throwable) {
      file.delete()
      File(file.path + ".json").delete()
      throw error
    }
  }

  private fun openLocal(value: String): InputStream {
    val uri = Uri.parse(value)
    return when (uri.scheme) {
      "file" -> File(requireNotNull(uri.path)).inputStream()
      "content" -> context.contentResolver.openInputStream(uri) ?: throw IllegalArgumentException("Image is unavailable")
      else -> throw IllegalArgumentException("Only local file/content image URIs are allowed")
    }
  }

  private fun preparedFile(value: String): File {
    val uri = Uri.parse(value)
    require(uri.scheme == "file") { "Prepared image must be a local file" }
    val file = File(requireNotNull(uri.path)).canonicalFile
    require(file.parentFile == images.canonicalFile && file.isFile && file.extension == "png") { "Unknown prepared image" }
    return file
  }

  companion object {
    const val MAX_SIDE = 4096
    const val MAX_PIXELS = 8_000_000L
    const val MAX_SOURCE_BYTES = 50L * 1024 * 1024

    internal fun orientationMatrix(orientation: Int, width: Int, height: Int): Matrix {
      val values = when (orientation) {
        ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> floatArrayOf(-1f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 1f)
        ExifInterface.ORIENTATION_ROTATE_180 -> floatArrayOf(-1f, 0f, 0f, 0f, -1f, 0f, 0f, 0f, 1f)
        ExifInterface.ORIENTATION_FLIP_VERTICAL -> floatArrayOf(1f, 0f, 0f, 0f, -1f, 0f, 0f, 0f, 1f)
        ExifInterface.ORIENTATION_TRANSPOSE -> floatArrayOf(0f, 1f, 0f, 1f, 0f, 0f, 0f, 0f, 1f)
        ExifInterface.ORIENTATION_ROTATE_90 -> floatArrayOf(0f, -1f, 0f, 1f, 0f, 0f, 0f, 0f, 1f)
        ExifInterface.ORIENTATION_TRANSVERSE -> floatArrayOf(0f, -1f, 0f, -1f, 0f, 0f, 0f, 0f, 1f)
        ExifInterface.ORIENTATION_ROTATE_270 -> floatArrayOf(0f, 1f, 0f, -1f, 0f, 0f, 0f, 0f, 1f)
        else -> floatArrayOf(1f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 1f)
      }
      return Matrix().apply { setValues(values); normalizeBounds(this, width, height) }
    }

    private fun normalizeBounds(matrix: Matrix, width: Int, height: Int) {
      val bounds = RectF(0f, 0f, width.toFloat(), height.toFloat())
      matrix.mapRect(bounds)
      matrix.postTranslate(-bounds.left, -bounds.top)
    }

    private fun matrixValues(matrix: Matrix): List<Float> = FloatArray(9).also { matrix.getValues(it) }.toList()

    internal fun sha256(file: File): String = file.inputStream().use { sha256(it) }

    internal fun sha256(input: InputStream): String {
      val digest = MessageDigest.getInstance("SHA-256")
      val buffer = ByteArray(64 * 1024)
      while (true) {
        val size = input.read(buffer)
        if (size < 0) break
        digest.update(buffer, 0, size)
      }
      return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private fun jsonObjectToMap(obj: JSONObject): Map<String, Any?> = obj.keys().asSequence().associateWith { jsonValue(obj.get(it)) }
    private fun jsonValue(value: Any?): Any? = when (value) {
      JSONObject.NULL -> null
      is JSONObject -> jsonObjectToMap(value)
      is JSONArray -> (0 until value.length()).map { jsonValue(value.get(it)) }
      else -> value
    }
  }
}
