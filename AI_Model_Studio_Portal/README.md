# Alibaba Cloud Model Studio Showcase

Custom demo console for Alibaba Cloud Telesales MYS.

The app presents Model Studio capabilities through a polished web interface across Qwen, Wan, vision, image, video, speech, and realtime translation models. It does not use Streamlit. The frontend is plain HTML/CSS/JS and the Python backend proxies Model Studio API calls when browser-side calls need a server, such as realtime WebSocket LiveTranslate.

## Key Principle

This project is BYOK: bring your own DashScope / Model Studio API key.

The app does not require a committed API key and does not require Terraform-managed infrastructure. Users can paste their own key into the UI at runtime. For local private demos, the backend can also read `DASHSCOPE_API_KEY` from the environment.

## Demo Surface

- Text Intelligence: Qwen-compatible chat models for PoC scoping and customer follow-up.
- Vision Lab: image upload or URL analysis with Qwen multimodal models.
- Omni Models: realtime WAV translation through `qwen3.5-livetranslate-flash-realtime`.
- Image Studio: Qwen image editing, upload/camera input, image fusion, and image generation.
- Video Studio: async text-to-video and image-to-video workflow.
- Speech AI: audio upload and ASR with Qwen speech models.
- Session: run history for customer-facing demo evidence.

## Local Run

```bash
cd AI_Model_Studio_Portal
python3 -m pip install -r requirements.txt
python3 server.py
```

Open:

```text
http://localhost:8501
```

Then paste a DashScope / Model Studio API key into the UI.

Optional local-only environment key:

```bash
export DASHSCOPE_API_KEY="your-api-key"
python3 server.py
```

## Lightweight Hosting Options

GitHub Pages can host the project homepage under `/docs`, but it cannot run the Python backend or safely keep API keys. Use Pages as the public project entry point, then run the demo locally or on a lightweight VM/container when live API calls are needed.

For a short customer session, the simplest live hosting path is:

1. Start a small ECS manually.
2. Clone this repository.
3. Run the Python app.
4. Let each user paste their own API key in the UI.
5. Stop the ECS after the session.

No Terraform is required.

## Manual ECS Run

On a fresh Ubuntu ECS:

```bash
sudo apt-get update
sudo apt-get install -y git python3-pip
git clone https://github.com/khawzk/ModelStudio.git
cd ModelStudio/AI_Model_Studio_Portal
python3 -m pip install -r requirements.txt
python3 server.py
```

Open port `8501` temporarily in the security group, or put Nginx in front of it for a cleaner URL.

## GitHub Pages

This repo includes a Pages workflow in `.github/workflows/pages.yml`. It publishes the browser demo from `docs/`:

```text
https://khawzk.github.io/ModelStudio/
```

The Pages version is BYOK and calls Model Studio REST endpoints directly from the browser where supported. It also includes a sample 16 kHz mono PCM WAV for ASR demos. The local Python version remains useful for realtime WebSocket LiveTranslate and browser CORS fallbacks because native browser WebSocket cannot attach the required `Authorization` header.

Enable it in GitHub:

1. Go to repository Settings.
2. Open Pages.
3. Select GitHub Actions as the source.
4. Push to `main`.

## Region Notes

Model availability and API keys are region-sensitive. The app exposes:

- International / Singapore
- China / Beijing
- US / Virginia

Use the region that matches the user's Model Studio entitlement.

## References

- Model Studio models: https://www.alibabacloud.com/help/en/model-studio/models
- Wan image generation and editing: https://www.alibabacloud.com/help/en/model-studio/wan-image-generation-and-editing-api-reference
- Wan image-to-video: https://www.alibabacloud.com/help/doc-detail/3025059.html
- LiveTranslate realtime: https://www.alibabacloud.com/help/en/model-studio/qwen3-5-livetranslate-flash-realtime
