package com.hukang.barcode

/** Generated archive paths only; shared by the real ZIP writer and JVM regression tests. */
internal object ExportPathPolicy {
  private val pattern = Regex("(photos|evidence|drafts|nutrition-photos)/[A-Za-z0-9_-]+(?:/[A-Za-z0-9_.-]+)*\\.(jpg|png|source|json)")

  fun permits(path: String): Boolean =
    !path.split('/').any { it == "." || it == ".." } && pattern.matches(path)
}
