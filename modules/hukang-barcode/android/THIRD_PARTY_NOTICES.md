# Third-party notices

## ZXing core 3.5.3

`com.google.zxing:core:3.5.3` is used only as an on-device barcode decoder. It
is Apache License 2.0 software. It has no Google Play Services, ML Kit, HTTP
client, telemetry, or model-download dependency. The application never sends
image bytes or decoded values to a network service.

License: <https://www.apache.org/licenses/LICENSE-2.0>
Source: <https://github.com/zxing/zxing/releases/tag/zxing-3.5.3>

## AndroidX CameraX 1.4.2

`androidx.camera:camera-camera2:1.4.2`, `androidx.camera:camera-lifecycle:1.4.2`
and `androidx.camera:camera-view:1.4.2` provide the native live preview and
Y-plane frame stream in `LiveBarcodeView`. ZXing performs the EAN/UPC decode
on those frames. These CameraX artifacts are Apache License 2.0 software and
do not include ML Kit, `camera-mlkit-vision`, Google Play Services, HTTP
clients, telemetry or model downloads.

The implementation handles CameraX's 0/90/180/270 degree frame corrections
and releases the camera when the scanner leaves the foreground. Physical
camera validation is still pending: the recorded device flow used an Android
emulator and an album/synthetic barcode, so it does not prove real OPPO camera
focus, exposure, torch or continuous-frame performance.

License: <https://www.apache.org/licenses/LICENSE-2.0>
Source: <https://developer.android.com/jetpack/androidx/releases/camera>
