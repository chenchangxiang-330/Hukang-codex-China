package com.hukang.ai

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import java.io.File
import java.util.UUID
import kotlin.math.max
import kotlin.math.roundToInt

/** AI upload copies only. OCR keeps its independent lossless source/transform pipeline. */
internal class UploadImageProcessor(private val context: Context) {
  private val root = File(context.cacheDir, "ai-upload-v1").apply { mkdirs() }
  init {
    // An app restart cannot retain a live request; old unreferenced cache is bounded to 24h.
    root.listFiles()?.filter { System.currentTimeMillis() - it.lastModified() > 86_400_000 }?.forEach { it.deleteRecursively() }
  }
  fun prepare(value: String, stopped: () -> Boolean): Map<String, Any> {
    val work = File(root, UUID.randomUUID().toString()).apply { mkdirs() }
    val source = File(work, "source")
    var decoded: Bitmap? = null
    var oriented: Bitmap? = null
    fun checkCancelled() { if (stopped()) throw ImageFailure("IMAGE_CANCELLED") }
    try {
      checkCancelled()
      val uri = Uri.parse(value)
      val stream = when(uri.scheme) {
        "file" -> File(requireNotNull(uri.path)).inputStream()
        "content" -> context.contentResolver.openInputStream(uri) ?: throw ImageFailure("IMAGE_READ")
        else -> throw ImageFailure("IMAGE_FORMAT")
      }
      stream.use { input -> source.outputStream().use { out ->
        val buffer = ByteArray(65536)
        var bytes = 0L
        while(true) {
          checkCancelled()
          val n = input.read(buffer); if(n < 0) break
          bytes += n
          if(bytes > 50_000_000) throw ImageFailure("IMAGE_SOURCE_SIZE")
          out.write(buffer,0,n)
        }
      } }
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeFile(source.path,bounds)
      if(bounds.outWidth <= 0 || bounds.outHeight <= 0 || bounds.outMimeType !in listOf("image/jpeg","image/png","image/webp","image/heif","image/heic","image/avif")) throw ImageFailure("IMAGE_FORMAT")
      if(bounds.outWidth.toLong()*bounds.outHeight > 120_000_000 || max(bounds.outWidth,bounds.outHeight) > 40000) throw ImageFailure("IMAGE_DIMENSIONS")
      val orientation = try { ExifInterface(source).getAttributeInt(ExifInterface.TAG_ORIENTATION,1).coerceIn(1,8) } catch (_: Exception) { 1 }
      var sample = 1
      while(max(bounds.outWidth,bounds.outHeight).toDouble()/sample > 2048 || bounds.outWidth.toDouble()*bounds.outHeight/(sample.toDouble()*sample) > 4_000_000) sample *= 2
      checkCancelled()
      decoded = BitmapFactory.decodeFile(source.path,BitmapFactory.Options().apply { inSampleSize=sample; inPreferredConfig=Bitmap.Config.ARGB_8888 }) ?: throw ImageFailure("IMAGE_FORMAT")
      checkCancelled()
      val transform = Matrix().apply {
        when(orientation) {
          2 -> setScale(-1f,1f)
          3 -> setRotate(180f)
          4 -> setScale(1f,-1f)
          5 -> { setRotate(90f); postScale(-1f,1f) }
          6 -> setRotate(90f)
          7 -> { setRotate(-90f); postScale(-1f,1f) }
          8 -> setRotate(-90f)
        }
      }
      oriented = Bitmap.createBitmap(decoded,0,0,decoded.width,decoded.height,transform,true)
      val output = File(work,"upload.jpg")
      val steps = listOf(2048 to 88,1600 to 80,1280 to 72,1024 to 64)
      for((index,step) in steps.withIndex()) {
        checkCancelled()
        val scale = minOf(1.0,step.first.toDouble()/max(oriented.width,oriented.height))
        val width = max(1,(oriented.width*scale).roundToInt())
        val height = max(1,(oriented.height*scale).roundToInt())
        val canvasBitmap = Bitmap.createBitmap(width,height,Bitmap.Config.ARGB_8888)
        try {
          val canvas = Canvas(canvasBitmap); canvas.drawColor(Color.WHITE)
          canvas.drawBitmap(oriented,null,android.graphics.Rect(0,0,width,height),android.graphics.Paint(android.graphics.Paint.FILTER_BITMAP_FLAG))
          output.outputStream().use { if(!canvasBitmap.compress(Bitmap.CompressFormat.JPEG,step.second,it)) throw ImageFailure("IMAGE_ENCODE") }
        } finally { canvasBitmap.recycle() }
        checkCancelled()
        if(output.length() in 1..4_000_000) {
          // Re-encoding never copies EXIF, GPS, XMP, thumbnails, comments or original filenames.
          val result = mapOf("uri" to Uri.fromFile(output).toString(),"width" to width,"height" to height,
            "bytes" to output.length(),"mime" to "image/jpeg","originalBytes" to source.length(),
            "originalWidth" to bounds.outWidth,"originalHeight" to bounds.outHeight,"originalMime" to bounds.outMimeType,
            "orientation" to orientation,"steps" to index+1,"metadataRemoved" to true)
          source.delete()
          return result
        }
      }
      throw ImageFailure("IMAGE_LIMIT")
    } catch(error: Throwable) {
      work.deleteRecursively()
      if(error is ImageFailure) throw error
      if(error is OutOfMemoryError) throw ImageFailure("IMAGE_MEMORY")
      throw ImageFailure("IMAGE_READ")
    } finally {
      if(oriented !== decoded) oriented?.recycle()
      decoded?.recycle()
    }
  }
  fun remove(value: String) {
    val uri = Uri.parse(value)
    if(uri.scheme != "file") return
    val file = File(uri.path ?: return).canonicalFile
    val parent = file.parentFile ?: return
    if(parent.parentFile == root.canonicalFile && file.name == "upload.jpg") parent.deleteRecursively()
  }
}
internal class ImageFailure(val errorCode: String): Exception(errorCode)
