<#
    Registers a Windows scheduled task that takes a TokenWatt reading at
    midnight every day.

    The task aggregates the agent logs, writes the daily JSON files, upserts
    every day into Neon, and commits the changed files. It runs whether or not
    anyone is logged in, and catches up if the machine was asleep at midnight.

    Install:   powershell -ExecutionPolicy Bypass -File scripts\install-schedule.ps1
    Remove:    Unregister-ScheduledTask -TaskName TokenWatt -Confirm:$false
#>

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'node was not found on PATH.' }

$taskName = 'TokenWatt'
$runner   = Join-Path $root 'scripts\run-collector.cmd'

# A thin .cmd wrapper keeps the working directory correct and leaves a log
# behind, which is the only way to diagnose a task that ran at 00:00.
@"
@echo off
cd /d "$root"
echo. >> "$root\collector.log"
echo ==== %DATE% %TIME% ==== >> "$root\collector.log"
"$node" "$root\collector\collect.mjs" --push >> "$root\collector.log" 2>&1
"@ | Set-Content -Path $runner -Encoding ASCII

$action    = New-ScheduledTaskAction -Execute $runner
$trigger   = New-ScheduledTaskTrigger -Daily -At 00:00
$settings  = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopOnIdleEnd `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
    -MultipleInstances IgnoreNew `
    -RestartCount 2 `
    -RestartInterval (New-TimeSpan -Minutes 10)

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

Register-ScheduledTask `
    -TaskName $taskName `
    -Description 'Takes a daily TokenWatt reading from local agent logs.' `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -RunLevel Limited | Out-Null

Write-Host "Registered scheduled task '$taskName' — runs daily at 00:00."
Write-Host "Log: $root\collector.log"
Write-Host "Run it now with:  Start-ScheduledTask -TaskName $taskName"
