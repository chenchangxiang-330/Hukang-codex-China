# PaddleOCR model provenance and attribution

These detector and recognizer models are authored and published by the
PaddlePaddle / PaddleOCR project. Their official model cards declare Apache-2.0.
The Apache-2.0 license text is preserved in `LICENSE-PaddleOCR.txt`, obtained from
the fixed PaddleOCR v3.7.0 source tree.

- PaddleOCR source: https://github.com/PaddlePaddle/PaddleOCR/tree/v3.7.0
- Detector card: https://huggingface.co/PaddlePaddle/PP-OCRv5_mobile_det_onnx
- Recognizer card: https://huggingface.co/PaddlePaddle/PP-OCRv5_mobile_rec_onnx

The bundled ONNX files retain the official model bytes. Original inference YAML
is retained without reserialization. The application adapter changes are in the
Kotlin module, not changes to the models or their embedded character dictionary.
The manifest records exact revision identifiers, expected and measured hashes,
and the source used to acquire each artifact.

No model is downloaded by the Android application. `scripts/fetch-models.py` is a
developer/build-time utility, not a production function.
