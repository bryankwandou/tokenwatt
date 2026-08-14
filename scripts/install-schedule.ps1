# Registers a Windows scheduled task that takes a TokenWatt reading at midnight
# every day: aggregate the agent logs, write the daily JSON files, upsert every
# day into Neon, then commit the changes.
#
# Install:  powershell -ExecutionPolicy Bypass -File scripts\install-schedule.ps1
# Remove:   Unregister-ScheduledTask -TaskName TokenWatt -Confirm:$false
# Run now:  Start-ScheduledTask -TaskName TokenWatt

$ErrorActionPreference = 'Stop'

$root     = Split-Path -Parent $PSScriptRoot
$runner   = Join-Path $PSScriptRoot 'run-collector.cmd'
$taskName = 'TokenWatt'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'node was not found on PATH.'
}
if (-not (Test-Path $runner)) {
    throw "Missing runner script: $runner"
}

$action   = New-ScheduledTaskAction -Execute $runner -WorkingDirectory $root
$trigger  = New-ScheduledTaskTrigger -Daily -At 00:00

# StartWhenAvailable catches up if the machine was asleep at midnight, which is
# the common case for a desktop.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2) -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 10)

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -RunLevel Limited -Description 'Takes a daily TokenWatt reading from local agent logs.' | Out-Null

Write-Host "Registered '$taskName'. Runs daily at 00:00."
Write-Host "Log file: $root\collector.log"
