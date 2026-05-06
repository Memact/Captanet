param(
  [int]$MaxElements = 160
)

$ErrorActionPreference = "SilentlyContinue"

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class MemactWin32 {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Auto)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

  [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Auto)]
  public static extern int GetWindowTextLength(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@

function Normalize-Text([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return "" }
  return (($Value -replace "\s+", " ").Trim())
}

function Get-WindowTitle([IntPtr]$Handle) {
  $length = [MemactWin32]::GetWindowTextLength($Handle)
  $builder = New-Object System.Text.StringBuilder ([Math]::Max($length + 1, 256))
  [void][MemactWin32]::GetWindowText($Handle, $builder, $builder.Capacity)
  return Normalize-Text $builder.ToString()
}

function Get-WindowProcessId([IntPtr]$Handle) {
  [uint32]$pid = 0
  [void][MemactWin32]::GetWindowThreadProcessId($Handle, [ref]$pid)
  return [int]$pid
}

function Find-TopVisibleWindow {
  $windows = New-Object System.Collections.Generic.List[object]
  $callback = [MemactWin32+EnumWindowsProc]{
    param([IntPtr]$Handle, [IntPtr]$Param)
    if (-not [MemactWin32]::IsWindowVisible($Handle)) { return $true }
    $title = Get-WindowTitle $Handle
    if ($title.Length -lt 2) { return $true }
    $pid = Get-WindowProcessId $Handle
    if ($pid -le 0) { return $true }
    $windows.Add([pscustomobject]@{
      Handle = $Handle
      Title = $title
      ProcessId = $pid
    })
    return $true
  }
  [void][MemactWin32]::EnumWindows($callback, [IntPtr]::Zero)
  return $windows | Select-Object -First 1
}

$hwnd = [MemactWin32]::GetForegroundWindow()
$windowTitle = Get-WindowTitle $hwnd

$processId = Get-WindowProcessId $hwnd
if ($processId -le 0 -or $windowTitle.Length -lt 2) {
  $fallbackWindow = Find-TopVisibleWindow
  if ($fallbackWindow -ne $null) {
    $hwnd = $fallbackWindow.Handle
    $processId = [int]$fallbackWindow.ProcessId
    $windowTitle = Normalize-Text $fallbackWindow.Title
  }
}

if ($processId -le 0 -or $windowTitle.Length -lt 2) {
  try {
    $fallbackProcess = Get-Process |
      Where-Object { $_.MainWindowTitle -and $_.MainWindowTitle.Trim().Length -gt 1 } |
      Sort-Object StartTime -Descending |
      Select-Object -First 1
    if ($fallbackProcess -ne $null) {
      $hwnd = $fallbackProcess.MainWindowHandle
      $processId = [int]$fallbackProcess.Id
      $windowTitle = Normalize-Text $fallbackProcess.MainWindowTitle
    }
  } catch {}
}

$process = $null
try {
  $process = Get-Process -Id $processId
} catch {}

$uiText = New-Object System.Collections.Generic.List[string]
$methods = New-Object System.Collections.Generic.List[string]
$methods.Add("foreground_window")

try {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  $root = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
  if ($root -ne $null) {
    $methods.Add("windows_ui_automation")
    $condition = [System.Windows.Automation.Condition]::TrueCondition
    $elements = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
    $count = [Math]::Min($elements.Count, $MaxElements)
    for ($i = 0; $i -lt $count; $i++) {
      $element = $elements.Item($i)
      if ($element -eq $null) { continue }
      $name = Normalize-Text $element.Current.Name
      if ($name.Length -ge 3 -and $name.Length -le 220 -and -not $uiText.Contains($name)) {
        $uiText.Add($name)
      }
      if ($uiText.Count -ge $MaxElements) { break }
    }
  }
} catch {}

$result = [ordered]@{
  platform = "win32"
  captured_at = (Get-Date).ToUniversalTime().ToString("o")
  application = $(if ($process) { Normalize-Text $process.ProcessName } else { "" })
  process_name = $(if ($process) { Normalize-Text $process.ProcessName } else { "" })
  process_id = [int]$processId
  window_title = $windowTitle
  ui_text = @($uiText)
  capture_methods = @($methods)
}

$result | ConvertTo-Json -Depth 6 -Compress
