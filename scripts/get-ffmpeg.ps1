# scripts/get-ffmpeg.ps1
# Downloads FFmpeg essentials from gyan.dev and extracts ffmpeg.exe to /bin

$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Stop'

$url  = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
$dest = 'bin\ffmpeg_essentials.zip'
$tmp  = 'bin\_ffmpeg_tmp'

Write-Host '[YtoWave] Downloading FFmpeg essentials from gyan.dev...'
Write-Host "[YtoWave] URL: $url"

try {
    Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing -TimeoutSec 600
    $sizeMB = [math]::Round((Get-Item $dest).Length / 1MB, 1)
    Write-Host "[YtoWave] Downloaded: $sizeMB MB"

    Write-Host '[YtoWave] Extracting...'
    Expand-Archive -Path $dest -DestinationPath $tmp -Force

    $ffmpegBin = Get-ChildItem -Recurse -Path $tmp -Filter 'ffmpeg.exe' | Select-Object -First 1

    if ($ffmpegBin) {
        Copy-Item $ffmpegBin.FullName 'bin\ffmpeg.exe' -Force
        $ffmpegSizeMB = [math]::Round((Get-Item 'bin\ffmpeg.exe').Length / 1MB, 1)
        Write-Host "[YtoWave] ffmpeg.exe installed! ($ffmpegSizeMB MB)"
    } else {
        Write-Error 'ffmpeg.exe not found inside archive'
    }
} catch {
    Write-Host "[YtoWave] ERROR: $_"
    exit 1
} finally {
    if (Test-Path $tmp)  { Remove-Item $tmp  -Recurse -Force -ErrorAction SilentlyContinue }
    if (Test-Path $dest) { Remove-Item $dest -Force -ErrorAction SilentlyContinue }
}

Write-Host '[YtoWave] Done!'
