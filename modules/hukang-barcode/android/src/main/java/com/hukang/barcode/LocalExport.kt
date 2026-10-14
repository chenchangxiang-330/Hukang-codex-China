package com.hukang.barcode

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.UUID
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import org.json.JSONArray
import org.json.JSONObject

/** App-private files only. No network, keys or arbitrary filesystem export. */
object LocalExport {
  fun create(context: Context, payload: String, assets: List<Map<String, Any?>>): Map<String, Any> {
    require(payload.length <= 32_000_000) { "数据过大，请分批导出。" }
    require(assets.size <= 4000) { "照片数量过多，请分批导出。" }
    JSONObject(payload)
    val root = File(context.cacheDir, "hukang-exports").apply { mkdirs() }
    root.listFiles()?.filter { System.currentTimeMillis() - it.lastModified() > 86400000L }?.forEach { it.delete() }
    val output = File(root, "hukang-${UUID.randomUUID()}.zip")
    val fileManifest = JSONArray()
    val names = mutableSetOf("data.json", "files.json")
    try {
      ZipOutputStream(FileOutputStream(output).buffered()).use { zip ->
        zip.putNextEntry(ZipEntry("data.json")); zip.write(payload.toByteArray(Charsets.UTF_8)); zip.closeEntry()
        for (asset in assets) {
          val uri = Uri.parse(asset["uri"] as? String ?: error("照片缺少本机路径。"))
          require(uri.scheme == "file") { "只允许导出已经导入本机的照片。" }
          val file = File(requireNotNull(uri.path)).canonicalFile
          val roots = listOf(context.filesDir.canonicalPath, context.cacheDir.canonicalPath)
          require(roots.any { file.path.startsWith("$it/") } && file.isFile && file.length() <= 64L*1024*1024) { "照片不存在或不属于本应用。" }
          val path = asset["path"] as? String ?: error("照片缺少相对路径。")
          require(Regex("photos/[A-Za-z0-9_-]+\\.(jpg|png|source)").matches(path) && names.add(path)) { "导出文件名无效或重复。" }
          zip.putNextEntry(ZipEntry(path))
          val digest = MessageDigest.getInstance("SHA-256")
          var count = 0L
          val stream = object : java.io.OutputStream() {
            override fun write(b: Int) { zip.write(b); digest.update(b.toByte()); count++ }
            override fun write(b: ByteArray, off: Int, len: Int) { zip.write(b,off,len); digest.update(b,off,len); count += len }
          }
          if (asset["stripMetadata"] == true) {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(file.path,bounds)
            require(bounds.outWidth > 0 && bounds.outHeight > 0) { "照片无法读取，导出已取消。" }
            var sample=1
            while (bounds.outWidth.toLong()*bounds.outHeight/sample/sample > 12_000_000) sample*=2
            val bitmap = BitmapFactory.decodeFile(file.path,BitmapFactory.Options().apply { inSampleSize=sample }) ?: error("照片解码失败。")
            try { require(bitmap.compress(Bitmap.CompressFormat.JPEG,95,stream)) { "照片写入失败。" } } finally { bitmap.recycle() }
          } else FileInputStream(file).use { it.copyTo(stream) }
          zip.closeEntry()
          fileManifest.put(JSONObject().put("path",path).put("bytes",count).put("sha256",digest.digest().joinToString("") { "%02x".format(it) }))
        }
        zip.putNextEntry(ZipEntry("files.json")); zip.write(fileManifest.toString(2).toByteArray()); zip.closeEntry()
      }
      val hash = MessageDigest.getInstance("SHA-256")
      FileInputStream(output).use { input ->
        val buffer = ByteArray(65536)
        while (true) { val n = input.read(buffer); if(n < 0) break; hash.update(buffer,0,n) }
      }
      return mapOf("uri" to Uri.fromFile(output).toString(), "bytes" to output.length(), "sha256" to hash.digest().joinToString("") { "%02x".format(it) })
    } catch (error: Exception) { output.delete(); throw error }
  }
}
