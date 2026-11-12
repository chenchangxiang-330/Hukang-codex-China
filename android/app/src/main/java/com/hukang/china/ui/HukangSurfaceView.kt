package com.hukang.china.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import com.facebook.react.views.view.ReactViewGroup
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sign
import kotlin.math.sin

/** Clips the background and all descendants to a continuous-curvature approximation. */
class HukangSurfaceView(context: Context) : ReactViewGroup(context) {
  private val curve = Path()
  private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
  private var radiusPx = 28f * resources.displayMetrics.density
  private var borderPx = 0f
  private var borderTint = Color.TRANSPARENT
  private var dirty = true

  init {
    // A ViewGroup without a drawable can otherwise bypass draw() entirely.
    setWillNotDraw(false)
  }

  fun setCornerRadius(radiusDp: Float) {
    val next = if (radiusDp.isFinite()) radiusDp.coerceAtLeast(0f) * resources.displayMetrics.density else 0f
    if (next == radiusPx) return
    radiusPx = next
    dirty = true
    invalidate()
  }

  fun setCurveBorderWidth(widthDp: Float) {
    borderPx = if (widthDp.isFinite()) widthDp.coerceAtLeast(0f) * resources.displayMetrics.density else 0f
    invalidate()
  }

  fun setCurveBorderColor(color: Int?) {
    borderTint = color ?: Color.TRANSPARENT
    invalidate()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    dirty = true
  }

  private fun updateCurve() {
    if (!dirty) return
    dirty = false
    curve.rewind()
    val w = width.toFloat()
    val h = height.toFloat()
    val r = min(radiusPx, min(w, h) / 2f)
    if (r <= 0f) {
      curve.addRect(0f, 0f, w, h, Path.Direction.CW)
      return
    }
    // Exponent 4.2 matches the HTML prototype's smooth corner approximation.
    // The straight-edge joins have zero limiting curvature. Cache on size/radius.
    val centers = arrayOf(w - r to r, w - r to h - r, r to h - r, r to r)
    for (corner in 0..3) {
      val (cx, cy) = centers[corner]
      for (step in 0..64) {
        val angle = -PI / 2 + corner * PI / 2 + step * PI / 128
        val x = (cx + r * sign(cos(angle)) * abs(cos(angle)).pow(2.0 / 4.2)).toFloat()
        val y = (cy + r * sign(sin(angle)) * abs(sin(angle)).pow(2.0 / 4.2)).toFloat()
        if (corner == 0 && step == 0) curve.moveTo(x, y) else curve.lineTo(x, y)
      }
    }
    curve.close()
  }

  override fun draw(canvas: Canvas) {
    if (width <= 0 || height <= 0) return
    updateCurve()
    val checkpoint = canvas.save()
    try {
      canvas.clipPath(curve)
      super.draw(canvas)
      if (borderPx > 0f && Color.alpha(borderTint) > 0) {
        stroke.color = borderTint
        // Half is outside the clip, leaving exactly borderPx visible inside.
        stroke.strokeWidth = borderPx * 2f
        canvas.drawPath(curve, stroke)
      }
    } finally {
      canvas.restoreToCount(checkpoint)
    }
  }
}
