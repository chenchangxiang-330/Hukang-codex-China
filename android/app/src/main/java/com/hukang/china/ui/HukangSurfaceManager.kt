package com.hukang.china.ui

import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.views.view.ReactViewGroup
import com.facebook.react.views.view.ReactViewManager

/** Inherits React View's accessibility, event, child-layout and style support. */
@ReactModule(name = HukangSurfaceManager.NAME)
class HukangSurfaceManager : ReactViewManager() {
  companion object { const val NAME = "HukangSurface" }

  override fun getName(): String = NAME
  override fun createViewInstance(context: ThemedReactContext): ReactViewGroup = HukangSurfaceView(context)

  @ReactProp(name = "cornerRadius", defaultFloat = 28f)
  fun setCornerRadius(view: ReactViewGroup, radius: Float) {
    (view as HukangSurfaceView).setCornerRadius(radius)
  }

  @ReactProp(name = "curveBorderWidth", defaultFloat = 0f)
  fun setCurveBorderWidth(view: ReactViewGroup, width: Float) {
    (view as HukangSurfaceView).setCurveBorderWidth(width)
  }

  @ReactProp(name = "curveBorderColor", customType = "Color")
  fun setCurveBorderColor(view: ReactViewGroup, color: Int?) {
    (view as HukangSurfaceView).setCurveBorderColor(color)
  }
}
