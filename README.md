# Edge TTS Studio

这是一个基于Microsoft Edge TTS（文本转语音）技术的Web应用程序，可以轻松创建自然流畅的语音内容。

## 功能特点

- 支持多种语言和语音选择
- 调整语速、音量和音高
- 支持MP3和WAV格式输出
- 实时音频播放和下载
- 现代化UI设计和流畅动画效果

## 安装步骤

1. 克隆此仓库到本地

```bash
git clone https://github.com/yourusername/edge-tts-studio.git
cd edge-tts-studio
```

2. 安装依赖

```bash
pip install -r requirements.txt
```

3. 运行应用

```bash
python app.py
```

4. 在浏览器中访问 http://localhost:5000

## 使用方法

1. 点击"获取语音"按钮加载可用的语音列表
2. 选择你喜欢的语音
3. 在文本框中输入要转换的文本
4. 调整语速、音量和音高（可选）
5. 选择输出格式（MP3或WAV）
6. 点击"生成语音"按钮
7. 使用内置播放器播放生成的语音
8. 点击"下载"按钮保存语音文件

## 技术栈

- 前端: HTML, CSS, JavaScript
- 后端: Python, Flask
- TTS引擎: Microsoft Edge TTS (edge-tts)

## 注意事项

- 此应用仅用于学习和个人使用
- 请勿将其用于商业用途，除非你已获得相关许可
- 使用Microsoft Edge TTS服务时请遵守相关条款和规定