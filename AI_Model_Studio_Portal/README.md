# AI Model Studio Portal

Optional Python proxy version of the Alibaba Cloud Model Studio demo console.

The primary demo is the GitHub Pages app at:

```text
https://khawzk.github.io/ModelStudio/
```

Use this folder only when a private backend is needed, such as realtime WebSocket LiveTranslate or another endpoint that cannot be called directly from a browser because of authorization or CORS policy.

## Demo Surface

- Text Intelligence: Qwen-compatible chat models for PoC scoping and customer follow-up.
- Vision Lab: image upload or URL analysis with Qwen multimodal models.
- Omni Lab: Qwen-Omni and LiveTranslate proxy experiments.
- Image Studio: Qwen image editing, upload/camera input, image fusion, and image generation.
- Speech AI: audio upload and ASR with Qwen speech models.
- Session: run history for customer-facing demo evidence.

## BYOK

The project is BYOK: bring your own DashScope / Model Studio API key.

The frontend accepts a key at runtime. For private backend demos, the server can also read `DASHSCOPE_API_KEY` from the environment.

## Optional Backend Run

```bash
python3 -m pip install -r requirements.txt
python3 server.py
```

Then open the server URL shown by the script and paste a DashScope / Model Studio API key into the UI.

Optional environment key:

```bash
export DASHSCOPE_API_KEY="your-api-key"
python3 server.py
```

## References

- Model Studio models: https://www.alibabacloud.com/help/en/model-studio/models
- Wan image generation and editing: https://www.alibabacloud.com/help/en/model-studio/wan-image-generation-and-editing-api-reference
- LiveTranslate realtime: https://www.alibabacloud.com/help/en/model-studio/qwen3-5-livetranslate-flash-realtime
