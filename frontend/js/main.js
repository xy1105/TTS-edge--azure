/**
 * =======================================
 * Edge TTS Studio - Page Specific Logic
 * =======================================
 */

docReady(function() {
  // ---- Configuration ----
  const MAX_CHARS = 50000;
  const EDGE_API_BASE = '/api/edge'; // Base for Edge specific APIs

  // ---- DOM Element References ----
  const elements = {
      voiceSelect: document.getElementById('voiceSelect'),
      btnGetVoices: document.getElementById('btnGetVoices'),
      voiceStatus: document.getElementById('voiceStatus'),
      textInput: document.getElementById('textInput'),
      charCounter: document.getElementById('charCounter'),
      btnGenerate: document.getElementById('btnGenerate'),
      btnClear: document.getElementById('btnClear'),
      btnResetSettings: document.getElementById('btnResetSettings'),
      formatRadios: document.querySelectorAll('input[name="format"]'),
      // Preset elements (IDs match common.js expectation)
      presetSelect: document.getElementById('presetSelect'),
      presetNameInput: document.getElementById('presetName'),
      btnLoadPreset: document.getElementById('btnLoadPreset'),
      btnSavePreset: document.getElementById('btnSavePreset'),
      btnDeletePreset: document.getElementById('btnDeletePreset'),
      // Audio player elements (IDs match common.js expectation)
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
  let allVoices = { chinese: [], other: [] }; // Store fetched voices

  // ---- Initialize Sliders ----
  // setupSlider returns object { slider, display, updateDisplay } or null
  const rateControl = setupSlider('rateSlider', 'rateDisplay', '%');
  const volumeControl = setupSlider('volumeSlider', 'volumeDisplay', '%');
  const pitchControl = setupSlider('pitchSlider', 'pitchDisplay', ' st'); // Use 'st' for semitones display

  // Check if sliders initialized correctly
  if (!rateControl || !volumeControl || !pitchControl) {
      console.error("One or more sliders failed to initialize.");
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
      speedBtnsSelector: '.speed-btn', // Selector for speed buttons
      downloadBtnId: 'btnDownload'
  });

  // ---- Initialize Preset Manager ----
  const presetManager = new PresetManager({
      presetSelectId: 'presetSelect',
      presetNameInputId: 'presetName',
      loadPresetBtnId: 'btnLoadPreset',
      savePresetBtnId: 'btnSavePreset',
      deletePresetBtnId: 'btnDeletePreset',
      apiEndpoint: `${EDGE_API_BASE}/presets`, // Specific Edge preset endpoint
      applyPresetCallback: applyPresetSettings, // Function to apply loaded preset
      getCurrentSettingsCallback: getCurrentUiSettings // Function to get current settings for saving
  });

  // ---- Core Functions ----

  // Load settings from localStorage
  function loadSettings() {
      try {
          const settings = JSON.parse(localStorage.getItem('edgeTtsSettings')) || {};

          // Apply settings only if controls exist
          if (settings.voice && elements.voiceSelect) elements.voiceSelect.value = settings.voice; // Will be selected after voices load
          if (settings.rate !== undefined && rateControl) rateControl.slider.value = settings.rate;
          if (settings.volume !== undefined && volumeControl) volumeControl.slider.value = settings.volume;
          if (settings.pitch !== undefined && pitchControl) pitchControl.slider.value = settings.pitch;
          if (settings.format && elements.formatRadios.length > 0) {
              const radio = document.querySelector(`input[name="format"][value="${settings.format}"]`);
              if (radio) radio.checked = true;
          }
          if (settings.text && elements.textInput) elements.textInput.value = settings.text;
          if (settings.playbackRate) player.setPlaybackSpeed(settings.playbackRate); // Use player method

          updateSlidersDisplay(); // Update display based on loaded values
          updateCharCounter(); // Update counter for loaded text

          console.log("Settings loaded from localStorage.");
          return true;
      } catch (e) {
          console.error('加载本地设置失败:', e);
          showToast('warning', '加载设置失败', '无法从本地存储加载您的设置。');
          return false;
      }
  }

  // Save settings to localStorage
  const saveSettings = debounce(() => { // Debounce saving to avoid excessive writes
      try {
          const settings = {
              voice: elements.voiceSelect.value,
              rate: rateControl ? rateControl.slider.value : 0,
              volume: volumeControl ? volumeControl.slider.value : 0,
              pitch: pitchControl ? pitchControl.slider.value : 0,
              format: getSelectedFormat(),
              text: elements.textInput.value,
              playbackRate: player.getPlaybackRate() // Get rate from player
          };
          localStorage.setItem('edgeTtsSettings', JSON.stringify(settings));
          // console.log("Settings saved to localStorage."); // Optional: for debugging
          return true;
      } catch (e) {
          console.error('保存设置失败:', e);
          // Don't toast on every save, only on load/reset errors
          return false;
      }
  }, 500); // Save max once every 500ms

  // Reset settings to default
  function resetSettings() {
      try {
          if (elements.voiceSelect) elements.voiceSelect.value = ''; // Default to empty/placeholder
          if (rateControl) rateControl.slider.value = 0;
          if (volumeControl) volumeControl.slider.value = 0;
          if (pitchControl) pitchControl.slider.value = 0;
          if (elements.formatRadios.length > 0) {
               const defaultFormat = document.querySelector('input[name="format"][value="mp3"]');
               if (defaultFormat) defaultFormat.checked = true;
          }
          if (elements.textInput) elements.textInput.value = '';
          player.setPlaybackSpeed(1); // Reset player speed

          updateSlidersDisplay();
          updateCharCounter();
          saveSettings(); // Save the reset state
          showToast('success', '设置已重置', '所有参数已恢复为默认值。');
      } catch (e) {
          console.error('重置设置失败:', e);
          showToast('error', '重置失败', '无法重置设置，请刷新页面。');
      }
  }

  // Update slider display values
  function updateSlidersDisplay() {
      if (rateControl) rateControl.updateDisplay();
      if (volumeControl) volumeControl.updateDisplay();
      if (pitchControl) pitchControl.updateDisplay(); // Will show 'st' unit
  }

  // Update character counter
  function updateCharCounter() {
      if (!elements.textInput || !elements.charCounter) return;
      const count = elements.textInput.value.length;
      elements.charCounter.textContent = `${count}/${MAX_CHARS}`;
      elements.charCounter.className = 'char-counter'; // Reset class
      if (count > MAX_CHARS) {
          elements.charCounter.classList.add('error');
      } else if (count > MAX_CHARS * 0.9) {
          elements.charCounter.classList.add('warning');
      }
  }

  // Get selected output format
  function getSelectedFormat() {
      const checkedRadio = document.querySelector('input[name="format"]:checked');
      return checkedRadio ? checkedRadio.value : 'mp3'; // Default to mp3 if none selected
  }

  // Apply preset settings to UI (Callback for PresetManager)
  function applyPresetSettings(presetData) {
       if (!presetData) return;
       // Apply settings, checking if controls exist
       if (presetData.voice && elements.voiceSelect) {
            // Check if the voice exists in the dropdown
           if (elements.voiceSelect.querySelector(`option[value="${presetData.voice}"]`)) {
                elements.voiceSelect.value = presetData.voice;
           } else {
               showToast('warning', '语音未找到', `预设中的语音 "${presetData.voice}" 当前不可用。`);
               // Optionally try to load voices again or select a default
           }
       }
       if (presetData.rate !== undefined && rateControl) rateControl.slider.value = presetData.rate;
       if (presetData.volume !== undefined && volumeControl) volumeControl.slider.value = presetData.volume;
       if (presetData.pitch !== undefined && pitchControl) pitchControl.slider.value = presetData.pitch;

       updateSlidersDisplay(); // Update display after applying values
       saveSettings(); // Save the newly loaded settings
  }

  // Get current UI settings (Callback for PresetManager)
  function getCurrentUiSettings() {
       return {
          voice: elements.voiceSelect.value,
          rate: rateControl ? rateControl.slider.value : 0,
          volume: volumeControl ? volumeControl.slider.value : 0,
          pitch: pitchControl ? pitchControl.slider.value : 0,
          format: getSelectedFormat() // Also save format? Optional.
      };
  }


  // Fetch voices from backend
  async function getVoices() {
      if (!elements.btnGetVoices || !elements.voiceStatus || !elements.voiceSelect) return;

      updateButtonState(elements.btnGetVoices, true, '加载中...'); // Use common helper
      elements.voiceStatus.className = 'status-indicator loading';
      elements.voiceStatus.innerHTML = '<span class="pulse"></span> 正在获取语音列表...';
      elements.voiceSelect.innerHTML = '<option value="">加载中...</option>';
      elements.voiceSelect.disabled = true;

      try {
          const response = await fetch(`${EDGE_API_BASE}/voices`);
          if (!response.ok) {
               const errorData = await response.json().catch(() => ({}));
               throw new Error(errorData.error || `获取失败: ${response.status}`);
          }
          const data = await response.json();

          if (!data || !Array.isArray(data.chinese_voices)) {
              throw new Error('返回数据格式不正确');
          }

          allVoices.chinese = data.chinese_voices || [];
          allVoices.other = data.other_voices || [];

          populateVoiceList(allVoices.chinese, allVoices.other); // Populate dropdown

          // Restore selection after populating
          const settings = JSON.parse(localStorage.getItem('edgeTtsSettings')) || {};
          if (settings.voice && elements.voiceSelect.querySelector(`option[value="${settings.voice}"]`)) {
              elements.voiceSelect.value = settings.voice;
          } else if (allVoices.chinese.length > 0) {
               // Select the first Chinese voice if no setting found
               elements.voiceSelect.value = allVoices.chinese[0].ShortName;
          }


          elements.voiceStatus.className = 'status-indicator ready'; // Use 'ready' class
          elements.voiceStatus.innerHTML = `<i class="fas fa-check-circle"></i> 已加载 ${allVoices.chinese.length + allVoices.other.length} 个语音`;
          showToast('success', '语音加载成功', `共找到 ${allVoices.chinese.length + allVoices.other.length} 个语音模型`);

      } catch (error) {
          console.error('获取语音列表失败:', error);
          elements.voiceStatus.className = 'status-indicator error';
          elements.voiceStatus.innerHTML = `<i class="fas fa-exclamation-circle"></i> 获取语音列表失败`;
          showToast('error', '加载错误', `获取语音列表失败: ${error.message}`);
          elements.voiceSelect.innerHTML = '<option value="">加载失败</option>';
      } finally {
          updateButtonState(elements.btnGetVoices, false); // Use common helper
          elements.voiceSelect.disabled = false;
      }
  }

  // Populate voice select dropdown
  function populateVoiceList(chineseVoices, otherVoices) {
      if (!elements.voiceSelect) return;
      elements.voiceSelect.innerHTML = ''; // Clear existing options

      // Add Chinese voices
      if (chineseVoices.length > 0) {
          const chineseOptgroup = document.createElement('optgroup');
          chineseOptgroup.label = '中文语音 (Chinese)';
          chineseVoices.forEach(voice => createVoiceOption(voice, chineseOptgroup));
          elements.voiceSelect.appendChild(chineseOptgroup);
      }

      // Add toggle for other languages if available
      if (otherVoices.length > 0) {
          const otherOption = document.createElement('option');
          otherOption.value = '';
          otherOption.textContent = `▼ 其他 ${otherVoices.length} 种语言 ▼`;
          otherOption.className = 'other-languages-toggle'; // Add class for styling/JS
          elements.voiceSelect.appendChild(otherOption);
          // The actual loading of other languages happens on demand in the event listener
      }
  }

  // Create a single voice option element
  function createVoiceOption(voice, parentElement) {
      const option = document.createElement('option');
      option.value = voice.ShortName;
      // Display format: Friendly Name (Locale, Gender)
      option.textContent = `${voice.FriendlyName || voice.ShortName} (${voice.Locale}, ${voice.Gender})`;
      option.dataset.gender = voice.Gender; // Store gender/locale for styling/filtering
      option.dataset.locale = voice.Locale;
      parentElement.appendChild(option);
      return option;
  }

  // Handle showing other languages when toggle is selected
  function showOtherLanguages() {
      const otherVoices = allVoices.other;
      if (otherVoices.length === 0 || !elements.voiceSelect) return;

      // Remove the toggle option
      const toggleOption = elements.voiceSelect.querySelector('.other-languages-toggle');
      if (toggleOption) elements.voiceSelect.removeChild(toggleOption);

      // Group other voices by language for optgroups
      const voicesByLang = {};
      otherVoices.forEach(voice => {
          const langCode = voice.Locale.split('-')[0];
          const langName = new Intl.DisplayNames(['zh-CN'], { type: 'language' }).of(langCode) || langCode;
          const groupLabel = `${langName} (${langCode.toUpperCase()})`;
          if (!voicesByLang[groupLabel]) {
              voicesByLang[groupLabel] = [];
          }
          voicesByLang[groupLabel].push(voice);
      });

      // Sort language groups alphabetically
      const sortedLangLabels = Object.keys(voicesByLang).sort();

      // Add optgroups and options
      sortedLangLabels.forEach(label => {
          const group = document.createElement('optgroup');
          group.label = label;
          voicesByLang[label].forEach(voice => createVoiceOption(voice, group));
          elements.voiceSelect.appendChild(group);
      });

      // Add "Collapse" option
      const collapseOption = document.createElement('option');
      collapseOption.value = '';
      collapseOption.textContent = '▲ 收起其他语言 ▲';
      collapseOption.className = 'other-languages-collapse';
      elements.voiceSelect.appendChild(collapseOption);

      // Temporarily add listener to handle collapse
      elements.voiceSelect.addEventListener('change', handleCollapseInteraction);
  }

   // Handle collapsing other languages
  function handleCollapseInteraction(event) {
       if (event.target.options[event.target.selectedIndex].classList.contains('other-languages-collapse')) {
          // Re-populate with only Chinese voices and the 'show other' toggle
          populateVoiceList(allVoices.chinese, allVoices.other);
          // Remove this specific listener after collapsing
          elements.voiceSelect.removeEventListener('change', handleCollapseInteraction);
       }
  }


  // Generate speech
  async function generateSpeech() {
      if (!elements.voiceSelect.value) {
          showToast('warning', '请选择语音', '您需要先选择一个语音模型。');
          return;
      }
      const text = elements.textInput.value.trim();
      if (!text) {
          showToast('warning', '请输入文本', '合成内容不能为空。');
          return;
      }
      if (text.length > MAX_CHARS) {
          showToast('error', '文本过长', `文本超过最大长度 ${MAX_CHARS} 字符。`);
          return;
      }

      updateButtonState(elements.btnGenerate, true, '生成中...'); // Loading state

      const payload = {
          text: text,
          voice: elements.voiceSelect.value,
          format: getSelectedFormat(),
          rate: rateControl ? rateControl.slider.value : 0,
          volume: volumeControl ? volumeControl.slider.value : 0,
          pitch: pitchControl ? pitchControl.slider.value : 0
      };

      try {
          const response = await fetch(`${EDGE_API_BASE}/synthesize`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });

          if (!response.ok) {
               const errorData = await response.json().catch(() => ({ error: `合成失败: ${response.statusText}` }));
               throw new Error(errorData.error || `合成失败: ${response.status}`);
          }

          const data = await response.json();

          if (!data.audioUrl) {
              throw new Error('服务器未返回有效的音频URL');
          }

          // Construct filename for download
          const filename = `edge_${payload.voice}_${new Date().getTime()}.${data.format}`;
          player.loadAudio(data.audioUrl, filename); // Use player's load method

          showToast('success', '生成成功', '音频已生成并加载到播放器。');

      } catch (error) {
          console.error('生成语音失败:', error);
          showToast('error', '生成失败', `语音生成过程中出错: ${error.message}`);
           if (elements.downloadBtn) elements.downloadBtn.disabled = true; // Disable download on failure
      } finally {
          updateButtonState(elements.btnGenerate, false); // Restore button state
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
      if (elements.btnGetVoices) {
          elements.btnGetVoices.addEventListener('click', getVoices);
      }
      if (elements.btnGenerate) {
          elements.btnGenerate.addEventListener('click', generateSpeech);
      }
      if (elements.btnClear) {
          elements.btnClear.addEventListener('click', clearText);
      }
      if (elements.btnResetSettings) {
          elements.btnResetSettings.addEventListener('click', resetSettings);
      }
      if (elements.textInput) {
          // Use debounce to avoid saving on every single keypress
          elements.textInput.addEventListener('input', debounce(() => {
               updateCharCounter();
               saveSettings();
          }, 300));
      }
      // Sliders saving handled by common setup, just add saveSettings call
      if(rateControl) rateControl.slider.addEventListener('change', saveSettings); // Save on release
      if(volumeControl) volumeControl.slider.addEventListener('change', saveSettings);
      if(pitchControl) pitchControl.slider.addEventListener('change', saveSettings);

      if (elements.formatRadios) {
          elements.formatRadios.forEach(radio => radio.addEventListener('change', saveSettings));
      }
      if (elements.voiceSelect) {
          elements.voiceSelect.addEventListener('change', (event) => {
              if (event.target.options[event.target.selectedIndex].classList.contains('other-languages-toggle')) {
                   showOtherLanguages();
               } else if (event.target.value !== '') { // Don't save if 'Select Preset' or toggles are chosen
                   saveSettings();
               }
          });
      }
       // Preset listeners are handled by PresetManager initialization
       // Player listeners are handled by AudioPlayerController initialization
  }

  // ---- Initialization ----
  function init() {
      console.log("Initializing Edge TTS Studio...");
      initEventListeners();
      loadSettings(); // Load saved settings first
      getVoices(); // Then fetch voices (will try to restore selection)
      console.log("Initialization complete.");
  }

  init(); // Start the application
});