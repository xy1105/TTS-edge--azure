/**
 * ========================================
 * Azure TTS Studio - Page Specific Logic
 * ========================================
 */

docReady(function() {
    // ---- Configuration ----
     const AZURE_API_BASE = '/api/azure'; // Base for Azure specific APIs

    // ---- DOM Element References ----
    const elements = {
        apiKeyInput: document.getElementById('azureApiKey'),
        regionSelect: document.getElementById('azureRegion'),
        btnLoadVoices: document.getElementById('btnLoadVoices'),
        voiceSelect: document.getElementById('voiceSelect'),
        styleSelect: document.getElementById('styleSelect'),
        textInput: document.getElementById('textInput'),
        charCounter: document.getElementById('charCounter'),
        btnGenerate: document.getElementById('btnGenerate'),
        btnClear: document.getElementById('btnClear'), // Added Clear button
        btnResetSettings: document.getElementById('btnResetSettings'), // Added Reset button
        voiceStatus: document.getElementById('voiceStatus'), // Added status indicator
        // Preset elements
        presetSelect: document.getElementById('presetSelect'),
        presetNameInput: document.getElementById('presetName'),
        btnLoadPreset: document.getElementById('btnLoadPreset'),
        btnSavePreset: document.getElementById('btnSavePreset'),
        btnDeletePreset: document.getElementById('btnDeletePreset'),
        // Audio player elements
        audioElement: document.getElementById('audioPlayer'),
        playPauseBtn: document.getElementById('btnPlayPause'),
        playIcon: document.getElementById('playIcon'),
        progressContainer: document.getElementById('progressContainer'),
        progressBar: document.getElementById('progressBar'),
        progressHandle: document.getElementById('progressHandle'),
        currentTimeDisplay: document.getElementById('currentTime'),
        totalTimeDisplay: document.getElementById('totalTime'),
        speedBtns: document.querySelectorAll('.speed-btn'), // Use class selector
        downloadBtn: document.getElementById('btnDownload'),
    };

    // ---- State ----
    let azureVoices = []; // Store fetched Azure voices
    // Define common styles - can be expanded or fetched if dynamic
    const azureStyles = {
        'zh-CN': ['general', 'chat', 'customerservice', 'newscast', 'assistant', 'lyrical', 'angry', 'calm', 'cheerful', 'disgruntled', 'fearful', 'gentle', 'sad', 'serious', 'affectionate', 'embarrassed', 'friendly'],
        'en-US': ['general', 'chat', 'customerservice', 'newscast', 'assistant', 'narration-professional', 'newscast-casual', 'angry', 'cheerful', 'excited', 'friendly', 'hopeful', 'sad', 'shouting', 'terrified', 'unfriendly', 'whispering'],
        // Add other locales as needed
    };

    // ---- Initialize Sliders ----
    const rateControl = setupSlider('rateSlider', 'rateDisplay', '%');
    const pitchControl = setupSlider('pitchSlider', 'pitchDisplay', '%');
    const volumeControl = setupSlider('volumeSlider', 'volumeDisplay', '%');

    if (!rateControl || !pitchControl || !volumeControl) {
         console.error("One or more Azure sliders failed to initialize.");
         showToast('error', '初始化失败', '无法初始化部分语音参数控件。');
    }

    // ---- Initialize Audio Player ----
    const player = new AudioPlayerController({
        audioElementId: 'audioPlayer',
        playPauseBtnId: 'btnPlayPause',
        playIconId: 'playIcon',
        progressContainerId: 'progressContainer',
        progressBarId: 'progressBar',
        progressHandleId: 'progressHandle',
        currentTimeDisplayId: 'currentTime',
        totalTimeDisplayId: 'totalTime',
        speedBtnsSelector: '.speed-btn',
        downloadBtnId: 'btnDownload'
    });

    // ---- Initialize Preset Manager ----
     const presetManager = new PresetManager({
        presetSelectId: 'presetSelect',
        presetNameInputId: 'presetName',
        loadPresetBtnId: 'btnLoadPreset',
        savePresetBtnId: 'btnSavePreset',
        deletePresetBtnId: 'btnDeletePreset',
        apiEndpoint: `${AZURE_API_BASE}/presets`, // Specific Azure preset endpoint
        applyPresetCallback: applyPresetSettings,
        getCurrentSettingsCallback: getCurrentUiSettings
    });

    // ---- Core Functions ----

    // Load Azure settings from localStorage
    function loadSettings() {
        try {
            const settings = JSON.parse(localStorage.getItem('azureTtsSettings')) || {};

            if (settings.apiKey && elements.apiKeyInput) elements.apiKeyInput.value = settings.apiKey;
            if (settings.region && elements.regionSelect) elements.regionSelect.value = settings.region;
            if (settings.voice && elements.voiceSelect) elements.voiceSelect.value = settings.voice; // Applied after voices load
            if (settings.style && elements.styleSelect) elements.styleSelect.value = settings.style; // Applied after voices load
            if (settings.rate !== undefined && rateControl) rateControl.slider.value = settings.rate;
            if (settings.pitch !== undefined && pitchControl) pitchControl.slider.value = settings.pitch;
            if (settings.volume !== undefined && volumeControl) volumeControl.slider.value = settings.volume;
            if (settings.text && elements.textInput) elements.textInput.value = settings.text;
            if (settings.playbackRate) player.setPlaybackSpeed(settings.playbackRate);

            updateSlidersDisplay();
            updateCharCounter();
            console.log("Azure settings loaded.");
            return true;
        } catch (e) {
            console.error('加载 Azure 本地设置失败:', e);
            showToast('warning', '加载设置失败', '无法从本地存储加载 Azure 设置。');
            return false;
        }
    }

    // Save Azure settings to localStorage
     const saveSettings = debounce(() => {
        try {
            const settings = {
                apiKey: elements.apiKeyInput.value,
                region: elements.regionSelect.value,
                voice: elements.voiceSelect.value,
                style: elements.styleSelect.value,
                rate: rateControl ? rateControl.slider.value : 0,
                pitch: pitchControl ? pitchControl.slider.value : 0,
                volume: volumeControl ? volumeControl.slider.value : 0,
                text: elements.textInput.value,
                playbackRate: player.getPlaybackRate()
            };
            localStorage.setItem('azureTtsSettings', JSON.stringify(settings));
            // console.log("Azure settings saved.");
            return true;
        } catch (e) {
            console.error('保存 Azure 设置失败:', e);
            return false;
        }
    }, 500);

     // Reset settings to default
    function resetSettings() {
        try {
            // Don't reset API key or region unless explicitly requested
            // elements.apiKeyInput.value = '';
            // elements.regionSelect.value = 'eastus'; // Default region
            if (elements.voiceSelect) elements.voiceSelect.value = '';
            if (elements.styleSelect) {
                 elements.styleSelect.innerHTML = '<option value="">(语音加载后可用)</option><option value="general">(默认风格)</option>';
                 elements.styleSelect.value = 'general';
                 elements.styleSelect.disabled = true;
            }
            if (rateControl) rateControl.slider.value = 0;
            if (pitchControl) pitchControl.slider.value = 0;
            if (volumeControl) volumeControl.slider.value = 0;
            if (elements.textInput) elements.textInput.value = '';
            player.setPlaybackSpeed(1);

            updateSlidersDisplay();
            updateCharCounter();
            saveSettings();
            showToast('success', '设置已重置', '语音参数和文本已恢复默认。');
        } catch (e) {
            console.error('重置 Azure 设置失败:', e);
            showToast('error', '重置失败', '无法重置设置，请刷新页面。');
        }
    }


    // Update slider display values
    function updateSlidersDisplay() {
        if (rateControl) rateControl.updateDisplay();
        if (pitchControl) pitchControl.updateDisplay();
        if (volumeControl) volumeControl.updateDisplay();
    }

     // Update character counter
    function updateCharCounter() {
        if (!elements.textInput || !elements.charCounter) return;
        const count = elements.textInput.value.length;
        // Azure counts bytes for some limits, but char count is fine for UI feedback
        elements.charCounter.textContent = `${count} 字`;
        // Add warning/error classes based on potential limits if needed
    }

     // Apply preset settings to UI (Callback for PresetManager)
    function applyPresetSettings(presetData) {
         if (!presetData) return;
          // Apply settings, checking if controls exist
         if (presetData.voice && elements.voiceSelect) {
            // We need voices loaded to check existence and update styles
            if (azureVoices.length > 0) {
                const voiceExists = azureVoices.some(v => v.ShortName === presetData.voice);
                if (voiceExists) {
                    elements.voiceSelect.value = presetData.voice;
                    updateStyleOptions(presetData.voice); // Update styles based on voice
                     if (presetData.style && elements.styleSelect) {
                        elements.styleSelect.value = presetData.style;
                     }
                } else {
                    showToast('warning', '语音未找到', `预设中的语音 "${presetData.voice}" 在当前区域不可用。`);
                    // Maybe load voices for the preset's region if region is saved?
                }
            } else {
                // If voices aren't loaded yet, store the desired voice/style
                // and apply it after voices load successfully.
                elements.voiceSelect.dataset.pendingPresetVoice = presetData.voice;
                elements.voiceSelect.dataset.pendingPresetStyle = presetData.style;
                showToast('info', '延迟应用', '语音列表未加载，预设将在加载后应用。');
            }
         }
         // Apply sliders even if voice not loaded yet
         if (presetData.rate !== undefined && rateControl) rateControl.slider.value = presetData.rate;
         if (presetData.pitch !== undefined && pitchControl) pitchControl.slider.value = presetData.pitch;
         if (presetData.volume !== undefined && volumeControl) volumeControl.slider.value = presetData.volume;

         updateSlidersDisplay(); // Update slider text
         saveSettings(); // Save the applied settings
    }

    // Get current UI settings (Callback for PresetManager)
    function getCurrentUiSettings() {
         return {
            voice: elements.voiceSelect.value,
            style: elements.styleSelect.value,
            rate: rateControl ? rateControl.slider.value : 0,
            pitch: pitchControl ? pitchControl.slider.value : 0,
            volume: volumeControl ? volumeControl.slider.value : 0,
            // Optionally save region/apiKey? Be careful with API key saving.
            // region: elements.regionSelect.value
        };
    }

    // Fetch Azure voices
    async function loadAzureVoices() {
        const apiKey = elements.apiKeyInput.value.trim();
        const region = elements.regionSelect.value;

        if (!apiKey) {
            showToast('warning', '请输入密钥', '需要 Azure API 密钥才能加载语音。');
            elements.apiKeyInput.focus();
            return;
        }

        updateButtonState(elements.btnLoadVoices, true, '加载中...');
        if (elements.voiceStatus) {
             elements.voiceStatus.className = 'status-indicator loading';
             elements.voiceStatus.innerHTML = '<span class="pulse"></span> 正在获取语音列表...';
        }
        elements.voiceSelect.innerHTML = '<option value="">加载中...</option>';
        elements.voiceSelect.disabled = true;
        elements.styleSelect.disabled = true;

        try {
            const response = await fetch(`${AZURE_API_BASE}/voices?region=${region}`, {
                headers: { 'Ocp-Apim-Subscription-Key': apiKey }
            });

             if (!response.ok) {
                let errorMsg = `获取语音列表失败 (${response.status})`;
                try {
                    const errorData = await response.json();
                    errorMsg += `: ${errorData.error?.message || errorData.error || JSON.stringify(errorData)}`;
                } catch(e) { /* Ignore if response is not JSON */ }
                throw new Error(errorMsg);
            }

            azureVoices = await response.json(); // Store the loaded voices

            populateAzureVoiceList(azureVoices);

            // Check if a preset was waiting for voices to load
            const pendingVoice = elements.voiceSelect.dataset.pendingPresetVoice;
            const pendingStyle = elements.voiceSelect.dataset.pendingPresetStyle;
            if (pendingVoice) {
                 const voiceExists = azureVoices.some(v => v.ShortName === pendingVoice);
                 if (voiceExists) {
                     elements.voiceSelect.value = pendingVoice;
                     updateStyleOptions(pendingVoice);
                     if (pendingStyle) elements.styleSelect.value = pendingStyle;
                     showToast('success', '预设已应用', `之前加载的预设 "${elements.presetSelect.value}" 已应用。`);
                 } else {
                     showToast('warning', '语音未找到', `之前加载的预设语音 "${pendingVoice}" 在此区域不可用。`);
                 }
                 // Clear pending flags
                 delete elements.voiceSelect.dataset.pendingPresetVoice;
                 delete elements.voiceSelect.dataset.pendingPresetStyle;
            } else {
                 // Restore selection from localStorage if no preset pending
                 const settings = JSON.parse(localStorage.getItem('azureTtsSettings')) || {};
                 if (settings.voice && azureVoices.some(v => v.ShortName === settings.voice)) {
                    elements.voiceSelect.value = settings.voice;
                    updateStyleOptions(settings.voice);
                    if (settings.style) elements.styleSelect.value = settings.style;
                 } else if (azureVoices.length > 0) {
                    // Select first voice as default if none saved/restored
                    elements.voiceSelect.value = azureVoices[0].ShortName;
                     updateStyleOptions(azureVoices[0].ShortName);
                 }
            }


             if (elements.voiceStatus) {
                elements.voiceStatus.className = 'status-indicator ready';
                elements.voiceStatus.innerHTML = `<i class="fas fa-check-circle"></i> 已加载 ${azureVoices.length} 个语音 (${region})`;
             }
             showToast('success', '语音加载成功', `从区域 ${region} 加载了 ${azureVoices.length} 个语音。`);

        } catch (error) {
            console.error('加载 Azure 语音失败:', error);
             if (elements.voiceStatus) {
                elements.voiceStatus.className = 'status-indicator error';
                elements.voiceStatus.innerHTML = `<i class="fas fa-exclamation-circle"></i> 加载语音失败`;
             }
            showToast('error', '加载失败', `加载 Azure 语音失败: ${error.message}`);
            elements.voiceSelect.innerHTML = '<option value="">加载失败</option>';
        } finally {
            updateButtonState(elements.btnLoadVoices, false);
             elements.voiceSelect.disabled = (azureVoices.length === 0); // Keep disabled if loading failed
        }
    }

    // Populate Azure voice dropdown
    function populateAzureVoiceList(voices) {
        elements.voiceSelect.innerHTML = ''; // Clear

        if (!voices || voices.length === 0) {
            elements.voiceSelect.innerHTML = '<option value="">无可用语音</option>';
            return;
        }

        // Group by locale
        const voicesByLocale = {};
        voices.forEach(voice => {
            if (!voicesByLocale[voice.Locale]) {
                voicesByLocale[voice.Locale] = [];
            }
            voicesByLocale[voice.Locale].push(voice);
        });

        // Prioritize Chinese locales
        const locales = Object.keys(voicesByLocale).sort((a, b) => {
            if (a.startsWith('zh-') && !b.startsWith('zh-')) return -1;
            if (!a.startsWith('zh-') && b.startsWith('zh-')) return 1;
            return a.localeCompare(b); // Sort others alphabetically
        });

        locales.forEach(locale => {
            const optgroup = document.createElement('optgroup');
            const langName = new Intl.DisplayNames(['zh-CN'], { type: 'language' }).of(locale.split('-')[0]) || locale;
            optgroup.label = `${langName} (${locale})`;
            if (locale.startsWith('zh-')) {
                 optgroup.label = `中文 (${locale})`; // Specific label for Chinese
            }

            voicesByLocale[locale].sort((a,b) => a.LocalName.localeCompare(b.LocalName)).forEach(voice => {
                createAzureVoiceOption(voice, optgroup);
            });
            elements.voiceSelect.appendChild(optgroup);
        });
    }

    // Create a single Azure voice option
    function createAzureVoiceOption(voice, parentElement) {
        const option = document.createElement('option');
        option.value = voice.ShortName;
         // Display format: Local Name (Gender, StyleCount) - or just Local Name (Gender)
        option.textContent = `${voice.LocalName} (${voice.Gender})`;
        option.dataset.gender = voice.Gender;
        option.dataset.locale = voice.Locale;
        // Store styles if available? Azure API doesn't list styles per voice directly in list API.
        // option.dataset.styles = JSON.stringify(voice.StyleList || []);
        parentElement.appendChild(option);
        return option;
    }


    // Update style select based on selected voice's locale
    function updateStyleOptions(selectedVoiceShortName) {
        const selectedVoice = azureVoices.find(v => v.ShortName === selectedVoiceShortName);
        if (!selectedVoice) {
            elements.styleSelect.disabled = true;
            elements.styleSelect.innerHTML = '<option value="">(未知语音)</option>';
            return;
        }

        const locale = selectedVoice.Locale;
        // Use predefined styles based on locale, or default to 'general'
        const availableStyles = azureStyles[locale] || ['general'];

        elements.styleSelect.innerHTML = ''; // Clear previous styles
        elements.styleSelect.disabled = false;

         // Add default 'general' style first, make it default selection
         const generalOption = document.createElement('option');
         generalOption.value = 'general';
         generalOption.textContent = '(默认风格 - general)';
         generalOption.selected = true; // Select general by default
         elements.styleSelect.appendChild(generalOption);

        // Add other available styles
        availableStyles.forEach(style => {
            if (style !== 'general') { // Don't add general again
                const option = document.createElement('option');
                option.value = style;
                option.textContent = style;
                elements.styleSelect.appendChild(option);
            }
        });

        // Restore saved style if applicable (after populating)
         const settings = JSON.parse(localStorage.getItem('azureTtsSettings')) || {};
         if (settings.voice === selectedVoiceShortName && settings.style && availableStyles.includes(settings.style)) {
             elements.styleSelect.value = settings.style;
         } else {
             elements.styleSelect.value = 'general'; // Default to general if saved style not found or voice changed
         }

    }

    // Generate Azure speech
    async function generateAzureSpeech() {
        const apiKey = elements.apiKeyInput.value.trim();
        if (!apiKey) {
            showToast('warning', '请输入密钥', '需要 Azure API 密钥才能生成语音。');
             elements.apiKeyInput.focus();
            return;
        }
        const voice = elements.voiceSelect.value;
        if (!voice) {
             showToast('warning', '请选择语音', '您需要先选择一个语音模型。');
            return;
        }
        const text = elements.textInput.value.trim();
        if (!text) {
            showToast('warning', '请输入文本', '合成内容不能为空。');
            return;
        }
         // Basic SSML check (optional, simple version)
         const isSSML = text.startsWith('<speak') && text.endsWith('</speak>');
         if (isSSML) {
             showToast('info', 'SSML 输入', '检测到 SSML 输入，将直接使用。');
             // Maybe disable style/rate/pitch/volume sliders if using SSML?
         }


        updateButtonState(elements.btnGenerate, true, '生成中...');

        const payload = {
            text: text,
            voice: voice,
            style: elements.styleSelect.value || 'general',
            rate: rateControl ? rateControl.slider.value : 0,
            pitch: pitchControl ? pitchControl.slider.value : 0,
            volume: volumeControl ? volumeControl.slider.value : 0,
            region: elements.regionSelect.value,
            // Locale is inferred from voice in backend, but could pass if needed
        };

        try {
            const response = await fetch(`${AZURE_API_BASE}/synthesize`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Ocp-Apim-Subscription-Key': apiKey
                },
                body: JSON.stringify(payload)
            });

             if (!response.ok) {
                 let errorMsg = `合成失败 (${response.status})`;
                 // Try to parse JSON error first, then text
                 try {
                     const errorData = await response.json();
                     errorMsg += `: ${errorData.error || JSON.stringify(errorData)}`;
                 } catch (e) {
                     try {
                         const textError = await response.text();
                         errorMsg += `: ${textError.substring(0, 200)}`; // Show first 200 chars
                     } catch(e2) {
                         errorMsg += `: ${response.statusText}`;
                     }
                 }
                 throw new Error(errorMsg);
             }

            // --- FIX STARTS HERE ---
            // Check if response is JSON (which it should be now)
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                // This case should ideally not happen if backend is correct
                const responseText = await response.text(); // Get text for debugging
                console.error("Azure synthesis returned non-JSON content:", responseText);
                throw new Error(`服务器返回了意外的内容类型: ${contentType}. 内容: ${responseText.substring(0,100)}...`);
            }

            // Parse the JSON response from the backend
            const data = await response.json();

            // Check if the JSON contains the expected audioUrl
            if (!data.audioUrl) {
                console.error("Backend JSON response missing audioUrl:", data);
                throw new Error('语音合成成功，但服务器响应缺少音频URL');
            }

            // Construct filename and load audio using the URL from JSON
            const filename = `azure_${payload.voice}_${new Date().getTime()}.mp3`; // Use mp3 as backend saves this format
            player.loadAudio(data.audioUrl, filename); // Use player's load method with the URL

            // --- FIX ENDS HERE ---


            showToast('success', '生成成功', '音频已生成并加载到播放器。');
            saveSettings(); // Save settings after successful generation


        } catch (error) {
            // Log the specific error caught by the frontend logic
            console.error('Azure 生成语音失败:', error); // Keep this log for debugging
            showToast('error', '生成失败', `Azure 语音生成出错: ${error.message}`);
             if (elements.downloadBtn) elements.downloadBtn.disabled = true;
        } finally {
            updateButtonState(elements.btnGenerate, false);
        }
    }

     // Clear text input
    function clearText() {
        if (elements.textInput) {
            elements.textInput.value = '';
            updateCharCounter();
            saveSettings(); // Save the cleared state
            showToast('info', '文本已清空', '');
        }
    }

    // ---- Event Listeners ----
    function initEventListeners() {
        if (elements.btnLoadVoices) {
            elements.btnLoadVoices.addEventListener('click', loadAzureVoices);
        }
        if (elements.apiKeyInput) {
            elements.apiKeyInput.addEventListener('change', saveSettings); // Save on change
        }
        if (elements.regionSelect) {
             elements.regionSelect.addEventListener('change', () => {
                 saveSettings();
                 // Optionally auto-load voices on region change if API key exists?
                 if (elements.apiKeyInput.value.trim()) {
                    // loadAzureVoices(); // Decide if this is desired UX
                 } else {
                     if (elements.voiceStatus) {
                         elements.voiceStatus.innerHTML = `<i class="fas fa-info-circle"></i> 区域已更改，请输入密钥后加载语音`;
                         elements.voiceStatus.className = 'status-indicator ready';
                     }
                 }
             });
        }

        if (elements.voiceSelect) {
            elements.voiceSelect.addEventListener('change', () => {
                if (elements.voiceSelect.value) {
                    updateStyleOptions(elements.voiceSelect.value);
                }
                saveSettings();
            });
        }
        if (elements.styleSelect) {
            elements.styleSelect.addEventListener('change', saveSettings);
        }

        if (elements.textInput) {
            elements.textInput.addEventListener('input', debounce(() => {
                updateCharCounter();
                saveSettings();
            }, 300));
        }

        // Slider saving
        if(rateControl) rateControl.slider.addEventListener('change', saveSettings);
        if(pitchControl) pitchControl.slider.addEventListener('change', saveSettings);
        if(volumeControl) volumeControl.slider.addEventListener('change', saveSettings);


        if (elements.btnGenerate) {
            elements.btnGenerate.addEventListener('click', generateAzureSpeech);
        }
         if (elements.btnClear) { // Listener for new button
            elements.btnClear.addEventListener('click', clearText);
        }
        if (elements.btnResetSettings) { // Listener for new button
            elements.btnResetSettings.addEventListener('click', resetSettings);
        }

         // Preset and Player listeners handled by their controllers
    }

    // ---- Initialization ----
    function init() {
        console.log("Initializing Azure TTS Studio...");
        initEventListeners();
        loadSettings(); // Load saved settings
        // Voices loaded manually via button click
        updateSlidersDisplay(); // Set initial slider values display
        console.log("Azure Initialization complete.");
    }

    init(); // Start the application
});