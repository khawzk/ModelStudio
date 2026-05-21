# Alibaba Cloud Model Studio Showcase

Showcase app for the Alibaba Cloud Telesales MYS site.

This app presents Model Studio capabilities through a custom web interface across Qwen, Wan, vision, video, and speech models. It no longer uses Streamlit; the frontend is plain HTML/CSS/JS and the Python backend proxies Model Studio API calls.

## Demo Surface

- **Model Gallery**: Qwen, Wan, speech, and video model families.
- **Text & Reasoning**: Qwen / compatible chat models for discovery, scoping, and proposal drafting.
- **Vision**: image understanding with Qwen multimodal models.
- **Image Studio**: Qwen image editing with URL/upload/camera input, Qwen multi-image fusion, Wan2.7 selected-area workflows, Wan text-to-image, and z-image-turbo product photo generation.
- **Video Studio**: Wan text-to-video and image-to-video async task flow.
- **Speech**: ASR, speech translation, and CosyVoice voiceover generation.
- **Run Log**: captures model, prompt, output preview, and latency for a downloadable demo report.

## Why This Is FDE-Oriented

The app is structured around a premium telesales conversation:

1. Choose a customer journey.
2. Map the journey to model families.
3. Run a high-signal interaction.
4. Capture outputs, latency, and follow-up evidence.
5. Turn the session into a clean PoC follow-up.

## Setup

Set your Model Studio / DashScope API key:

```bash
export DASHSCOPE_API_KEY="your-api-key"
```

Run:

```bash
python server.py
```

## Deploy To Alibaba Cloud ECS

A Terraform scaffold is included under `terraform/alibaba-ecs`.

```bash
cd terraform/alibaba-ecs
terraform init
terraform apply \
  -var='ssh_public_key=ssh-rsa AAAA...' \
  -var='dashscope_api_key=sk-...'
```

After provisioning, Terraform outputs the showcase URL:

```bash
terraform output showcase_url
```

For public demos, replace `allowed_cidr=0.0.0.0/0` with your office IP range and put a domain or reverse proxy in front of port `8501`.

## Region Notes

Model Studio API keys are region-specific. Use the same region for model availability, endpoint, and API key.

The app exposes these endpoint groups:

- International / Singapore
- China / Beijing
- US / Virginia

## References

- Model Studio supported models and capabilities: https://www.alibabacloud.com/help/en/model-studio/models
- Wan2.7 image generation and editing: https://www.alibabacloud.com/help/en/model-studio/wan-image-generation-and-editing-api-reference
- Wan image-to-video: https://www.alibabacloud.com/help/doc-detail/3025059.html
- Qwen real-time speech recognition: https://www.alibabacloud.com/help/en/model-studio/qwen-real-time-speech-recognition
