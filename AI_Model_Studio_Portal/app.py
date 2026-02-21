import os
import time
from http import HTTPStatus

import streamlit as st
from openai import OpenAI
import requests

# ==========================================
# 1. Page Configuration & Global Constants
# ==========================================
st.set_page_config(
    page_title="AI Model Studio Portal",
    page_icon="✨",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Industry Presets (Sales Presets)
INDUSTRY_PRESETS = {
    "Text generation": {
        "Retail": "Please help me draft a dynamic summer sales marketing campaign for an apparel brand, including target audience analysis, core promotions, and budget allocation.",
        "Finance": "Explain the impact of recent interest rate cuts on retail investors' asset allocation in the current macroeconomic environment, and provide three specific investment recommendations.",
        "Manufacturing": "Outline the core steps for a smart factory's digital transformation, focusing specifically on IoT device integration and data collection team building."
    },
    "Omni-modal": {
        "Retail": "Please analyze this product image and extract the key selling points, colors, and materials. Then, write a short promotional tagline for an e-commerce listing.",
        "Finance": "Please review this chart image and summarize the main trends shown, including any notable spikes or drops.",
        "Manufacturing": "Analyze this equipment diagram and identify all the labeled components, explaining their potential functions in an industrial setting."
    },
    "Speech synthesis": {
        "Retail": "Welcome to our summer sale! Fasten your seatbelts for unprecedented discounts across all locations.",
        "Finance": "The market opens strong today, showing a three percent gain in the technology sector.",
        "Manufacturing": "Attention workers, shift change will commence in fifteen minutes. Please secure your stations."
    },
    "Speech recognition": {},
    "Speech translation": {},
    "Image generation": {
        "Retail": "A futuristic premium coffee packaging design, minimalist style, black and gold color scheme, glowing geometric lines on the package, pure white background studio lighting, ultra-high resolution, photorealistic details",
        "Finance": "An abstract conceptual illustration representing global financial wealth growth, featuring rising golden curves, golden digital numbers floating in the air, deep blue technological background, modern and professional vibe",
        "Manufacturing": "A highly automated futuristic automobile manufacturing workshop, robotic arms assembling a streamlined sports car, cyberpunk style neon lighting, cinematic quality, highly detailed"
    },
    "Video generation": {
        "Retail": "A dynamic sports shoe commercial shot: vibrant colorful running shoes levitating in mid-air, surrounded by splashing water droplets, with fast-moving city night neon lights in the background, slow-motion replay, highly impactful. 16:9 aspect ratio.",
        "Finance": "An animation of gold coins piling up and rapidly spinning to form a shining financial skyscraper, background features a starry sky and rising golden arrows, symbolizing wealth growth and steady investment, 3D rendering, soft lighting.",
        "Manufacturing": "Macro shot showing precision mechanical gears meshing perfectly in motion, sparks flying, excellent metallic texture, industrial style, high frame rate dynamic effect."
    },
    "Text and multimodal embedding": {}
}

# ==========================================
# 2. Core API Communication Manager
# ==========================================
class ModelStudioManager:
    """Wrapper class for managing Alibaba Cloud Model Studio API calls via OpenAI SDK"""
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        # For international region as specified by user
        self.base_url = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
        self.client = OpenAI(
            api_key=self.api_key,
            base_url=self.base_url,
        )
    
    def chat(self, prompt: str, model_name: str = "qwen-max") -> str:
        try:
            completion = self.client.chat.completions.create(
                model=model_name,  
                messages=[
                    {'role': 'user', 'content': prompt}
                ]
            )
            return completion.choices[0].message.content
        except Exception as e:
            raise Exception(f"Chat API Error: {str(e)}")

    def vision_chat(self, prompt: str, image_url: str, model_name: str = "qwen-vl-max") -> str:
        import dashscope
        import tempfile
        import os
        import requests
        
        # Explicit initialization of Dashscope API key since it might fail if simply read from env implicitly
        dashscope.api_key = str(self.api_key).strip()
        # Set base API URL to international region so that the SDK file uploading authenticates against the right region where the user's API key resides.
        dashscope.base_http_api_url = "https://dashscope-intl.aliyuncs.com/api/v1"
        
        headers = {"User-Agent": "Mozilla/5.0"}
        img_resp = requests.get(image_url, headers=headers, stream=True, timeout=15)
        img_resp.raise_for_status()

        local_path = ""
        try:
            with tempfile.NamedTemporaryFile(mode="wb", delete=False, suffix=".jpeg") as temp_file:
                for chunk in img_resp.iter_content(chunk_size=8192):
                    temp_file.write(chunk)
                local_path = temp_file.name

            messages = [
                {
                    "role": "user",
                    "content": [
                        {"image": f"file://{local_path}"},
                        {"text": prompt}
                    ]
                }
            ]
            
            response = dashscope.MultiModalConversation.call(model=model_name, messages=messages)
            
            if response.status_code == 200:
                content = response.output.choices[0].message.content
                if isinstance(content, list):
                    return "".join(c.get("text", "") for c in content)
                return content
            else:
                raise Exception(f"DashScope returned code {response.status_code}: {response.message}")
        except Exception as e:
            raise Exception(f"Vision API Error: {str(e)}")
        finally:
            if local_path and os.path.exists(local_path):
                os.remove(local_path)

    def generate_image(self, prompt: str, style: str, resolution: str, seed: int) -> str:
        try:
            url = "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": "z-image-turbo",
                "input": {
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "text": prompt
                                }
                            ]
                        }
                    ]
                },
                "parameters": {
                    "prompt_extend": False,
                    "size": resolution,
                    "style": style if style != "<auto>" else ""
                }
            }
            
            response = requests.post(url, headers=headers, json=payload)
            if response.status_code == 200:
                data = response.json()
                try:
                    # Traverse the new nested structure: choices[0].message.content[x].image
                    choices = data.get("output", {}).get("choices", [])
                    if choices:
                        content_list = choices[0].get("message", {}).get("content", [])
                        for item in content_list:
                            if "image" in item:
                                return item["image"]
                    raise Exception("No image URL in response: " + str(data))
                except Exception as e:
                    raise Exception("Error parsing image response: " + str(e) + " - Raw Data: " + str(data))
            else:
                raise Exception(f"Image API Error: {response.status_code} - {response.text}")
                
        except Exception as e:
            raise Exception(f"Image API Error: {str(e)}")
            
    def generate_video(self, prompt: str) -> str:
        url = "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "X-DashScope-Async": "enable",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": "wan2.6-t2v",
            "input": {
                "prompt": prompt
            },
            "parameters": {
                "size": "1280*720",
                "prompt_extend": True,
                "duration": 5, # default
                "shot_type": "multi"
            }
        }
        
        response = requests.post(url, headers=headers, json=payload)
        
        if response.status_code == 200:
            data = response.json()
            return data.get("output", {}).get("task_id")
        else:
            raise Exception(f"Video API Submission Error: {response.status_code} - {response.text}")

    def fetch_video_task(self, task_id: str):
        headers = {
            "Authorization": f"Bearer {self.api_key}"
        }
        
        url = f"https://dashscope-intl.aliyuncs.com/api/v1/tasks/{task_id}"
        response = requests.get(url, headers=headers)
        
        if response.status_code == 200:
            return response.json()
        else:
            raise Exception(f"Video API Polling Error: {response.status_code} - {response.text}")

    def generate_speech(self, text: str, model_name: str = "cosyvoice-v1") -> bytes:
        import dashscope
        from dashscope.audio.tts import SpeechSynthesizer
        
        dashscope.api_key = str(self.api_key).strip()
        dashscope.base_http_api_url = "https://dashscope-intl.aliyuncs.com/api/v1"
        
        try:
            result = SpeechSynthesizer.call(model=model_name,
                                            text=text,
                                            sample_rate=48000,
                                            format='wav')
            if result.get_audio_data() is not None:
                return result.get_audio_data()
            else:
                raise Exception(f"TTS API Error: {result.get_response().message}")
        except Exception as e:
             raise Exception(f"Speech Synthesis Error: {str(e)}")


    def _qwen_audio_task(self, prompt: str, audio_bytes: bytes, audio_format: str, model_name: str) -> str:
        """Helper for using qwen-audio models for ASR and translation with local bytes"""
        import dashscope
        import tempfile
        import os
        
        dashscope.api_key = str(self.api_key).strip()
        dashscope.base_http_api_url = "https://dashscope-intl.aliyuncs.com/api/v1"
        
        local_path = ""
        try:
            # We must use proper suffix for the model to recognize format
            suffix = f".{audio_format.split('/')[-1]}" if audio_format else ".mp3"
            with tempfile.NamedTemporaryFile(mode="wb", delete=False, suffix=suffix) as temp_file:
                temp_file.write(audio_bytes)
                local_path = temp_file.name

            messages = [
                {
                    "role": "user",
                    "content": [
                        {"audio": f"file://{local_path}"},
                        {"text": prompt}
                    ]
                }
            ]
            
            response = dashscope.MultiModalConversation.call(model=model_name, messages=messages)
            
            if response.status_code == 200:
                content = response.output.choices[0].message.content
                if isinstance(content, list):
                    return str("".join(c.get("text", "") for c in content))
                return str(content)
            else:
                raise Exception(f"DashScope Audio API returned code {response.status_code}: {response.message}")
        except Exception as e:
            raise Exception(f"Audio Processing Error: {str(e)}")
        finally:
            if local_path and os.path.exists(local_path):
                os.remove(local_path)

    def recognize_speech(self, audio_bytes: bytes, audio_format: str, model_name: str = "qwen-audio-turbo") -> str:
        return self._qwen_audio_task("Please transcribe this audio exactly as spoken.", audio_bytes, audio_format, model_name)
        
    def translate_speech(self, audio_bytes: bytes, audio_format: str, target_lang: str, model_name: str = "qwen-audio-turbo") -> str:
        return self._qwen_audio_task(f"Please translate the speech in this audio to {target_lang}.", audio_bytes, audio_format, model_name)

    def generate_embeddings(self, texts: list[str], model_name: str = "text-embedding-v3") -> list[list[float]]:
        import dashscope
        
        dashscope.api_key = str(self.api_key).strip()
        dashscope.base_http_api_url = "https://dashscope-intl.aliyuncs.com/api/v1"
        
        try:
            resp = dashscope.TextEmbedding.call(
                model=model_name,
                input=texts
            )
            if resp.status_code == 200:
                # Returns a list of embeddings matching the input order
                embeddings = [e["embedding"] for e in resp.output["embeddings"]]
                return embeddings
            else:
                raise Exception(f"DashScope Embedding API Error {resp.status_code}: {resp.message}")
        except Exception as e:
            raise Exception(f"Embedding Generation Error: {str(e)}")

# ==========================================
# 3. Page Rendering Components
# ==========================================

def render_speech_recognition_page(manager: ModelStudioManager, page_name: str):
    st.title("👂 Speech Recognition (ASR)")
    st.markdown("Accurately transcribe spoken audio into text utilizing the **Qwen-Audio** multimodal architecture.")
    
    col1, col2 = st.columns([1, 1], gap="large")
    
    with col1:
        st.subheader("📎 Upload Audio")
        
        audio_file = st.file_uploader("Upload an Audio File", type=["mp3", "wav", "m4a", "flac", "ogg"])
        if audio_file:
            st.audio(audio_file)
            
        transcribe_btn = st.button("Transcribe Audio 📝", use_container_width=True, type="primary")
        
    with col2:
        st.subheader("📝 Transcription Result")
        
        if transcribe_btn:
            if not manager.api_key:
                st.error("Action Blocked: Please enter your API Key in the sidebar first!")
            elif not audio_file:
                st.warning("Action Blocked: Please upload an audio file!")
            else:
                with st.spinner("Analyzing and transcribing the audio file..."):
                    try:
                        audio_bytes = audio_file.read()
                        audio_format = audio_file.type
                        result_text = manager.recognize_speech(audio_bytes, audio_format)
                        st.success("Transcription Complete!")
                        st.info(result_text)
                    except Exception as e:
                        st.error(str(e))
        else:
            st.info("Upload an audio file and hit transcribe. The result will appear here.")

def render_speech_translation_page(manager: ModelStudioManager, page_name: str):
    st.title("🌐 Speech Translation")
    st.markdown("Break down language barriers by translating audio directly to text across different languages using **Qwen-Audio**.")

    col1, col2 = st.columns([1, 1], gap="large")
    
    with col1:
        st.subheader("📎 Input & Configuration")
        
        target_lang = st.selectbox("🎯 Target Language", ["English", "Chinese", "Spanish", "French", "Japanese", "Korean", "German"])
        audio_file = st.file_uploader("Upload an Audio File", type=["mp3", "wav", "m4a", "flac", "ogg"], key="translator")
        if audio_file:
            st.audio(audio_file)
            
        translate_btn = st.button("Translate Audio 🌍", use_container_width=True, type="primary")
        
    with col2:
        st.subheader("📝 Translation Result")
        
        if translate_btn:
            if not manager.api_key:
                st.error("Action Blocked: Please enter your API Key in the sidebar first!")
            elif not audio_file:
                st.warning("Action Blocked: Please upload an audio file!")
            else:
                with st.spinner(f"Translating the audio into {target_lang}..."):
                    try:
                        audio_bytes = audio_file.read()
                        audio_format = audio_file.type
                        result_text = manager.translate_speech(audio_bytes, audio_format, target_lang=target_lang)
                        st.success("Translation Complete!")
                        st.info(result_text)
                    except Exception as e:
                        st.error(str(e))
        else:
            st.info("Upload an audio file, select a language, and hit translate.")

def render_embeddings_page(manager: ModelStudioManager, page_name: str):
    st.title("🔢 Text & Multimodal Embeddings")
    st.markdown("Convert texts into high-dimensional vector representations using **text-embedding-v3**.")

    col1, col2 = st.columns([1, 1], gap="large")
    
    with col1:
        st.subheader("📎 Input Data")
        
        # Industry Presets Configuration
        industry = st.selectbox("📌 Industry Presets", ["Select...", "Retail", "Finance", "Manufacturing"])
        
        # Provide some default text just for embeddings testing
        default_prompt = ""
        if industry == "Retail":
            default_prompt = "Summer collection blue running shoes"
        elif industry == "Finance":
            default_prompt = "Q3 Earnings report and revenue growth"
        elif industry == "Manufacturing":
            default_prompt = "CNC machine precision calibration manual"
            
        text_input = st.text_area("Text to Embed*", value=default_prompt, height=150)
        
        embed_btn = st.button("Generate Embedding Vector 🔢", use_container_width=True, type="primary")
        
    with col2:
        st.subheader("📊 Vector Output View")
        
        if embed_btn:
            if not manager.api_key:
                st.error("Action Blocked: Please enter your API Key in the sidebar first!")
            elif not text_input.strip():
                st.warning("Action Blocked: Please enter text to embed!")
            else:
                with st.spinner("Generating embeddings..."):
                    try:
                        embeddings = manager.generate_embeddings(texts=[text_input])
                        if embeddings and len(embeddings) > 0:
                            vector = embeddings[0]
                            st.success(f"Generated successfully! Dimension: `{len(vector)}`")
                            
                            # Give a text-preview of the payload (truncated for readability)
                            v_list = list(vector)
                            preview = str(v_list[:10])[:-1] + ", ... ]"
                            st.code(preview, language="json")
                            st.caption("Showing first 10 dimensions")
                            
                            # Simple chart visualization
                            st.line_chart(v_list[:100], height=200)
                            st.caption("Value distribution of first 100 dimensions")
                        else:
                            st.warning("No embeddings returned.")
                    except Exception as e:
                        st.error(str(e))
        else:
            st.info("Enter text to preview its high-dimensional vector space mapping.")

def render_speech_synthesis_page(manager: ModelStudioManager, page_name: str):
    st.title("🗣️ Speech Synthesis")
    st.markdown("Convert text into lifelike spoken audio using Alibaba Cloud's CosyVoice models.")
    
    col1, col2 = st.columns([1, 1], gap="large")
    
    with col1:
        st.subheader("⚙️ Configuration")
        
        voice_models = ["cosyvoice-v1", "cosyvoice-v2"]
        selected_model = st.selectbox("🎙️ Select Voice Model", voice_models, index=0)
        
        industry = st.selectbox("📌 Industry Presets", ["Select...", "Retail", "Finance", "Manufacturing"])
        default_prompt = INDUSTRY_PRESETS[page_name].get(industry, "") if industry != "Select..." else ""
            
        text_input = st.text_area("Text to Synthesize*", value=default_prompt, height=150)
        
        generate_btn = st.button("Synthesize Audio 📢", use_container_width=True, type="primary")
        
    with col2:
        st.subheader("🎵 Audio Output")
        
        if generate_btn:
            if not manager.api_key:
                st.error("Action Blocked: Please enter your API Key in the sidebar first!")
            elif not text_input.strip():
                st.warning("Action Blocked: Please enter text to synthesize!")
            else:
                with st.spinner("Synthesizing speech..."):
                    try:
                        audio_bytes = manager.generate_speech(text_input, model_name=selected_model)
                        st.success(f"Synthesis Complete using API model: `{selected_model}`")
                        st.audio(audio_bytes, format="audio/wav")
                        st.download_button(
                            label="📥 Download Audio",
                            data=audio_bytes,
                            file_name="synthesized_speech.wav",
                            mime="audio/wav",
                            use_container_width=True
                        )
                    except Exception as e:
                        st.error(str(e))
        else:
            st.info("Select a model, enter text, and hit 'Synthesize Audio' to generate speech out of text.")

def render_chat_page(manager: ModelStudioManager, page_name: str):
    st.title("💬 Smart Chat")
    st.markdown("Experience powerful logic reasoning and text generation capabilities across multiple models.")
    
    col_settings, col_preset = st.columns(2)
    with col_settings:
        # --- Model Selector ---
        available_models = [
            "qwen-max", 
            "qwen-plus", 
            "qwen-turbo", 
            "qwen-flash", 
            "deepseek-v3", 
            "deepseek-r1", 
            "kimi-k2.5"
        ]
        selected_model = st.selectbox("🤖 Select AI Model", available_models, index=0)
        
    with col_preset:
        # --- Industry Presets Dropdown ---
        industry = st.selectbox("📌 Industry Presets", ["Select...", "Retail", "Finance", "Manufacturing"])
        
    default_prompt = ""
    if industry != "Select...":
        default_prompt = INDUSTRY_PRESETS[page_name].get(industry, "")
        st.info(f"**💡 Preset Prompt:** \n\n{default_prompt}")
        
    # --- State Management ---
    if "chat_messages" not in st.session_state:
        st.session_state.chat_messages = []
        
    # --- UI Enhancement: Chat Bubble Rendering ---
    for msg in st.session_state.chat_messages:
        with st.chat_message(msg["role"]):
            st.markdown(msg["content"])
            
    # --- Input Area ---
    col_input, col_preset = st.columns([4, 1])
    
    prompt = st.chat_input("Enter your request here...")
    
    # Support fast sending of preset prompts
    trigger_preset = False
    if industry != "Select..." and default_prompt:
        if st.button("🚀 Send Preset Prompt"):
            prompt = default_prompt
            trigger_preset = True

    if prompt or trigger_preset:
        if not manager.api_key:
            st.error("Please enter your API Key in the sidebar first!")
            return
            
        # Add User message record
        st.session_state.chat_messages.append({"role": "user", "content": prompt})
        with st.chat_message("user"):
            st.markdown(prompt)
            
        # Add Assistant message record & streaming UI
        with st.chat_message("assistant"):
            with st.spinner("AI is thinking..."):
                try:
                    response_text = manager.chat(prompt, model_name=selected_model)
                    st.markdown(response_text)
                    st.session_state.chat_messages.append({"role": "assistant", "content": response_text})
                except Exception as e:
                    st.error(f"API Call Failed: {e}")

def render_image_page(manager: ModelStudioManager, page_name: str):
    st.title("🎨 Image Generation")
    st.markdown("Unleash the high-quality image generation potential of **Wanx-V1** by describing your vision.")
    
    # --- Layout split ---
    col1, col2 = st.columns([1, 1.5], gap="large")
    
    with col1:
        st.subheader("⚙️ Configuration")
        
        # Industry Presets
        industry = st.selectbox("📌 Industry Presets", ["Select...", "Retail", "Finance", "Manufacturing"])
        default_prompt = INDUSTRY_PRESETS[page_name].get(industry, "") if industry != "Select..." else ""
            
        prompt = st.text_area("Image Description (Prompt)*", value=default_prompt, height=150, help="Detail the visual elements you want to generate")
        
        # UI Columns for advanced parameters
        p_col1, p_col2 = st.columns(2)
        with p_col1:
            resolution = st.selectbox("Resolution", ["1024*1024", "1280*720", "720*1280", "1024*768"])
        with p_col2:
            seed = st.number_input("Random Seed", value=42, min_value=0, help="Use the same seed to reproduce fixed outcomes")
            
        style = st.selectbox("Style", ["<auto>", "<3d cartoon>", "<anime>", "<photography>", "<sketch>"])
        
        generate_btn = st.button("Generate Now 🚀", use_container_width=True, type="primary")
        
    with col2:
        st.subheader("🖼️ Result Display")
        
        if generate_btn:
            if not manager.api_key:
                st.error("Action Blocked: Please enter your API Key in the sidebar first!")
            elif not prompt.strip():
                st.warning("Action Blocked: Please enter an image description!")
            else:
                with st.spinner("Drawing your imagination, this may take a moment..."):
                    try:
                        image_url = manager.generate_image(prompt, style, resolution, seed)
                        # UI Enhancement: Image Display and Download ability
                        st.image(image_url, caption=f"Prompt: {prompt[:30]}...", use_container_width=True)
                        st.markdown(f"📥 [**Click here to download original HR image**]({image_url})")
                    except Exception as e:
                        st.error(str(e))
        else:
            st.info("Adjust parameters on the left and click 'Generate Now 🚀' to create your image.")

def render_video_page(manager: ModelStudioManager, page_name: str):
    st.title("🎬 Dynamic Video")
    st.markdown("Transform text into dynamic video using **Wanx-V1 Video**. Showcasing asynchronous task handling and long polling mechanisms.")
    
    # --- Layout split ---
    col1, col2 = st.columns([1, 1.5], gap="large")
    
    with col1:
        st.subheader("⚙️ Task Submission")
        
        # Industry Presets
        industry = st.selectbox("📌 Industry Presets", ["Select...", "Retail", "Finance", "Manufacturing"])
        default_prompt = INDUSTRY_PRESETS[page_name].get(industry, "") if industry != "Select..." else ""
            
        prompt = st.text_area("Video Scene Description (Prompt)*", value=default_prompt, height=150)
        
        generate_btn = st.button("Submit Video Task 🎬", use_container_width=True, type="primary")
        
    with col2:
        st.subheader("📺 Production Pipeline")
        
        if generate_btn:
            if not manager.api_key:
                st.error("Action Blocked: Please enter your API Key in the sidebar first!")
            elif not prompt.strip():
                st.warning("Action Blocked: Please enter a video description!")
            else:
                try:
                    # Step 1: Submit Async Task
                    with st.spinner("Submitting pipeline task to the cloud cluster..."):
                        task_id = manager.generate_video(prompt)
                    st.success(f"Task successfully submitted! **Task ID**: `{task_id}`")
                    
                    video_url = None
                    
                    # Step 2: State Polling Logic
                    with st.status("Processing video task, system is polling status...", expanded=True) as status:
                        while True:
                            task_info = manager.fetch_video_task(task_id)
                            task_status = task_info.get("output", {}).get("task_status", "UNKNOWN")
                            
                            st.write(f"🔄 Current Cloud Status: **{task_status}** | Retrying every 5 seconds...")
                            
                            if task_status == 'SUCCEEDED':
                                status.update(label="Video generation pipeline completed successfully!", state="complete", expanded=False)
                                video_url = task_info.get("output", {}).get("video_url")
                                break
                            elif task_status == 'FAILED':
                                err_msg = task_info.get("output", {}).get("message", "Unknown Error")
                                status.update(label=f"Pipeline execution interrupted: {err_msg}", state="error")
                                break
                            
                            time.sleep(5) # Delay before next polling
                            
                    # Step 3: Fetch and play video
                    if video_url:
                        st.video(video_url)
                        st.markdown(f"📥 [**Right-click or use this link to download the generated video**]({video_url})")
                        
                except Exception as e:
                    st.error(str(e))
        else:
            st.info("Adjust parameters on the left and click 'Submit Task' to generate your video. Progress will be shown here.")

def render_vision_page(manager: ModelStudioManager, page_name: str):
    st.title("👁️ Omni-modal Analysis")
    st.markdown("Process both visual and linguistic inputs dynamically with **Qwen-VL-Max** and **Qwen-VL-Plus**.")
    
    col1, col2 = st.columns([1, 1], gap="large")
    
    with col1:
        st.subheader("📎 Input Source")
        
        # Model selector
        vision_models = ["qwen-vl-max", "qwen-vl-plus"]
        selected_model = st.selectbox("🤖 Select Vision Model", vision_models, index=0)
        
        # We only support URL based inference for simplicity in this sandbox
        image_url = st.text_input("🔗 Image URL*", value="https://dashscope.oss-cn-beijing.aliyuncs.com/images/dog_and_girl.jpeg", help="Provide a public URL to an image for analysis.")
        
        if image_url:
            st.image(image_url, caption="Preview", use_container_width=True)
            
    with col2:
        st.subheader("💬 Vision Chat")
        
        # Industry Presets
        industry = st.selectbox("📌 Industry Presets", ["Select...", "Retail", "Finance", "Manufacturing"])
        default_prompt = INDUSTRY_PRESETS[page_name].get(industry, "") if industry != "Select..." else ""
            
        prompt = st.text_area("Question/Prompt*", value=default_prompt, height=150)
        
        analyze_btn = st.button("Analyze Image 🪄", use_container_width=True, type="primary")
        
        if analyze_btn:
            if not manager.api_key:
                st.error("Action Blocked: Please enter your API Key in the sidebar first!")
            elif not image_url.strip():
                st.warning("Action Blocked: Please provide a valid Image URL!")
            elif not prompt.strip():
                st.warning("Action Blocked: Please enter a prompt/question!")
            else:
                with st.spinner("Analyzing image structure and features..."):
                    try:
                        response_text = manager.vision_chat(prompt, image_url, model_name=selected_model)
                        st.markdown("### 📋 Analysis Result")
                        st.info(response_text)
                    except Exception as e:
                        st.error(str(e))
        
# ==========================================
# 4. Main App Entry & Sidebar Rendering
# ==========================================
def main():
    # --- Sidebar Navigation ---
    with st.sidebar:
        st.title("✨ AI Model Studio")
        st.caption("Enterprise UI Portal Sandbox")
        st.markdown("---")
        
        # API Key Management (supports Env loading or hidden manual input)
        env_key = os.getenv("DASHSCOPE_API_KEY", "")
        # Add a placeholder behavior that does not override default memory heavily
        api_key = st.text_input(
            "🔑 DashScope API Key*",
            value=env_key,
            type="password",
            help="Enter your Alibaba Cloud DashScope API Key. Or set DASHSCOPE_API_KEY as an environment variable system-wide."
        )
        
        if not api_key:
            st.warning("⚠️ A valid API Key is required to call backend model capabilities")
            
        st.markdown("---")
        
        # --- Module Routing ---
        selected_page = st.radio(
            "🛠️ Module Navigation",
            list(INDUSTRY_PRESETS.keys())
        )
        
        st.markdown("---")
        st.caption("🚀 Powered by Streamlit & OpenAI SDK")
        
    # --- Intercept empty string correctly ---
    actual_key = api_key.strip()

    # --- Initialize Manager & Routing ---
    manager = ModelStudioManager(api_key=actual_key)
    
    if selected_page == "Text generation":
        render_chat_page(manager, selected_page)
    elif selected_page == "Omni-modal":
        render_vision_page(manager, selected_page)
    elif selected_page == "Speech synthesis":
        render_speech_synthesis_page(manager, selected_page)
    elif selected_page == "Speech recognition":
        render_speech_recognition_page(manager, selected_page)
    elif selected_page == "Speech translation":
        render_speech_translation_page(manager, selected_page)
    elif selected_page == "Image generation":
        render_image_page(manager, selected_page)
    elif selected_page == "Video generation":
        render_video_page(manager, selected_page)
    elif selected_page == "Text and multimodal embedding":
        render_embeddings_page(manager, selected_page)

if __name__ == "__main__":
    main()
