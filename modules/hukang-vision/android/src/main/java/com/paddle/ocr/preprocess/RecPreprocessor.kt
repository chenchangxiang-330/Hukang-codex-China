// Copyright (c) 2026 PaddlePaddle Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package com.paddle.ocr.preprocess

import org.opencv.core.Core
import org.opencv.core.CvType
import org.opencv.core.Mat
import org.opencv.core.Scalar
import org.opencv.core.Size
import org.opencv.imgproc.Imgproc
import kotlin.math.ceil

// Modified by Hukang: BGR, fixed 48px height, reference-width zero padding,
// and deterministic release of intermediate native buffers.
data class RecPreprocessResult(val tensorData: FloatArray, val shape: LongArray)

object RecPreprocessor {
    private const val FIXED_HEIGHT = 48
    private const val MIN_IMG_W = 320
    private const val MAX_IMG_W = 3200

    fun preprocessBatch(crops: List<Mat>): RecPreprocessResult {
        require(crops.isNotEmpty()) { "Recognition requires at least one crop" }
        crops.forEach { require(!it.empty() && it.channels() == 3) { "Invalid BGR text crop" } }
        // PaddleX OCRReisizeNormImg uses int(h*max_ratio), not ceil, for the
        // padded tensor width. With batch size one this exactly follows resize().
        val maxRatio = maxOf(MIN_IMG_W.toDouble() / FIXED_HEIGHT, crops.maxOf { it.cols().toDouble() / it.rows() })
        val tensorWidth = (FIXED_HEIGHT * maxRatio).toInt().coerceIn(MIN_IMG_W, MAX_IMG_W)
        val channelSize = FIXED_HEIGHT * tensorWidth
        val tensor = FloatArray(crops.size * 3 * channelSize) // normalized zero padding
        crops.forEachIndexed { batch, crop ->
            val resizedWidth = ceil(FIXED_HEIGHT * crop.cols().toDouble() / crop.rows()).toInt().coerceIn(1, tensorWidth)
            val resized = Mat()
            val floats = Mat()
            val channels = mutableListOf<Mat>()
            try {
                // Keep BGR: the fixed PP-OCRv5 mobile inference.yml says BGR.
                Imgproc.resize(crop, resized, Size(resizedWidth.toDouble(), FIXED_HEIGHT.toDouble()), 0.0, 0.0, Imgproc.INTER_LINEAR)
                resized.convertTo(floats, CvType.CV_32F)
                Core.divide(floats, Scalar(127.5, 127.5, 127.5), floats)
                Core.subtract(floats, Scalar(1.0, 1.0, 1.0), floats)
                Core.split(floats, channels)
                for (channel in 0..2) {
                    val values = FloatArray(FIXED_HEIGHT * resizedWidth)
                    channels[channel].get(0, 0, values)
                    for (row in 0 until FIXED_HEIGHT) {
                        System.arraycopy(values, row * resizedWidth, tensor,
                            (batch * 3 + channel) * channelSize + row * tensorWidth, resizedWidth)
                    }
                }
            } finally {
                channels.forEach { it.release() }
                floats.release()
                resized.release()
            }
        }
        return RecPreprocessResult(tensor, longArrayOf(crops.size.toLong(), 3, FIXED_HEIGHT.toLong(), tensorWidth.toLong()))
    }
}
