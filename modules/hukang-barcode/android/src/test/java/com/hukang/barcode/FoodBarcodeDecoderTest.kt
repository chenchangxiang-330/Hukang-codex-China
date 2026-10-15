package com.hukang.barcode

import com.google.zxing.BarcodeFormat
import com.google.zxing.MultiFormatWriter
import org.junit.Assert.*
import org.junit.Test

/** Synthetic ZXing images only. These tests do not claim physical-camera validation. */
class FoodBarcodeDecoderTest {
  private val first = "6901234567892"
  private val second = "6923644266066"
  private data class Image(val data: ByteArray, val width: Int, val height: Int)

  private fun code(value: String, format: BarcodeFormat = BarcodeFormat.EAN_13): Image {
    val bitmap = MultiFormatWriter().encode(value, format, 320, 110)
    return Image(ByteArray(bitmap.width * bitmap.height) { index ->
      if (bitmap[index % bitmap.width, index / bitmap.width]) 0 else 255.toByte()
    }, bitmap.width, bitmap.height)
  }
  private fun turn(image: Image): Image {
    val pixels = ByteArray(image.data.size)
    for (y in 0 until image.height) for (x in 0 until image.width) {
      pixels[x * image.height + image.height - 1 - y] = image.data[y * image.width + x]
    }
    return Image(pixels, image.height, image.width)
  }
  private fun scene(vararg pieces: Triple<Image, Int, Int>): Image {
    val width = 900; val height = 700
    val pixels = ByteArray(width * height) { 255.toByte() }
    pieces.forEach { (image, left, top) ->
      for (y in 0 until image.height) for (x in 0 until image.width) pixels[(top + y) * width + left + x] = image.data[y * image.width + x]
    }
    return Image(pixels, width, height)
  }
  private fun values(image: Image) = FoodBarcodeDecoder.decode(image.data, image.width, image.height).map { it.text }.toSet()

  @Test fun singleBarcodeInEachRotation() {
    var image = scene(Triple(code(first), 170, 180))
    repeat(4) {
      val result = FoodBarcodeDecoder.decode(image.data, image.width, image.height)
      assertEquals(setOf(first), result.map { it.text }.toSet())
      result.single().resultPoints.forEach { point ->
        assertTrue(point.x >= 0 && point.x < image.width)
        assertTrue(point.y >= 0 && point.y < image.height)
      }
      image = turn(image)
    }
  }
  @Test fun allFourFoodFormatsDecodeWithoutDroppingLeadingZero() {
    val cases = listOf(
      first to BarcodeFormat.EAN_13,
      "96385074" to BarcodeFormat.EAN_8,
      "042100005264" to BarcodeFormat.UPC_A,
      "04252614" to BarcodeFormat.UPC_E,
    )
    cases.forEach { (value, format) ->
      val image = scene(Triple(code(value, format), 170, 180))
      val result = FoodBarcodeDecoder.decode(image.data, image.width, image.height).single()
      assertEquals(value, result.text)
      assertEquals(format, result.barcodeFormat)
    }
  }
  @Test fun twoLabelsAboveAndBelowAreAmbiguous() {
    assertEquals(setOf(first, second), values(scene(Triple(code(first), 100, 40), Triple(code(second), 100, 480))))
  }
  @Test fun twoLabelsSideBySideAreAmbiguous() {
    assertEquals(setOf(first, second), values(scene(Triple(code(first), 20, 300), Triple(code(second), 480, 300))))
  }
  @Test fun differentlyRotatedLabelsAreAmbiguous() {
    assertEquals(setOf(first, second), values(scene(Triple(code(first), 20, 60), Triple(turn(code(second)), 670, 280))))
  }
  @Test fun repeatsOfSameValueAreNotDifferentProducts() {
    assertEquals(setOf(first), values(scene(Triple(code(first), 20, 50), Triple(code(first), 480, 480))))
  }
  @Test fun qrCodeIsNotAFoodBarcode() {
    assertTrue(values(scene(Triple(code("https://example.invalid/", BarcodeFormat.QR_CODE), 40, 40))).isEmpty())
  }
  @Test fun blankImageIsNoResult() { assertTrue(values(scene()).isEmpty()) }
}
