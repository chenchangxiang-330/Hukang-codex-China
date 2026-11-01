package com.hukang.barcode

import org.junit.Assert.*
import org.junit.Test

class ExportPathPolicyTest {
  @Test fun retainedDietPhotoAndExistingEvidencePathsAreAccepted() {
    listOf(
      "nutrition-photos/intake-1793520000000-abc123.source",
      "photos/product-1-front.jpg",
      "photos/product-1-nutrition.png",
      "evidence/food-1/current-ocr.json",
      "evidence/food-1/history-1/source-document.json",
      "drafts/draft-1-nutrition-original.source",
    ).forEach { assertTrue(it, ExportPathPolicy.permits(it)) }
  }

  @Test fun newDietDirectoryDoesNotPermitTraversalAbsolutePathsOrOtherFiles() {
    listOf(
      "../nutrition-photos/entry.source",
      "nutrition-photos/../entry.source",
      "nutrition-photos/entry/../../outside.source",
      "nutrition-photos/entry/./photo.source",
      "/nutrition-photos/entry.source",
      "file:///data/user/0/com.hukang.china/files/photo.source",
      "nutrition-photos/entry\\photo.source",
      "nutrition-photos/entry.apk",
      "other/entry.source",
      "data.json",
      "files.json",
    ).forEach { assertFalse(it, ExportPathPolicy.permits(it)) }
  }
}
