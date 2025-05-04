from flask import Flask, request, jsonify, send_file, send_from_directory
import edge_tts
import requests
import io
import asyncio
import os
import uuid
import tempfile
import time
import logging
import json
from threading import Thread
from werkzeug.utils import secure_filename
from functools import wraps
from pydub import AudioSegment
import re # Import re for secure filename generation

# ----------------------------------------------------
# Configuration
# ----------------------------------------------------
# Use ../frontend relative to the backend directory
FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend'))
app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path='')

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('edge_tts.log', encoding='utf-8') # Ensure utf-8 logging
    ]
)
logger = logging.getLogger(__name__)

AUDIO_DIR = os.path.join(tempfile.gettempdir(), 'edge_tts_audio')
PRESETS_DIR = os.path.join(os.path.dirname(__file__), 'presets')
MAX_TEXT_LENGTH = 50000
CLEANUP_INTERVAL = 3600  # 1 hour
MAX_FILE_AGE = 3600      # 1 hour

# Ensure directories exist
os.makedirs(AUDIO_DIR, exist_ok=True)
os.makedirs(PRESETS_DIR, exist_ok=True)

# Asyncio event loop setup
loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)

# ----------------------------------------------------
# Helper Functions
# ----------------------------------------------------

def secure_preset_filename(name, prefix=""):
    """Generates a secure filename for presets, keeping basic chars and adding prefix."""
    # Allow alphanumeric, underscore, hyphen, and basic CJK characters
    # Replace other characters with underscore
    safe_name = re.sub(r'[^\w\-\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+', '_', name)
    # Limit length to prevent overly long filenames
    safe_name = safe_name[:50].strip('_')
    if not safe_name: # Handle cases where name becomes empty
        safe_name = "default"
    return f"{prefix}{safe_name}.json"

def validate_audio_filename(filename):
    """Validates audio filename for security."""
    # Use Werkzeug's secure_filename which is quite restrictive
    # It might change filenames like 'zh-CN...' significantly, but it's safe.
    # Alternatively, allow specific patterns if needed, but be careful.
    filename = secure_filename(filename)
    return os.path.join(AUDIO_DIR, filename)

def cleanup_old_files():
    """Clean up old audio files."""
    logger.info("Starting cleanup of old audio files...")
    try:
        current_time = time.time()
        count = 0
        for filename in os.listdir(AUDIO_DIR):
            file_path = os.path.join(AUDIO_DIR, filename)
            try:
                if os.path.isfile(file_path):
                    file_age = current_time - os.path.getmtime(file_path)
                    if file_age > MAX_FILE_AGE:
                        os.remove(file_path)
                        logger.info(f"Removed old file: {filename} (Age: {file_age:.0f}s)")
                        count += 1
            except Exception as e:
                logger.error(f"Error processing file {filename} for cleanup: {str(e)}")
        logger.info(f"Cleanup finished. Removed {count} files.")
    except Exception as e:
        logger.error(f"Error during cleanup process: {str(e)}")

def run_async(coro):
    """Helper function to run coroutines in the event loop from a sync context."""
    try:
        future = asyncio.run_coroutine_threadsafe(coro, loop)
        return future.result(timeout=60) # Add a timeout
    except TimeoutError:
        logger.error("Async operation timed out.")
        raise TimeoutError("语音生成或获取超时")
    except Exception as e:
        logger.error(f"Error in run_async: {str(e)}", exc_info=True)
        raise # Re-raise the original exception

def rate_limit(max_per_minute):
    """Rate limiting decorator."""
    def decorator(f):
        calls = []
        @wraps(f)
        def wrapper(*args, **kwargs):
            now = time.time()
            # Remove calls older than 1 minute
            calls[:] = [call for call in calls if now - call < 60]
            if len(calls) >= max_per_minute:
                logger.warning(f"Rate limit exceeded for endpoint: {request.path}")
                return jsonify({"error": "请求过于频繁，请稍后再试"}), 429
            calls.append(now)
            return f(*args, **kwargs)
        return wrapper
    return decorator

# ----------------------------------------------------
# Frontend Routes
# ----------------------------------------------------
@app.route('/')
def index():
    """Serves the Edge TTS page."""
    logger.info(f"Serving index.html from {app.static_folder}")
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/azure')
def azure_tts_page():
    """Serves the Azure TTS page."""
    logger.info(f"Serving azure.html from {app.static_folder}")
    return send_from_directory(app.static_folder, 'azure.html')

# Serve CSS and JS files explicitly if needed (Flask usually handles static)
# This ensures they are found relative to the frontend dir
@app.route('/css/<path:filename>')
def serve_css(filename):
    return send_from_directory(os.path.join(app.static_folder, 'css'), filename)

@app.route('/js/<path:filename>')
def serve_js(filename):
    return send_from_directory(os.path.join(app.static_folder, 'js'), filename)

# ----------------------------------------------------
# Edge TTS API Routes
# ----------------------------------------------------
@app.route('/api/edge/voices', methods=['GET'])
@rate_limit(10)
def get_edge_voices():
    """Gets the list of available Edge TTS voices."""
    logger.info("Request received for Edge TTS voices")
    try:
        voices = run_async(edge_tts.list_voices())
        # Separate Chinese voices for potential prioritization in frontend
        chinese_voices = sorted([v for v in voices if v['Locale'].startswith('zh-')], key=lambda x: x['ShortName'])
        other_voices = sorted([v for v in voices if not v['Locale'].startswith('zh-')], key=lambda x: x['Locale'])
        logger.info(f"Successfully retrieved {len(voices)} Edge voices.")
        return jsonify({
            "chinese_voices": chinese_voices,
            "other_voices": other_voices
        })
    except Exception as e:
        logger.error(f"Error getting Edge voices: {str(e)}", exc_info=True)
        return jsonify({"error": f"获取 Edge 语音列表失败: {str(e)}"}), 500

@app.route('/api/edge/synthesize', methods=['POST'])
@rate_limit(5) # Limit synthesis requests
def edge_synthesize():
    """Synthesizes text using Edge TTS."""
    logger.info("Request received for Edge TTS synthesis")
    try:
        data = request.json
        if not data:
            logger.warning("Empty request data for Edge synthesis")
            return jsonify({"error": "请求数据不能为空"}), 400

        text = data.get('text', '').strip()
        voice = data.get('voice', 'zh-CN-XiaoxiaoNeural') # Default voice
        output_format = data.get('format', 'mp3')
        rate = data.get('rate', 0)
        volume = data.get('volume', 0)
        pitch = data.get('pitch', 0)

        # Input validation
        if not text:
            return jsonify({"error": "合成文本不能为空"}), 400
        if len(text) > MAX_TEXT_LENGTH:
            return jsonify({"error": f"文本过长，最大允许 {MAX_TEXT_LENGTH} 字符"}), 413 # Payload Too Large
        if output_format not in ['mp3', 'wav']:
            return jsonify({"error": "无效的输出格式，请选择 mp3 或 wav"}), 400

        try:
            rate = int(rate)
            volume = int(volume)
            pitch = int(pitch)
            if not (-100 <= rate <= 200): # EdgeTTS supports wider range? Let's use a safe common range first
                 raise ValueError("Rate out of range")
            if not (-100 <= volume <= 100): # EdgeTTS range
                 raise ValueError("Volume out of range")
            if not (-50 <= pitch <= 50): # Pitch range for pydub manipulation
                 raise ValueError("Pitch out of range")
        except (TypeError, ValueError) as e:
             logger.warning(f"Invalid parameter type for Edge synthesis: {e}")
             return jsonify({"error": f"无效的语音参数: {e}"}), 400

        # Format parameters for edge-tts
        def format_edge_param(value):
            sign = '+' if value >= 0 else ''
            return f"{sign}{value}%"

        rate_str = format_edge_param(rate)
        volume_str = format_edge_param(volume)
        # Pitch is handled post-synthesis by pydub

        # File handling
        file_id = str(uuid.uuid4())
        # Use a temporary file for initial generation, always mp3 for pydub compatibility
        temp_mp3_file = validate_audio_filename(f"temp_{file_id}.mp3")
        final_output_file = validate_audio_filename(f"{file_id}.{output_format}")

        logger.info(f"Edge Synthesis Params: Voice={voice}, Rate={rate_str}, Volume={volume_str}, Pitch={pitch}, Format={output_format}")

        async def generate_edge_speech():
            nonlocal final_output_file # Ensure we can modify the outer var if pitch changes format
            try:
                # Step 1: Generate base audio using edge-tts (without pitch)
                communicate = edge_tts.Communicate(
                    text=text,
                    voice=voice,
                    rate=rate_str,
                    volume=volume_str
                )
                logger.info("Calling edge-tts save...")
                await communicate.save(temp_mp3_file)
                logger.info(f"Saved temporary edge-tts file: {temp_mp3_file}")

                # Step 2: Apply pitch shift using pydub if necessary
                if pitch != 0:
                    logger.info(f"Applying pitch shift: {pitch} semitones")
                    audio = AudioSegment.from_file(temp_mp3_file, format="mp3")
                    # Pydub pitch shift is based on semitones, not Hz directly.
                    # Map the -50 to +50 range to roughly -6 to +6 semitones (adjust as needed)
                    semitones = (pitch / 50.0) * 6.0
                    new_sample_rate = int(audio.frame_rate * (2.0 ** (semitones / 12.0)))
                    pitched_audio = audio._spawn(audio.raw_data, overrides={'frame_rate': new_sample_rate})
                    # Resample back to original rate to maintain duration
                    pitched_audio = pitched_audio.set_frame_rate(audio.frame_rate)
                    logger.info(f"Exporting pitched audio to {final_output_file} in format {output_format}")
                    pitched_audio.export(final_output_file, format=output_format)
                else:
                    # If no pitch shift, and format is mp3, just rename
                    if output_format == 'mp3':
                        logger.info(f"Renaming temp file to {final_output_file}")
                        os.rename(temp_mp3_file, final_output_file)
                    # If no pitch shift, but format is wav, convert
                    else:
                         logger.info(f"Converting temp MP3 to WAV: {final_output_file}")
                         audio = AudioSegment.from_file(temp_mp3_file, format="mp3")
                         audio.export(final_output_file, format="wav")
                         final_output_file = validate_audio_filename(f"{file_id}.wav") # Update filename if converted

                return final_output_file
            except Exception as e:
                logger.error(f"Error during async speech generation: {str(e)}", exc_info=True)
                raise # Propagate error
            finally:
                # Clean up the temporary mp3 file if it exists
                if os.path.exists(temp_mp3_file):
                    try:
                        os.remove(temp_mp3_file)
                        logger.debug(f"Cleaned up temp file: {temp_mp3_file}")
                    except OSError as e:
                        logger.error(f"Error removing temp file {temp_mp3_file}: {e}")

        # Run the async generation
        try:
            generated_file_path = run_async(generate_edge_speech())
            generated_filename = os.path.basename(generated_file_path)
            logger.info(f"Successfully generated Edge TTS audio: {generated_filename}")
            return jsonify({
                "audioUrl": f"/api/audio/{generated_filename}", # Use the actual final filename
                "format": output_format
            })
        except Exception as e:
            logger.error(f"Edge synthesis failed: {str(e)}", exc_info=True)
            return jsonify({"error": f"语音合成失败: {str(e)}"}), 500

    except Exception as e:
        logger.error(f"Unexpected error in /api/edge/synthesize: {str(e)}", exc_info=True)
        return jsonify({"error": "发生意外错误，请稍后重试"}), 500


# ----------------------------------------------------
# Azure TTS API Routes
# ----------------------------------------------------
@app.route('/api/azure/voices', methods=['GET'])
@rate_limit(10)
def get_azure_voices():
    """Gets the list of available Azure TTS voices for a specific region."""
    logger.info("Request received for Azure TTS voices")
    region = request.args.get('region', 'eastus') # Default region
    api_key = request.headers.get('Ocp-Apim-Subscription-Key')

    if not api_key:
        logger.warning("Azure API key missing in request headers")
        return jsonify({"error": "请求头中缺少 Azure API 密钥 (Ocp-Apim-Subscription-Key)"}), 400

    url = f"https://{region}.tts.speech.microsoft.com/cognitiveservices/voices/list"
    headers = {'Ocp-Apim-Subscription-Key': api_key}

    try:
        logger.info(f"Fetching Azure voices from region: {region}")
        response = requests.get(url, headers=headers, timeout=15) # Add timeout
        response.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)

        voices = response.json()
        logger.info(f"Successfully retrieved {len(voices)} Azure voices from region {region}.")
        # Sort voices maybe by locale then name
        voices.sort(key=lambda x: (x['Locale'], x['ShortName']))
        return jsonify(voices)

    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching Azure voices: {str(e)}", exc_info=True)
        status_code = e.response.status_code if e.response is not None else 500
        error_detail = f"无法连接或请求 Azure 语音列表失败 ({status_code})"
        try: # Try to get more details from Azure response
            error_content = e.response.json()
            error_detail += f": {error_content.get('error', {}).get('message', str(e))}"
        except: pass
        return jsonify({"error": error_detail}), status_code
    except Exception as e:
        logger.error(f"Unexpected error getting Azure voices: {str(e)}", exc_info=True)
        return jsonify({"error": "获取 Azure 语音列表时发生意外错误"}), 500

@app.route('/api/azure/synthesize', methods=['POST'])
@rate_limit(5) # Limit synthesis requests
def azure_synthesize():
    """Synthesizes text using Azure TTS."""
    logger.info("Request received for Azure TTS synthesis")
    try:
        data = request.json
        api_key = request.headers.get('Ocp-Apim-Subscription-Key')

        if not api_key:
            logger.warning("Azure API key missing for synthesis")
            return jsonify({"error": "请求头中缺少 Azure API 密钥 (Ocp-Apim-Subscription-Key)"}), 400
        if not data:
            logger.warning("Empty request data for Azure synthesis")
            return jsonify({"error": "请求数据不能为空"}), 400

        region = data.get('region', 'eastus')
        text = data.get('text', '').strip()
        voice = data.get('voice', 'zh-CN-XiaoxiaoNeural') # Default
        style = data.get('style', 'general') # Default style
        rate = data.get('rate', 0)
        pitch = data.get('pitch', 0)
        volume = data.get('volume', 0)

        # Infer locale from voice name (e.g., "zh-CN-XiaoxiaoNeural" -> "zh-CN")
        locale_match = re.match(r"([a-z]{2}-[A-Z]{2})-", voice)
        locale = locale_match.group(1) if locale_match else "en-US" # Default locale if pattern fails

        # Input validation
        if not text:
            return jsonify({"error": "合成文本不能为空"}), 400
        if len(text) > MAX_TEXT_LENGTH: # Azure might have its own limits too
             return jsonify({"error": f"文本过长，最大允许 {MAX_TEXT_LENGTH} 字符"}), 413
        try:
             rate = int(rate)
             pitch = int(pitch)
             volume = int(volume)
             # Validate Azure ranges based on documentation (can be % or absolute)
             # Let's assume % for now matching our UI sliders
             if not (-100 <= rate <= 200): # Example range, check Azure docs
                 raise ValueError("Rate out of range")
             if not (-100 <= pitch <= 100): # Example range
                 raise ValueError("Pitch out of range")
             if not (-100 <= volume <= 100): # Example range
                 raise ValueError("Volume out of range")
        except (TypeError, ValueError) as e:
             logger.warning(f"Invalid parameter type for Azure synthesis: {e}")
             return jsonify({"error": f"无效的语音参数: {e}"}), 400

        logger.info(f"Azure Synthesis Params: Region={region}, Voice={voice}, Style={style}, Locale={locale}, Rate={rate}%, Pitch={pitch}%, Volume={volume}%")

        # Construct SSML
        # Escape special XML characters in text
        escaped_text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

        # Only include express-as if style is not 'general' or empty
        inner_ssml = escaped_text
        if style and style.lower() != 'general':
            inner_ssml = f"<mstts:express-as style='{style}'>{escaped_text}</mstts:express-as>"

        ssml = f"""
<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis'
       xmlns:mstts='http://www.w3.org/2001/mstts' xml:lang='{locale}'>
    <voice name='{voice}'>
        <prosody rate='{rate}%' pitch='{pitch}%' volume='{volume}%'>
            {inner_ssml}
        </prosody>
    </voice>
</speak>
        """

        logger.debug(f"Azure SSML Payload: {ssml}")

        tts_url = f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"
        headers = {
            'Ocp-Apim-Subscription-Key': api_key,
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', # Common high-quality format
            'User-Agent': 'TTS-HTML-App/1.0' # Good practice to identify client
        }

        try:
            logger.info("Sending request to Azure TTS service...")
            response = requests.post(tts_url, headers=headers, data=ssml.encode('utf-8'), timeout=30) # Add timeout
            response.raise_for_status() # Check for HTTP errors

            logger.info(f"Azure TTS request successful (Status: {response.status_code})")

            # Use a unique filename for Azure audio too
            file_id = str(uuid.uuid4())
            output_filename = f"azure_{file_id}.mp3"
            output_filepath = validate_audio_filename(output_filename)

            # Save the content to the temp audio directory
            with open(output_filepath, 'wb') as f:
                f.write(response.content)
            logger.info(f"Saved Azure audio to: {output_filepath}")

            # Return the URL to access the saved file
            return jsonify({
                "audioUrl": f"/api/audio/{output_filename}",
                "format": "mp3"
            })
            # Alternative: Stream directly? Less robust for retries/downloads
            # return send_file(io.BytesIO(response.content), mimetype='audio/mpeg', as_attachment=False)

        except requests.exceptions.RequestException as e:
            logger.error(f"Error during Azure TTS request: {str(e)}", exc_info=True)
            status_code = e.response.status_code if e.response is not None else 500
            error_detail = f"Azure 语音合成请求失败 ({status_code})"
            try:
                error_content = e.response.json() # Azure might return JSON error
                error_detail += f": {error_content.get('error', {}).get('message', str(e))}"
            except:
                 # If response is not JSON, maybe it's plain text or SSML error
                 try: error_detail += f": {e.response.text[:200]}" # Show first 200 chars
                 except: pass
            return jsonify({"error": error_detail}), status_code
        except Exception as e:
            logger.error(f"Unexpected error during Azure synthesis: {str(e)}", exc_info=True)
            return jsonify({"error": "Azure 语音合成时发生意外错误"}), 500

    except Exception as e:
        logger.error(f"Unexpected error in /api/azure/synthesize: {str(e)}", exc_info=True)
        return jsonify({"error": "发生意外错误，请稍后重试"}), 500

# ----------------------------------------------------
# Shared API Routes (Audio Serving, Presets)
# ----------------------------------------------------
@app.route('/api/audio/<filename>', methods=['GET'])
def get_audio(filename):
    """Serves the generated audio file."""
    logger.debug(f"Request for audio file: {filename}")
    try:
        # Validate the filename to prevent directory traversal
        file_path = validate_audio_filename(filename)
        logger.debug(f"Attempting to serve audio from: {file_path}")

        if not os.path.exists(file_path):
            logger.warning(f"Audio file not found: {file_path}")
            return jsonify({"error": "音频文件不存在或已被清理"}), 404

        # Determine MIME type based on extension
        if filename.lower().endswith('.mp3'):
            mime_type = 'audio/mpeg'
        elif filename.lower().endswith('.wav'):
            mime_type = 'audio/wav'
        else:
            logger.warning(f"Unsupported audio format requested: {filename}")
            return jsonify({"error": "不支持的音频格式"}), 415 # Unsupported Media Type

        logger.info(f"Serving audio file: {filename} with MIME type: {mime_type}")
        return send_file(file_path, mimetype=mime_type, as_attachment=False) # Serve inline

    except Exception as e:
        logger.error(f"Error serving audio file {filename}: {str(e)}", exc_info=True)
        return jsonify({"error": "无法提供音频文件"}), 500

# --- Edge Presets ---
@app.route('/api/edge/presets', methods=['GET', 'POST', 'DELETE'])
def manage_edge_presets():
    """Manages presets specifically for Edge TTS."""
    logger.info(f"Request received for Edge presets: {request.method}")
    preset_prefix = "edge_"
    try:
        if request.method == 'GET':
            preset_name = request.args.get('name')
            if preset_name:
                # Get specific preset
                filename = secure_preset_filename(preset_name, prefix=preset_prefix)
                filepath = os.path.join(PRESETS_DIR, filename)
                logger.debug(f"Attempting to load Edge preset: {filepath}")
                if os.path.exists(filepath):
                    with open(filepath, 'r', encoding='utf-8') as f:
                        preset = json.load(f)
                    logger.info(f"Loaded Edge preset: {preset_name}")
                    # Return structure consistent with frontend expectations
                    return jsonify({
                        "name": preset_name, # Return original name
                        "voice": preset.get("voice", ""),
                        "rate": preset.get("rate", 0),
                        "volume": preset.get("volume", 0),
                        "pitch": preset.get("pitch", 0)
                        # Add format if you save it?
                    })
                else:
                    logger.warning(f"Edge preset not found: {preset_name} (File: {filename})")
                    return jsonify({"error": "预设不存在"}), 404
            else:
                # List all Edge presets
                presets = []
                logger.debug(f"Listing Edge presets from: {PRESETS_DIR}")
                for filename in os.listdir(PRESETS_DIR):
                    if filename.startswith(preset_prefix) and filename.endswith('.json'):
                        preset_name = filename[len(preset_prefix):-5] # Extract name
                        filepath = os.path.join(PRESETS_DIR, filename)
                        try:
                            with open(filepath, 'r', encoding='utf-8') as f:
                                preset = json.load(f)
                                presets.append({
                                    "name": preset_name,
                                    "voice": preset.get("voice", ""),
                                    # Include other fields if needed for display
                                })
                        except Exception as e:
                            logger.error(f"Error reading preset file {filename}: {e}")
                presets.sort(key=lambda x: x['name']) # Sort alphabetically
                logger.info(f"Found {len(presets)} Edge presets.")
                return jsonify(presets) # Return list directly as expected by JS

        elif request.method == 'POST':
            data = request.json
            name = data.get("name")
            if not name or not name.strip():
                return jsonify({"error": "预设名称不能为空"}), 400

            preset_data = {
                "voice": data.get("voice", ""),
                "rate": data.get("rate", 0),
                "volume": data.get("volume", 0),
                "pitch": data.get("pitch", 0)
                # Add format if needed: "format": data.get("format", "mp3")
            }
            filename = secure_preset_filename(name.strip(), prefix=preset_prefix)
            filepath = os.path.join(PRESETS_DIR, filename)
            logger.info(f"Saving Edge preset '{name}' to file: {filename}")
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(preset_data, f, indent=2, ensure_ascii=False)
            return jsonify({"success": True, "name": name.strip()})

        elif request.method == 'DELETE':
            name = request.args.get("name")
            if not name or not name.strip():
                return jsonify({"error": "要删除的预设名称不能为空"}), 400

            filename = secure_preset_filename(name.strip(), prefix=preset_prefix)
            filepath = os.path.join(PRESETS_DIR, filename)
            logger.info(f"Attempting to delete Edge preset '{name}' (File: {filename})")
            if os.path.exists(filepath):
                try:
                    os.remove(filepath)
                    logger.info(f"Successfully deleted Edge preset file: {filename}")
                    return jsonify({"success": True})
                except OSError as e:
                    logger.error(f"Error deleting preset file {filename}: {e}")
                    return jsonify({"error": "删除预设文件时出错"}), 500
            else:
                logger.warning(f"Attempted to delete non-existent Edge preset: {name} (File: {filename})")
                return jsonify({"error": "预设不存在"}), 404

    except Exception as e:
        logger.error(f"Error managing Edge presets: {str(e)}", exc_info=True)
        return jsonify({"error": "处理预设时发生错误"}), 500


# --- Azure Presets ---
@app.route('/api/azure/presets', methods=['GET', 'POST', 'DELETE'])
def manage_azure_presets():
    """Manages presets specifically for Azure TTS."""
    logger.info(f"Request received for Azure presets: {request.method}")
    preset_prefix = "azure_" # Distinct prefix
    try:
        if request.method == 'GET':
            preset_name = request.args.get('name')
            if preset_name:
                # Get specific preset
                filename = secure_preset_filename(preset_name, prefix=preset_prefix)
                filepath = os.path.join(PRESETS_DIR, filename)
                logger.debug(f"Attempting to load Azure preset: {filepath}")
                if os.path.exists(filepath):
                    with open(filepath, 'r', encoding='utf-8') as f:
                        preset = json.load(f)
                    logger.info(f"Loaded Azure preset: {preset_name}")
                    # Return structure consistent with frontend expectations
                    return jsonify({
                        "name": preset_name, # Return original name
                        "voice": preset.get("voice", ""),
                        "style": preset.get("style", "general"),
                        "rate": preset.get("rate", 0),
                        "pitch": preset.get("pitch", 0),
                        "volume": preset.get("volume", 0)
                        # Add region if saved?
                    })
                else:
                    logger.warning(f"Azure preset not found: {preset_name} (File: {filename})")
                    return jsonify({"error": "预设不存在"}), 404
            else:
                # List all Azure presets
                presets = []
                logger.debug(f"Listing Azure presets from: {PRESETS_DIR}")
                for filename in os.listdir(PRESETS_DIR):
                    if filename.startswith(preset_prefix) and filename.endswith('.json'):
                        preset_name = filename[len(preset_prefix):-5] # Extract name
                        filepath = os.path.join(PRESETS_DIR, filename)
                        try:
                            with open(filepath, 'r', encoding='utf-8') as f:
                                preset = json.load(f)
                                presets.append({
                                    "name": preset_name,
                                    "voice": preset.get("voice", ""),
                                    # Include style for display?
                                    "style": preset.get("style", "general"),
                                })
                        except Exception as e:
                            logger.error(f"Error reading preset file {filename}: {e}")
                presets.sort(key=lambda x: x['name']) # Sort alphabetically
                logger.info(f"Found {len(presets)} Azure presets.")
                return jsonify(presets) # Return list directly

        elif request.method == 'POST':
            data = request.json
            name = data.get("name")
            if not name or not name.strip():
                return jsonify({"error": "预设名称不能为空"}), 400

            preset_data = {
                "voice": data.get("voice", ""),
                "style": data.get("style", "general"),
                "rate": data.get("rate", 0),
                "pitch": data.get("pitch", 0),
                "volume": data.get("volume", 0)
                # Add region if needed: "region": data.get("region", "eastus")
            }
            filename = secure_preset_filename(name.strip(), prefix=preset_prefix)
            filepath = os.path.join(PRESETS_DIR, filename)
            logger.info(f"Saving Azure preset '{name}' to file: {filename}")
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(preset_data, f, indent=2, ensure_ascii=False)
            return jsonify({"success": True, "name": name.strip()})

        elif request.method == 'DELETE':
            name = request.args.get("name")
            if not name or not name.strip():
                return jsonify({"error": "要删除的预设名称不能为空"}), 400

            filename = secure_preset_filename(name.strip(), prefix=preset_prefix)
            filepath = os.path.join(PRESETS_DIR, filename)
            logger.info(f"Attempting to delete Azure preset '{name}' (File: {filename})")
            if os.path.exists(filepath):
                try:
                    os.remove(filepath)
                    logger.info(f"Successfully deleted Azure preset file: {filename}")
                    return jsonify({"success": True})
                except OSError as e:
                    logger.error(f"Error deleting preset file {filename}: {e}")
                    return jsonify({"error": "删除预设文件时出错"}), 500
            else:
                logger.warning(f"Attempted to delete non-existent Azure preset: {name} (File: {filename})")
                return jsonify({"error": "预设不存在"}), 404

    except Exception as e:
        logger.error(f"Error managing Azure presets: {str(e)}", exc_info=True)
        return jsonify({"error": "处理预设时发生错误"}), 500


# ----------------------------------------------------
# Background Tasks & App Start
# ----------------------------------------------------
def run_event_loop():
    """Runs the asyncio event loop."""
    logger.info("Starting asyncio event loop in background thread.")
    asyncio.set_event_loop(loop)
    try:
        loop.run_forever()
    finally:
        loop.close()
        logger.info("Asyncio event loop stopped.")

def cleanup_scheduler():
    """Periodically runs the cleanup task."""
    logger.info(f"Cleanup scheduler started. Interval: {CLEANUP_INTERVAL}s, Max Age: {MAX_FILE_AGE}s")
    while True:
        try:
            cleanup_old_files()
        except Exception as e:
            logger.error(f"Error in cleanup scheduler loop: {str(e)}")
        # Sleep until the next interval
        time.sleep(CLEANUP_INTERVAL)

if __name__ == "__main__":
    # Start event loop in background thread
    event_loop_thread = Thread(target=run_event_loop, name="AsyncioLoopThread", daemon=True)
    event_loop_thread.start()

    # Start cleanup thread
    cleanup_thread = Thread(target=cleanup_scheduler, name="CleanupThread", daemon=True)
    cleanup_thread.start()

    # Start Flask app
    # Use host='0.0.0.0' to make it accessible on the network if needed
    logger.info("Starting Flask development server...")
    app.run(host='127.0.0.1', port=5000, debug=False, threaded=True) # Disable debug for production-like testing if needed