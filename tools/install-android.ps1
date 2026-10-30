# Ставит APK по кабелю и сразу выдаёт доступы, которые Android не даёт включить
# руками для приложений не из Play Store (доступ к уведомлениям для музыки и т.д.).
#
# .\tools\install-android.ps1
# .\tools\install-android.ps1 -Apk D:\path\app-debug.apk

param(
    [string]$Apk = "C:\Users\galoz\trainy-apk\android\app\build\outputs\apk\debug\app-debug.apk"
)

$ErrorActionPreference = "Stop"
$package = "com.trainy.app"

$adb = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path $adb)) { $adb = "adb" }

$devices = & $adb devices | Select-String "\tdevice$"
if (-not $devices) {
    Write-Host "Телефон не виден. Включи 'Отладка по USB', подключи кабель и подтверди запрос на телефоне." -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path $Apk)) {
    Write-Host "Нет файла $Apk - сначала собери APK (см. ANDROID.md)." -ForegroundColor Yellow
    exit 1
}

& $adb install -r $Apk
if ($LASTEXITCODE -ne 0) {
    Write-Host "Установка не прошла. На Xiaomi включи 'Установка через USB' в настройках разработчика." -ForegroundColor Yellow
    exit 1
}

& $adb shell appops set $package ACCESS_RESTRICTED_SETTINGS allow
& $adb shell cmd notification allow_listener "$package/$package.TrainyMediaListener"
& $adb shell pm grant $package android.permission.POST_NOTIFICATIONS

$listeners = & $adb shell settings get secure enabled_notification_listeners
if ($listeners -match "$package/") {
    Write-Host "Готово: доступ к уведомлениям выдан, музыкой можно управлять из приложения." -ForegroundColor Green
} else {
    Write-Host "Доступ к уведомлениям не встал. На Xiaomi включи 'Отладка по USB (настройки безопасности)' и запусти скрипт ещё раз." -ForegroundColor Yellow
}
