// frontend/js/common.js  — v0.1 简化版
// 1) docReady：DOM 加载完再执行回调
window.docReady = function (fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
};

// 2) debounce：防抖
window.debounce = function (func, wait = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => func.apply(this, args), wait);
  };
};

// 3) updateButtonState：按钮加载态
window.updateButtonState = function (btn, loading, loadingText = '加载中…') {
  if (!btn) return;
  if (loading) {
    btn.dataset.originText = btn.innerHTML;
    btn.innerHTML = loadingText;
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.originText || btn.innerHTML;
    btn.disabled = false;
  }
};

// 4) setupSlider：初始化滑块并返回便捷接口
window.setupSlider = function (sliderId, displayId, suffix = '') {
  const slider = document.getElementById(sliderId);
  const display = document.getElementById(displayId);
  if (!slider || !display) return null;
  const updateDisplay = () => (display.textContent = slider.value + suffix);
  slider.addEventListener('input', updateDisplay);
  updateDisplay();
  return { slider, display, updateDisplay };
};

// *示例* showToast：这里只给个简单 alert 占位，后续可替换成你自己的 Toast 组件
window.showToast = function (type, title, msg) {
  console.log(`[${type}] ${title}: ${msg}`);
  // 你可以接入现有的 UI 库，如 Toastify / Notyf 等
};
/* ============  Minimal AudioPlayerController  ============ */
class AudioPlayerController {
  constructor(cfg) {
    // 记录常用元素
    this.audio = document.getElementById(cfg.audioElementId);
    this.playBtn = document.getElementById(cfg.playPauseBtnId);
    this.playIcon = document.getElementById(cfg.playIconId);
    this.progressContainer = document.getElementById(cfg.progressContainerId);
    this.progressBar = document.getElementById(cfg.progressBarId);
    this.progressHandle = document.getElementById(cfg.progressHandleId);
    this.currentTimeDisplay = document.getElementById(cfg.currentTimeDisplayId);
    this.totalTimeDisplay = document.getElementById(cfg.totalTimeDisplayId);
    this.downloadBtn = document.getElementById(cfg.downloadBtnId);
    this.speedBtns = [...document.querySelectorAll(cfg.speedBtnsSelector || ".speed-btn")];

    // 绑定事件
    this.playBtn?.addEventListener("click", () => this.togglePlay());
    this.audio?.addEventListener("timeupdate", () => this.updateProgress());
    this.progressContainer?.addEventListener("click",  e => this.seek(e));
    this.speedBtns.forEach(btn =>
        btn.addEventListener("click", () => this.setPlaybackSpeed(+btn.dataset.speed))
    );
  }

  /* ---------- 公共方法，供外部脚本调用 ---------- */
  loadAudio(url, filename = "speech.mp3") {
    if (!this.audio) return;
    this.audio.src = url;
    this.audio.load();
    // 启用下载按钮
    if (this.downloadBtn) {
      this.downloadBtn.disabled = false;
      this.downloadBtn.onclick = () => {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
      };
    }
  }
  setPlaybackSpeed(rate = 1) {
    if (this.audio) this.audio.playbackRate = rate;
    this.speedBtns.forEach(b => b.classList.toggle("active", +b.dataset.speed === rate));
  }
  getPlaybackRate() { return this.audio?.playbackRate || 1; }

  /* ---------- 内部逻辑 ---------- */
  togglePlay() {
    if (!this.audio) return;
    if (this.audio.paused) { this.audio.play(); this.updatePlayIcon(true); }
    else { this.audio.pause(); this.updatePlayIcon(false); }
  }
  updatePlayIcon(isPlaying) {
    if (!this.playIcon) return;
    this.playIcon.className = isPlaying ? "fas fa-pause" : "fas fa-play";
  }
  updateProgress() {
    if (!this.audio || !this.progressBar) return;
    const {currentTime, duration} = this.audio;
    const percent = duration ? (currentTime / duration) * 100 : 0;
    this.progressBar.style.width = percent + "%";
    if (this.progressHandle) this.progressHandle.style.left = percent + "%";
    if (this.currentTimeDisplay) this.currentTimeDisplay.textContent = this.format(currentTime);
    if (this.totalTimeDisplay) this.totalTimeDisplay.textContent = this.format(duration);
  }
  seek(evt) {
    if (!this.audio) return;
    const rect = this.progressContainer.getBoundingClientRect();
    const ratio = (evt.clientX - rect.left) / rect.width;
    this.audio.currentTime = ratio * (this.audio.duration || 0);
  }
  format(sec = 0) {
    if (!isFinite(sec)) return "00:00";
    const m = Math.floor(sec / 60).toString().padStart(2,"0");
    const s = Math.floor(sec % 60).toString().padStart(2,"0");
    return `${m}:${s}`;
  }
}

/* ============  Very‑Lite PresetManager (占位)  ============ */
class PresetManager {
  constructor() { /* 先占位，避免 ReferenceError；日后再补全 */ }
}

