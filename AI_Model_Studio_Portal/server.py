import json
import os
import ssl
import urllib.error
import urllib.request
import asyncio
import base64
import io
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"

try:
    import certifi

    HTTPS_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except Exception:
    HTTPS_CONTEXT = ssl.create_default_context()

REGIONS = {
    "intl": {
        "name": "International / Singapore",
        "compatible": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        "api": "https://dashscope-intl.aliyuncs.com/api/v1",
        "ws": "wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime",
    },
    "cn": {
        "name": "China / Beijing",
        "compatible": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "api": "https://dashscope.aliyuncs.com/api/v1",
        "ws": "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
    },
    "us": {
        "name": "US / Virginia",
        "compatible": "https://dashscope-us.aliyuncs.com/compatible-mode/v1",
        "api": "https://dashscope-us.aliyuncs.com/api/v1",
        "ws": "wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime",
    },
}


def region_config(region_key):
    return REGIONS.get(region_key or "intl", REGIONS["intl"])


def request_json(url, api_key, payload=None, method="POST", async_task=False):
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if async_task:
        headers["X-DashScope-Async"] = "enable"

    body = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=180, context=HTTPS_CONTEXT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{exc.code} {exc.reason}: {detail}") from exc


def request_stream_text(url, api_key, payload):
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
    chunks = []
    usage = None
    try:
        with urllib.request.urlopen(req, timeout=240, context=HTTPS_CONTEXT) as resp:
            for raw_line in resp:
                line = raw_line.decode("utf-8", errors="replace").strip()
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                event = json.loads(data)
                if event.get("usage"):
                    usage = event["usage"]
                for choice in event.get("choices", []):
                    delta = choice.get("delta", {})
                    if delta.get("content"):
                        chunks.append(delta["content"])
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{exc.code} {exc.reason}: {detail}") from exc
    return {"text": "".join(chunks), "usage": usage}


def extract_images(payload):
    images = []
    output = payload.get("output", {})
    for choice in output.get("choices", []):
        content = choice.get("message", {}).get("content", [])
        for item in content:
            if item.get("image"):
                images.append(item["image"])
    for result in output.get("results", []):
        if isinstance(result, dict):
            images.extend([value for key, value in result.items() if key in ("url", "image") and value])
    return images


def decode_data_url(data_url):
    if not data_url:
        raise RuntimeError("Upload a WAV file first.")
    if "," in data_url and data_url.split(",", 1)[0].startswith("data:"):
        return base64.b64decode(data_url.split(",", 1)[1])
    return base64.b64decode(data_url)


def wav_to_pcm16_chunks(data_url, chunk_ms=100):
    wav_bytes = decode_data_url(data_url)
    try:
        with wave.open(io.BytesIO(wav_bytes), "rb") as wav:
            channels = wav.getnchannels()
            sample_width = wav.getsampwidth()
            sample_rate = wav.getframerate()
            frames = wav.readframes(wav.getnframes())
    except wave.Error as exc:
        raise RuntimeError("LiveTranslate realtime expects a valid PCM WAV file.") from exc

    if sample_width != 2:
        raise RuntimeError("LiveTranslate realtime demo expects PCM16 WAV input. Please use 16-bit WAV.")
    if channels not in (1, 2):
        raise RuntimeError("LiveTranslate realtime demo supports mono or stereo WAV input.")

    bytes_per_ms = max(1, sample_rate * channels * sample_width // 1000)
    chunk_size = max(sample_width * channels, bytes_per_ms * chunk_ms)
    chunks = [frames[i : i + chunk_size] for i in range(0, len(frames), chunk_size) if frames[i : i + chunk_size]]
    if not chunks:
        raise RuntimeError("The WAV file contains no audio frames.")
    return chunks, {"sampleRate": sample_rate, "channels": channels, "sampleWidth": sample_width, "durationSec": round(len(frames) / (sample_rate * channels * sample_width), 2)}


async def livetranslate_realtime(api_key, cfg, data):
    try:
        import websockets
    except Exception as exc:
        raise RuntimeError("Missing Python dependency 'websockets'. Run: python3 -m pip install websockets") from exc

    model = data.get("model", "qwen3.5-livetranslate-flash-realtime")
    source = data.get("sourceLang", "en")
    target = data.get("targetLang", "zh")
    chunks, audio_info = wav_to_pcm16_chunks(data.get("media", ""))
    url = f"{cfg['ws']}?model={model}"
    headers = {"Authorization": f"Bearer {api_key}"}

    async def connect():
        try:
            return await websockets.connect(url, additional_headers=headers, open_timeout=20, ssl=HTTPS_CONTEXT)
        except TypeError:
            return await websockets.connect(url, extra_headers=headers, open_timeout=20, ssl=HTTPS_CONTEXT)

    events = []
    translated = []
    transcript = []
    usage = None

    def event_id(prefix):
        return f"{prefix}_{int(time.time() * 1000)}"

    async with await connect() as ws:
        session = {
            "event_id": event_id("session"),
            "type": "session.update",
            "session": {
                "modalities": ["text"],
                "input_audio_format": "pcm16",
                "input_audio_transcription": {
                    "model": "qwen3-asr-flash-realtime",
                    "language": source,
                },
                "translation": {"language": target},
            },
        }
        await ws.send(json.dumps(session))

        for chunk in chunks:
            await ws.send(json.dumps({
                "event_id": event_id("audio"),
                "type": "input_audio_buffer.append",
                "audio": base64.b64encode(chunk).decode("ascii"),
            }))
            await asyncio.sleep(0.01)

        await ws.send(json.dumps({"event_id": event_id("finish"), "type": "session.finish"}))

        deadline = time.time() + 90
        while time.time() < deadline:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=8)
            except asyncio.TimeoutError:
                if translated or transcript:
                    break
                continue

            event = json.loads(raw)
            event_type = event.get("type", "")
            if event_type != "response.audio.delta":
                events.append(event)
                events = events[-18:]

            if event_type == "error":
                message = event.get("error", {}).get("message", json.dumps(event))
                raise RuntimeError(message)
            if event_type == "conversation.item.input_audio_transcription.text":
                current = (event.get("text", "") + event.get("stash", "")).strip()
                if current:
                    transcript.append(current)
            elif event_type == "conversation.item.input_audio_transcription.completed":
                transcript = [event.get("transcript", "").strip()]
            elif event_type in ("response.text.text", "response.audio_transcript.text"):
                current = (event.get("text", "") + event.get("stash", "")).strip()
                if current:
                    translated.append(current)
            elif event_type == "response.text.done":
                translated = [event.get("text", "").strip()]
            elif event_type == "response.audio_transcript.done":
                translated = [event.get("transcript", "").strip()]
            elif event_type == "response.done":
                usage = event.get("response", {}).get("usage")
                for item in event.get("response", {}).get("output", []):
                    for part in item.get("content", []):
                        text = part.get("text") or part.get("transcript")
                        if text:
                            translated = [text.strip()]
            elif event_type == "session.finished":
                break

    return {
        "text": translated[-1] if translated else "",
        "transcript": transcript[-1] if transcript else "",
        "model": model,
        "sourceLang": source,
        "targetLang": target,
        "audio": audio_info,
        "usage": usage,
        "events": events,
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "ModelStudioShowcase/1.0"

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/":
            return self.serve_file(STATIC / "index.html", "text/html")
        if parsed.path == "/api/task":
            return self.handle_task(parsed)

        target = (STATIC / parsed.path.lstrip("/")).resolve()
        if not str(target).startswith(str(STATIC.resolve())) or not target.exists():
            return self.send_error(404)
        mime = "text/css" if target.suffix == ".css" else "application/javascript" if target.suffix == ".js" else "application/octet-stream"
        return self.serve_file(target, mime)

    def do_POST(self):
        routes = {
            "/api/chat": self.handle_chat,
            "/api/vision": self.handle_vision,
            "/api/image": self.handle_image,
            "/api/video": self.handle_video,
            "/api/asr": self.handle_asr,
            "/api/livetranslate": self.handle_livetranslate,
            "/api/livetranslate-realtime": self.handle_livetranslate_realtime,
        }
        handler = routes.get(urlparse(self.path).path)
        if not handler:
            return self.send_error(404)
        try:
            handler(self.read_body())
        except Exception as exc:
            self.send_json({"error": str(exc)}, status=500)

    def read_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def api_key(self, data):
        key = data.get("apiKey") or os.getenv("DASHSCOPE_API_KEY", "")
        if not key:
            raise RuntimeError("Missing DashScope API key.")
        return key

    def handle_chat(self, data):
        cfg = region_config(data.get("region"))
        payload = {
            "model": data.get("model", "qwen-plus"),
            "messages": [
                {"role": "system", "content": data.get("system", "You are a concise Alibaba Cloud solution architect.")},
                {"role": "user", "content": data.get("prompt", "")},
            ],
        }
        result = request_json(f"{cfg['compatible']}/chat/completions", self.api_key(data), payload)
        self.send_json({"text": result["choices"][0]["message"]["content"], "raw": result})

    def handle_vision(self, data):
        cfg = region_config(data.get("region"))
        payload = {
            "model": data.get("model", "qwen-vl-max-latest"),
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": data.get("image", "")}},
                        {"type": "text", "text": data.get("prompt", "")},
                    ],
                }
            ],
        }
        result = request_json(f"{cfg['compatible']}/chat/completions", self.api_key(data), payload)
        self.send_json({"text": result["choices"][0]["message"]["content"], "raw": result})

    def handle_image(self, data):
        cfg = region_config(data.get("region"))
        model = data.get("model", "wan2.7-image-pro")
        if model == "z-image-turbo":
            payload = {
                "model": model,
                "input": {"messages": [{"role": "user", "content": [{"text": data.get("prompt", "")}]}]},
                "parameters": {"prompt_extend": False, "size": data.get("size", "1024*1024")},
            }
        elif model.startswith("qwen-image"):
            content = [{"image": image} for image in data.get("images", []) if image]
            content.append({"text": data.get("prompt", "")})
            payload = {
                "model": model,
                "input": {"messages": [{"role": "user", "content": content}]},
                "parameters": {
                    "n": int(data.get("n", 1)),
                    "watermark": False,
                },
            }
        else:
            content = [{"image": image} for image in data.get("images", []) if image]
            content.append({"text": data.get("prompt", "")})
            params = {
                "size": data.get("size", "2K"),
                "n": int(data.get("n", 1)),
                "watermark": False,
                "thinking_mode": True,
            }
            if data.get("imageSet"):
                params["enable_sequential"] = True
            payload = {"model": model, "input": {"messages": [{"role": "user", "content": content}]}, "parameters": params}

        result = request_json(f"{cfg['api']}/services/aigc/multimodal-generation/generation", self.api_key(data), payload)
        self.send_json({"images": extract_images(result), "raw": result})

    def handle_video(self, data):
        cfg = region_config(data.get("region"))
        model = data.get("model", "wan2.6-t2v")
        media_url = data.get("image", "")
        input_payload = {"prompt": data.get("prompt", "")}
        if media_url:
            if model == "wan2.7-i2v":
                input_payload["media"] = [{"type": "first_frame", "url": media_url}]
            else:
                input_payload["img_url"] = media_url
        payload = {
            "model": model,
            "input": input_payload,
            "parameters": {
                "resolution": data.get("resolution", "720P"),
                "duration": int(data.get("duration", 5)),
                "prompt_extend": True,
                "watermark": False,
            },
        }
        if model == "happyhorse-1.0-t2v":
            payload["parameters"]["ratio"] = data.get("ratio", "16:9")
        result = request_json(f"{cfg['api']}/services/aigc/video-generation/video-synthesis", self.api_key(data), payload, async_task=True)
        self.send_json({"taskId": result.get("output", {}).get("task_id"), "raw": result})

    def handle_task(self, parsed):
        params = parse_qs(parsed.query)
        task_id = params.get("id", [""])[0]
        region = params.get("region", ["intl"])[0]
        api_key = params.get("apiKey", [os.getenv("DASHSCOPE_API_KEY", "")])[0]
        if not task_id or not api_key:
            return self.send_json({"error": "Missing task id or API key."}, status=400)
        cfg = region_config(region)
        result = request_json(f"{cfg['api']}/tasks/{task_id}", api_key, method="GET")
        self.send_json(result)

    def handle_asr(self, data):
        cfg = region_config(data.get("region"))
        model = data.get("model", "qwen3-asr-flash")
        messages = []
        context = data.get("context", "").strip()
        if context and model == "qwen3-asr-flash":
            messages.append({"role": "system", "content": [{"text": context}]})
        messages.append({"role": "user", "content": [{"audio": data.get("audio", "")}]})
        params = {"incremental_output": False}
        if model == "qwen3-asr-flash":
            asr_options = {"enable_itn": True}
            language = data.get("language")
            if language and language != "auto":
                asr_options["language"] = language
            else:
                asr_options["enable_lid"] = True
            params["asr_options"] = asr_options
        payload = {"model": model, "input": {"messages": messages}, "parameters": params}
        result = request_json(f"{cfg['api']}/services/aigc/multimodal-generation/generation", self.api_key(data), payload)
        content = result.get("output", {}).get("choices", [{}])[0].get("message", {}).get("content", [])
        text = "".join(item.get("text", "") for item in content if isinstance(item, dict))
        self.send_json({"text": text, "raw": result})

    def handle_livetranslate_realtime(self, data):
        cfg = region_config(data.get("region"))
        result = asyncio.run(livetranslate_realtime(self.api_key(data), cfg, data))
        self.send_json(result)

    def handle_livetranslate(self, data):
        from openai import BadRequestError, OpenAI

        cfg = region_config(data.get("region"))
        source = data.get("sourceLang") or ""
        target = data.get("targetLang") or "English"
        media_kind = data.get("mediaKind", "audio")
        media_data = data.get("media", "")
        file_format = data.get("format", "wav")
        if not media_data:
            raise RuntimeError("Upload an audio or video file first.")

        if media_kind == "video":
            content = [{"type": "video_url", "video_url": {"url": media_data}}]
        else:
            content = [{"type": "input_audio", "input_audio": {"data": media_data, "format": file_format}}]

        translation_options = {"target_lang": target}
        if source and source != "Auto":
            translation_options["source_lang"] = source

        try:
            client = OpenAI(api_key=self.api_key(data), base_url=cfg["compatible"])
            stream = client.chat.completions.create(
                model="qwen3-livetranslate-flash",
                messages=[{"role": "user", "content": content}],
                modalities=["text"],
                stream=True,
                stream_options={"include_usage": True},
                extra_body={"translation_options": translation_options},
            )
            chunks = []
            usage = None
            for event in stream:
                if getattr(event, "usage", None):
                    usage = event.usage.model_dump() if hasattr(event.usage, "model_dump") else event.usage
                for choice in event.choices or []:
                    delta = getattr(choice, "delta", None)
                    content_piece = getattr(delta, "content", None) if delta else None
                    if content_piece:
                        chunks.append(content_piece)
            self.send_json({"text": "".join(chunks), "usage": usage, "model": "qwen3-livetranslate-flash"})
        except BadRequestError as exc:
            message = str(exc)
            if "translation_options is not supported" not in message:
                raise
            if media_kind == "video":
                raise RuntimeError("This region rejected LiveTranslate translation_options, and video fallback is not available. Try an audio file or another region.")
            asr_payload = {
                "model": "qwen3-asr-flash",
                "input": {
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {"audio": media_data},
                            ],
                        }
                    ]
                },
                "parameters": {
                    "asr_options": {"enable_itn": True, "enable_lid": True},
                    "incremental_output": False,
                },
            }
            asr_result = request_json(f"{cfg['api']}/services/aigc/multimodal-generation/generation", self.api_key(data), asr_payload)
            content_items = asr_result.get("output", {}).get("choices", [{}])[0].get("message", {}).get("content", [])
            transcript = "".join(item.get("text", "") for item in content_items if isinstance(item, dict)).strip()
            if not transcript:
                raise RuntimeError(f"ASR fallback returned no transcript: {asr_result}")

            translate_payload = {
                "model": "qwen-plus",
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a precise translator. Return only the translated text.",
                    },
                    {
                        "role": "user",
                        "content": f"Translate the following transcript to {target}:\n\n{transcript}",
                    },
                ],
            }
            translate_result = request_json(f"{cfg['compatible']}/chat/completions", self.api_key(data), translate_payload)
            translated = translate_result.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
            self.send_json({
                "text": f"{translated}\n\n---\nTranscript: {transcript}\n\n[Fallback: qwen3-livetranslate-flash rejected translation_options in this endpoint, so this run used qwen3-asr-flash + qwen-plus.]",
                "model": "qwen3-asr-flash + qwen-plus",
                "raw": {"asr": asr_result, "translation": translate_result},
            })

    def serve_file(self, path, mime):
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", f"{mime}; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def send_json(self, payload, status=200):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main():
    port = int(os.getenv("PORT", "8501"))
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"Model Studio Showcase running at http://localhost:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
