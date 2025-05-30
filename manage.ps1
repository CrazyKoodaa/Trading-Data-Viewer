param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("start", "stop", "restart", "status", "install", "remove", "dev", "prod", "logs")]
    [string]$Action = "help"
)

# Trading Viewer PowerShell Manager
$ServiceName = "TradingViewer"
$AppName = "Trading Data Viewer"

function Write-Header {
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Trading Data Viewer - PowerShell Manager" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
}

function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Start-DevServer {
    Write-Host "Starting Development Server..." -ForegroundColor Green
    
    # Activate virtual environment if it exists
    if (Test-Path "venv\Scripts\Activate.ps1") {
        Write-Host "Activating virtual environment..." -ForegroundColor Yellow
        try {
            # Use proper PowerShell execution
            & ".\venv\Scripts\Activate.ps1"
            Write-Host "Virtual environment activated successfully!" -ForegroundColor Green
        }
        catch {
            Write-Host "Warning: Could not activate virtual environment. Continuing..." -ForegroundColor Yellow
            Write-Host "You may need to run: Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser" -ForegroundColor Yellow
        }
    }
    
    Write-Host "Starting with Waitress (Windows-compatible server)..." -ForegroundColor Green
    Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
    Write-Host "Server will be available at: http://localhost:5000" -ForegroundColor Cyan
    
    # Use Waitress with direct parameters
    python -c "
from waitress import serve
from app import app

print('Starting Waitress server...')
serve(app, 
      host='127.0.0.1', 
      port=5000, 
      threads=4,
      connection_limit=1000,
      cleanup_interval=30,
      channel_timeout=120)
"
}

function Start-ProdServer {
    Write-Host "Starting Production Server..." -ForegroundColor Green
    
    # Activate virtual environment if it exists
    if (Test-Path "venv\Scripts\Activate.ps1") {
        Write-Host "Activating virtual environment..." -ForegroundColor Yellow
        try {
            # Use proper PowerShell execution
            & ".\venv\Scripts\Activate.ps1"
            Write-Host "Virtual environment activated successfully!" -ForegroundColor Green
        }
        catch {
            Write-Host "Warning: Could not activate virtual environment. Continuing..." -ForegroundColor Yellow
            Write-Host "You may need to run: Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser" -ForegroundColor Yellow
        }
    }
    
    Write-Host "Starting with Waitress (Production mode)..." -ForegroundColor Green
    Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
    Write-Host "Server will be available at: http://localhost:5000" -ForegroundColor Cyan
    
    # Use Waitress for production on Windows
    python -c "
from waitress import serve
from app import app

print('Starting Waitress server in production mode...')
serve(app, 
      host='0.0.0.0',
      port=5000, 
      threads=8,
      connection_limit=2000,
      cleanup_interval=30,
      channel_timeout=120,
      expose_tracebacks=False)
"
}

function Install-Service {
    if (-not (Test-Administrator)) {
        Write-Host "ERROR: Administrator privileges required!" -ForegroundColor Red
        Write-Host "Run PowerShell as Administrator and try again." -ForegroundColor Yellow
        return
    }
    
    Write-Host "Installing $AppName as Windows Service..." -ForegroundColor Green
    
    # Download NSSM if not exists
    if (-not (Test-Path "nssm.exe")) {
        Write-Host "Downloading NSSM..." -ForegroundColor Yellow
        try {
            Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile "nssm.zip"
            Expand-Archive -Path "nssm.zip" -DestinationPath "." -Force
            Copy-Item "nssm-2.24\win64\nssm.exe" "nssm.exe"
            Remove-Item "nssm-2.24" -Recurse -Force
            Remove-Item "nssm.zip"
            Write-Host "NSSM downloaded successfully!" -ForegroundColor Green
        }
        catch {
            Write-Host "Failed to download NSSM: $($_.Exception.Message)" -ForegroundColor Red
            return
        }
    }
    
    $currentDir = Get-Location
    $gunicornPath = Join-Path $currentDir "venv\Scripts\gunicorn.exe"
    
    # Create logs directory
    if (-not (Test-Path "logs")) {
        New-Item -ItemType Directory -Name "logs"
    }
    
    # Install service
    & .\nssm.exe install $ServiceName "python" "-c `"from waitress import serve; from app import app; serve(app, host='127.0.0.1', port=5000, threads=8)`""
    & .\nssm.exe set $ServiceName AppDirectory $currentDir
    & .\nssm.exe set $ServiceName DisplayName $AppName
    & .\nssm.exe set $ServiceName Description "$AppName Web Application"
    & .\nssm.exe set $ServiceName Start SERVICE_AUTO_START
    
    # Set up logging
    & .\nssm.exe set $ServiceName AppStdout "$currentDir\logs\output.log"
    & .\nssm.exe set $ServiceName AppStderr "$currentDir\logs\error.log"
    & .\nssm.exe set $ServiceName AppRotateFiles 1
    & .\nssm.exe set $ServiceName AppRotateOnline 1
    & .\nssm.exe set $ServiceName AppRotateSeconds 86400
    & .\nssm.exe set $ServiceName AppRotateBytes 1048576
    
    Write-Host "Service installed successfully!" -ForegroundColor Green
    Write-Host "Use 'manage.ps1 start' to start the service" -ForegroundColor Yellow
}

function Start-Service {
    Write-Host "Starting $AppName service..." -ForegroundColor Green
    Start-Service -Name $ServiceName -ErrorAction SilentlyContinue
    
    $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($service -and $service.Status -eq "Running") {
        Write-Host "Service started successfully!" -ForegroundColor Green
        Write-Host "Access the application at: http://localhost:5000" -ForegroundColor Cyan
    } else {
        Write-Host "Failed to start service. Check logs for details." -ForegroundColor Red
    }
}

function Stop-Service {
    Write-Host "Stopping $AppName service..." -ForegroundColor Yellow
    Stop-Service -Name $ServiceName -ErrorAction SilentlyContinue
    
    $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($service -and $service.Status -eq "Stopped") {
        Write-Host "Service stopped successfully!" -ForegroundColor Green
    } else {
        Write-Host "Failed to stop service or service was not running." -ForegroundColor Red
    }
}

function Restart-Service {
    Write-Host "Restarting $AppName service..." -ForegroundColor Yellow
    Restart-Service -Name $ServiceName -ErrorAction SilentlyContinue
    
    Start-Sleep -Seconds 3
    
    $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($service -and $service.Status -eq "Running") {
        Write-Host "Service restarted successfully!" -ForegroundColor Green
        Write-Host "Access the application at: http://localhost:5000" -ForegroundColor Cyan
    } else {
        Write-Host "Failed to restart service. Check logs for details." -ForegroundColor Red
    }
}

function Get-ServiceStatus {
    Write-Host "Checking $AppName service status..." -ForegroundColor Cyan
    
    $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($service) {
        Write-Host "Service Status: $($service.Status)" -ForegroundColor $(if ($service.Status -eq "Running") { "Green" } else { "Yellow" })
        Write-Host "Display Name: $($service.DisplayName)" -ForegroundColor Cyan
        Write-Host "Service Name: $($service.ServiceName)" -ForegroundColor Cyan
    } else {
        Write-Host "Service not installed." -ForegroundColor Red
    }
    
    # Show recent logs
    if (Test-Path "logs\output.log") {
        Write-Host "`n---- Recent Output Log ----" -ForegroundColor Cyan
        Get-Content "logs\output.log" -Tail 10
    }
    
    if (Test-Path "logs\error.log") {
        Write-Host "`n---- Recent Error Log ----" -ForegroundColor Red
        Get-Content "logs\error.log" -Tail 10
    }
}

function Remove-Service {
    if (-not (Test-Administrator)) {
        Write-Host "ERROR: Administrator privileges required!" -ForegroundColor Red
        return
    }
    
    Write-Host "Removing $AppName service..." -ForegroundColor Yellow
    
    # Stop service first
    Stop-Service -Name $ServiceName -ErrorAction SilentlyContinue
    
    # Remove service
    & .\nssm.exe remove $ServiceName confirm
    
    Write-Host "Service removed successfully!" -ForegroundColor Green
}

function Show-Logs {
    if (Test-Path "logs\output.log") {
        Write-Host "---- Output Log ----" -ForegroundColor Green
        Get-Content "logs\output.log" -Tail 50
    }
    
    if (Test-Path "logs\error.log") {
        Write-Host "`n---- Error Log ----" -ForegroundColor Red
        Get-Content "logs\error.log" -Tail 50
    }
    
    if (-not (Test-Path "logs\output.log") -and -not (Test-Path "logs\error.log")) {
        Write-Host "No log files found. Service may not be installed or hasn't run yet." -ForegroundColor Yellow
    }
}

function Show-Help {
    Write-Host "`nUsage: .\manage.ps1 [action]" -ForegroundColor Cyan
    Write-Host "`nAvailable actions:" -ForegroundColor Yellow
    Write-Host "  dev       - Start development server with auto-reload" -ForegroundColor White
    Write-Host "  prod      - Start production server" -ForegroundColor White
    Write-Host "  install   - Install as Windows service" -ForegroundColor White
    Write-Host "  start     - Start the Windows service" -ForegroundColor White
    Write-Host "  stop      - Stop the Windows service" -ForegroundColor White
    Write-Host "  restart   - Restart the Windows service" -ForegroundColor White
    Write-Host "  status    - Check service status and show logs" -ForegroundColor White
    Write-Host "  remove    - Remove the Windows service" -ForegroundColor White
    Write-Host "  logs      - Show recent log entries" -ForegroundColor White
    Write-Host "`nExamples:" -ForegroundColor Yellow
    Write-Host "  .\manage.ps1 dev" -ForegroundColor Gray
    Write-Host "  .\manage.ps1 install" -ForegroundColor Gray
    Write-Host "  .\manage.ps1 start" -ForegroundColor Gray
}

# Main execution
Write-Header

switch ($Action.ToLower()) {
    "dev" { Start-DevServer }
    "prod" { Start-ProdServer }
    "install" { Install-Service }
    "start" { Start-Service }
    "stop" { Stop-Service }
    "restart" { Restart-Service }
    "status" { Get-ServiceStatus }
    "remove" { Remove-Service }
    "logs" { Show-Logs }
    default { Show-Help }
}