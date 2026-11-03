# Registers a Windows scheduled task that takes a TokenWatt reading at sign-in and
# every hour: aggregate the agent logs, write the daily JSON files, upsert every
# day into Neon, then commit the changes.
#
# Install:  powershell -ExecutionPolicy Bypass -File scripts\install-schedule.ps1
# Remove:   Unregister-ScheduledTask -TaskName TokenWatt -Confirm:$false
# Run now:  Start-ScheduledTask -TaskName TokenWatt

$ErrorActionPreference = 'Stop'

$root     = Split-Path -Parent $PSScriptRoot
$runner   = Join-Path $PSScriptRoot 'run-hidden.vbs'
$taskName = 'TokenWatt'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'node was not found on PATH.'
}
if (-not (Test-Path $runner)) {
    throw "Missing runner script: $runner"
}

# Do not swap this for `conhost --headless`: with a space in the path it exits 0
# without running anything, and the scheduler reports success.
$action   = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "//B //NoLogo `"$runner`"" -WorkingDirectory $root
$hourly   = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Hours 1)
$logon    = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN$env:USERNAME"
$logon.Delay = 'PT2M'

# StartWhenAvailable catches up on a run missed while the machine was off.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2) -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 10)

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($hourly, $logon) -Settings $settings -RunLevel Limited -Description 'Takes an hourly TokenWatt reading from local agent logs.' | Out-Null

Write-Host "Registered '$taskName'. Runs at sign-in and hourly."
Write-Host "Log file: $root\collector.log"
