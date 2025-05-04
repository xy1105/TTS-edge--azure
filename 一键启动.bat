@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

:: ---------------- 1. 检测/创建虚拟环境 ----------------
echo 🔥 正在检测虚拟环境...
if not exist "venv\" (
    echo 🚩 未检测到虚拟环境，开始创建...
    python -m venv venv
    echo ✨ 虚拟环境创建完成！
) else (
    echo ✅ 虚拟环境已存在。
)

:: ---------------- 2. 激活 venv ----------------
echo 🚀 正在激活虚拟环境...
call venv\Scripts\activate.bat

:: ---------------- 3. 升级 pip ----------------
echo 🆙 正在升级 pip...
python -m pip install --upgrade pip --quiet

:: ---------------- 4. 安装依赖 ----------------
:: 统一使用清华镜像，延长超时，关闭缓存以防 WinError 32
set PIP_INSTALL_CMD=pip install -r backend\requirements.txt ^
    -i https://pypi.tuna.tsinghua.edu.cn/simple ^
    --default-timeout 120 ^
    --no-cache-dir

echo 📦 正在安装依赖（使用清华镜像）...
%PIP_INSTALL_CMD%
if %errorlevel% neq 0 (
    echo ❌ 第一次安装失败，等待 5 秒后自动重试一次...
    timeout /t 5 >nul
    %PIP_INSTALL_CMD%
)

if %errorlevel% neq 0 (
    echo ❌ 依赖安装两次仍失败，请检查网络或临时关闭杀毒软件后重试。
    pause
    exit /b
)

:: ---------------- 5. 启动 Flask ----------------
echo 🎉 依赖安装成功，启动 Flask 项目中...
python backend\app.py

pause
endlocal
