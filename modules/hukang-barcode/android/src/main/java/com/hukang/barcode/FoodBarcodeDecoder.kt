package com.hukang.barcode

import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.NotFoundException
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.Result
import com.google.zxing.ResultPoint
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.multi.GenericMultipleBarcodeReader

/**
 * Shared local decoder for camera frames and imported images. A single result
 * must be established only after checking all right-angle orientations: a
 * second, differently oriented barcode must never be silently ignored.
 * Two distinct results are sufficient to signal ambiguity; this is not a
 * general-purpose inventory of every barcode in an image.
 */
internal object FoodBarcodeDecoder {
  private val hints = mapOf(
    DecodeHintType.POSSIBLE_FORMATS to listOf(
      BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
    ),
    DecodeHintType.TRY_HARDER to true,
  )

  fun decode(data: ByteArray, width: Int, height: Int, preferredRotation: Int = 0): List<Result> {
    require(width > 0 && height > 0 && data.size.toLong() == width.toLong() * height) { "Invalid image dimensions" }
    val results = linkedMapOf<String, Result>()
    for (rotation in listOf(preferredRotation, 0, 90, 180, 270).distinct()) {
      val frame = rotate(data, width, height, rotation)
      val source = PlanarYUVLuminanceSource(frame.data, frame.width, frame.height, 0, 0, frame.width, frame.height, false)
      val reader = MultiFormatReader()
      try {
        val found = GenericMultipleBarcodeReader(reader).decodeMultiple(BinaryBitmap(HybridBinarizer(source)), hints)
        for (result in found) {
          if (result.text.isBlank()) continue
          val key = "${result.barcodeFormat.name}:${result.text}"
          results.putIfAbsent(key, restorePoints(result, rotation, width, height))
          if (results.size > 1) return results.values.toList()
        }
      } catch (_: NotFoundException) {
        // No result at this orientation; an empty list is different from ambiguity.
      } finally { reader.reset() }
    }
    return results.values.toList()
  }

  private fun restorePoints(result: Result, rotation: Int, width: Int, height: Int): Result {
    val points = result.resultPoints?.map { point ->
      when (rotation) {
        90 -> ResultPoint(point.y, height - 1f - point.x)
        180 -> ResultPoint(width - 1f - point.x, height - 1f - point.y)
        270 -> ResultPoint(width - 1f - point.y, point.x)
        else -> point
      }
    }?.toTypedArray()
    return Result(result.text, result.rawBytes, result.numBits, points, result.barcodeFormat, result.timestamp).also {
      it.putAllMetadata(result.resultMetadata)
    }
  }

  private data class Frame(val data: ByteArray, val width: Int, val height: Int)

  private fun rotate(data: ByteArray, width: Int, height: Int, degrees: Int): Frame = when (degrees) {
    0 -> Frame(data, width, height)
    90 -> Frame(ByteArray(data.size).also { output ->
      for (y in 0 until height) for (x in 0 until width) output[x * height + height - 1 - y] = data[y * width + x]
    }, height, width)
    180 -> Frame(ByteArray(data.size).also { output ->
      for (y in 0 until height) for (x in 0 until width) output[(height - 1 - y) * width + width - 1 - x] = data[y * width + x]
    }, width, height)
    270 -> Frame(ByteArray(data.size).also { output ->
      for (y in 0 until height) for (x in 0 until width) output[(width - 1 - x) * height + y] = data[y * width + x]
    }, height, width)
    else -> error("Unsupported camera rotation: $degrees")
  }
}
