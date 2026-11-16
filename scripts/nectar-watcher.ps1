param(
    [string]$CommandFile = "",
    [int]$PollIntervalMs = 1000
)

$ProgressPreference = "SilentlyContinue"
$ErrorActionPreference = "SilentlyContinue"

try {
    Add-Type -AssemblyName "System.Runtime.WindowsRuntime"
    [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media, ContentType = WindowsRuntime] | Out-Null
    $asyncOp = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
    $method = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq "AsTask" -and $_.IsGenericMethod } | Select-Object -First 1
    $mgrMethod = $method.MakeGenericMethod([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
    $propMethod = $method.MakeGenericMethod([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    $thumbnailMethod = $method.MakeGenericMethod([Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime])
    $task = $mgrMethod.Invoke($null, @($asyncOp))
    [void]$task.Wait(5000)
    $mgr = $task.Result
} catch {
    Write-Host '{"type":"error","message":"Failed to initialize WinRT GSMTC"}'
    exit 1
}

if ($null -eq $mgr) {
    Write-Host '{"type":"error","message":"GSMTC manager not available"}'
    exit 1
}

Write-Host '{"type":"ready"}'

$lastTrackKey = ""
$lastSentTime = 0

function Get-TrackArtwork($properties) {
    if (-not $properties.Thumbnail) { return "" }
    $stream = $null
    $reader = $null
    try {
        $openTask = $thumbnailMethod.Invoke($null, @($properties.Thumbnail.OpenReadAsync()))
        if (-not $openTask.Wait(1000)) { return "" }
        $stream = $openTask.Result
        if ($stream.Size -le 0 -or $stream.Size -gt 1500000) { return "" }
        if ($stream.ContentType -notin @('image/jpeg', 'image/png', 'image/webp')) { return "" }
        $reader = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream)
        $bytes = New-Object byte[] ([int]$stream.Size)
        $offset = 0
        while ($offset -lt $bytes.Length) {
            $count = $reader.Read($bytes, $offset, $bytes.Length - $offset)
            if ($count -le 0) { return "" }
            $offset += $count
        }
        return "data:$($stream.ContentType);base64,$([Convert]::ToBase64String($bytes))"
    } catch { return "" }
    finally {
        # WinRT may expose a COM wrapper without a callable Dispose method.
        # Cleanup must never suppress an otherwise valid playback update.
        if ($reader) { try { $reader.Dispose() } catch {} }
        if ($stream) { try { ([System.IDisposable]$stream).Dispose() } catch {} }
    }
}

while ($true) {
    try {
        if ($CommandFile -and (Test-Path -LiteralPath $CommandFile -PathType Container)) {
            foreach ($file in (Get-ChildItem -LiteralPath $CommandFile -Filter '*.json' -File | Sort-Object Name)) {
                $command = Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json
                Remove-Item -LiteralPath $file.FullName -Force
                if (([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - $command.timestamp) -gt 5000) { continue }
                $cmd = $command.action
                foreach ($s in $mgr.GetSessions()) {
                    if ($s.SourceAppUserModelId -like "*Nectar*") {
                        if ($cmd -eq "pause") { [void]$s.TryPauseAsync() }
                        elseif ($cmd -eq "play") { [void]$s.TryPlayAsync() }
                        elseif ($cmd -eq "play_pause") { [void]$s.TryTogglePlayPauseAsync() }
                        elseif ($cmd -eq "next") { [void]$s.TrySkipNextAsync() }
                        elseif ($cmd -eq "previous") { [void]$s.TrySkipPreviousAsync() }
                        break
                    }
                }
            }
        }

        $nectarSession = $null
        foreach ($s in $mgr.GetSessions()) {
            if ($s.SourceAppUserModelId -like "*Nectar*") {
                $nectarSession = $s
                break
            }
        }

        if ($nectarSession) {
            $pTask = $propMethod.Invoke($null, @($nectarSession.TryGetMediaPropertiesAsync()))
            [void]$pTask.Wait(1000)
            $props = $pTask.Result
            $playback = $nectarSession.GetPlaybackInfo()
            $timeline = $nectarSession.GetTimelineProperties()

            $rawTitle = if ($props) { $props.Title } else { "" }
            $rawArtist = if ($props) { $props.Artist } else { "" }
            $rawAlbum = if ($props) { $props.AlbumTitle } else { "" }
            $status = if ($playback) { $playback.PlaybackStatus.ToString() } else { "Closed" }
            $isPlaying = ($status -eq "Playing")

            $cleanArtist = $rawArtist
            $deviceInfo = "NectarLink Smartphone"
            if ($rawArtist -match '^(.+?)\s*[\xB7\u00B7\u2022]\s*(.+)$') {
                $cleanArtist = $matches[1].Trim()
                $deviceInfo = $matches[2].Trim()
            }

            $posSec = 0
            $durSec = 0
            if ($timeline) {
                $durSec = [Math]::Round($timeline.EndTime.TotalSeconds)
                $elapsed = 0
                if ($timeline.LastUpdatedTime) {
                    $elapsed = ([DateTimeOffset]::Now - $timeline.LastUpdatedTime).TotalSeconds
                }
                if ($isPlaying -and $elapsed -gt 0) {
                    $posSec = [Math]::Round($timeline.Position.TotalSeconds + $elapsed)
                } else {
                    $posSec = [Math]::Round($timeline.Position.TotalSeconds)
                }
                if ($durSec -gt 0 -and $posSec -gt $durSec) {
                    $posSec = $durSec
                }
            }

            $artworkUrl = Get-TrackArtwork $props
            # A song may change while its thumbnail is being read. Discard that sample.
            $verifyTask = $propMethod.Invoke($null, @($nectarSession.TryGetMediaPropertiesAsync()))
            if (-not $verifyTask.Wait(1000)) { continue }
            $verified = $verifyTask.Result
            if ($verified.Title -ne $rawTitle -or $verified.Artist -ne $rawArtist -or $verified.AlbumTitle -ne $rawAlbum) { continue }

            $state = @{
                type = "state"
                title = $rawTitle
                artist = $cleanArtist
                rawArtist = $rawArtist
                album = $rawAlbum
                albumArtUrl = $artworkUrl
                isPlaying = $isPlaying
                progressSeconds = $posSec
                durationSeconds = $durSec
                playerApp = $deviceInfo
            }
            $json = ($state | ConvertTo-Json -Compress)

            $trackKey = "$rawTitle|$cleanArtist|$isPlaying|$artworkUrl"
            $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
            $shouldSend = ($trackKey -ne $lastTrackKey) -or (($now - $lastSentTime) -gt 2500)

            if ($shouldSend) {
                Write-Host $json
                $lastTrackKey = $trackKey
                $lastSentTime = $now
            }
        } else {
            $discoKey = "DISCONNECTED"
            if ($lastTrackKey -ne $discoKey) {
                Write-Host '{"type":"disconnected"}'
                $lastTrackKey = $discoKey
            }
        }
    } catch {
        # Silent ignore transient COM failures
    }

    Start-Sleep -Milliseconds $PollIntervalMs
}
