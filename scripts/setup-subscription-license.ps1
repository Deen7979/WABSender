# Subscription License System - Quick Setup Script
# Run with: .\scripts\setup-subscription-license.ps1

param(
    [switch]$SkipDatabase,
    [switch]$SkipDependencies,
    [switch]$SkipBuild,
    [string]$Environment = "development"
)

$ErrorActionPreference = "Stop"

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Subscription License System Setup  " -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

$ROOT_DIR = (Get-Item -Path ".\").FullName

# Step 1: Check prerequisites
Write-Host "[ 1/7 ] Checking prerequisites..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "  [OK] Node.js: $nodeVersion" -ForegroundColor Green
    
    $npmVersion = npm --version
    Write-Host "  [OK] npm: $npmVersion" -ForegroundColor Green
    
    $psqlVersion = psql --version
    Write-Host "  [OK] PostgreSQL: $psqlVersion" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] Missing prerequisite: $_" -ForegroundColor Red
    exit 1
}

# Step 2: Install dependencies
if (-not $SkipDependencies) {
    Write-Host ""
    Write-Host "[ 2/7 ] Installing dependencies..." -ForegroundColor Yellow
    
    Write-Host "  -> API dependencies..." -ForegroundColor Gray
    Set-Location "$ROOT_DIR\services\api"
    npm install
    
    Write-Host "  -> Desktop dependencies..." -ForegroundColor Gray
    Set-Location "$ROOT_DIR\apps\desktop"
    npm install node-machine-id
    
    Write-Host "  [OK] Dependencies installed" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "[ 2/7 ] Skipping dependencies installation" -ForegroundColor Gray
}

# Step 3: Set up environment variables
Write-Host ""
Write-Host "[ 3/7 ] Configuring environment..." -ForegroundColor Yellow

$envFile = "$ROOT_DIR\services\api\.env"
if (Test-Path $envFile) {
    Write-Host "  -> .env file exists, checking required variables..." -ForegroundColor Gray
    $envContent = Get-Content $envFile -Raw
    
    $requiredVars = @("JWT_SECRET", "LICENSE_ENCRYPTION_KEY")
    $missingVars = @()
    
    foreach ($var in $requiredVars) {
        if ($envContent -notmatch "$var=") {
            $missingVars += $var
        }
    }
    
    if ($missingVars.Count -gt 0) {
        Write-Host "  [WARN] Missing environment variables:" -ForegroundColor Yellow
        foreach ($var in $missingVars) {
            Write-Host "    - $var" -ForegroundColor Red
        }
        
        Write-Host ""
        Write-Host "  Adding default values (CHANGE IN PRODUCTION!)..." -ForegroundColor Yellow
        
        $envAdditions = @"

# Subscription License Configuration (Added by setup script)
JWT_SECRET=CHANGE-THIS-IN-PRODUCTION-$(Get-Random)
JWT_REFRESH_SECRET=CHANGE-THIS-REFRESH-$(Get-Random)
LICENSE_ENCRYPTION_KEY=$(([System.Guid]::NewGuid().ToString() -replace '-','').Substring(0,32))
HEARTBEAT_INTERVAL_HOURS=24
OFFLINE_GRACE_PERIOD_DAYS=3
LICENSE_KEY_PREFIX=WAB
"@
        
        Add-Content -Path $envFile -Value $envAdditions
        Write-Host "  [OK] Environment variables added" -ForegroundColor Green
    } else {
        Write-Host "  [OK] All required variables present" -ForegroundColor Green
    }
} else {
    Write-Host "  [ERROR] .env file not found at: $envFile" -ForegroundColor Red
    Write-Host "  -> Creating default .env file..." -ForegroundColor Yellow
    
    $defaultEnv = @"
# WABSender API Environment Configuration
NODE_ENV=$Environment
PORT=3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/wabsender

# Subscription License Configuration
JWT_SECRET=CHANGE-THIS-IN-PRODUCTION-$(Get-Random)
JWT_REFRESH_SECRET=CHANGE-THIS-REFRESH-$(Get-Random)
LICENSE_ENCRYPTION_KEY=$(([System.Guid]::NewGuid().ToString() -replace '-','').Substring(0,32))
HEARTBEAT_INTERVAL_HOURS=24
OFFLINE_GRACE_PERIOD_DAYS=3
LICENSE_KEY_PREFIX=WAB

# WARNING: Update DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET before production use!
"@
    
    Set-Content -Path $envFile -Value $defaultEnv
    Write-Host "  [OK] .env file created" -ForegroundColor Green
}

# Step 4: Run database migration
if (-not $SkipDatabase) {
    Write-Host ""
    Write-Host "[ 4/7 ] Running database migration..." -ForegroundColor Yellow
    
    # Load DATABASE_URL from .env
    $envVars = Get-Content $envFile | Where-Object { $_ -match '=' -and $_ -notmatch '^#' }
    foreach ($line in $envVars) {
        if ($line -match 'DATABASE_URL=(.+)') {
            $dbUrl = $Matches[1]
        }
    }
    
    if (-not $dbUrl) {
        Write-Host "  [ERROR] DATABASE_URL not found in .env" -ForegroundColor Red
        Write-Host "    Please update .env with your database connection string" -ForegroundColor Yellow
    } else {
        Write-Host "  -> Creating backup..." -ForegroundColor Gray
        $backupFile = "$ROOT_DIR\backups\backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql"
        
        # Create backups directory if it doesn't exist
        $backupDir = "$ROOT_DIR\backups"
        if (-not (Test-Path $backupDir)) {
            New-Item -ItemType Directory -Path $backupDir | Out-Null
        }
        
        try {
            # Parse DATABASE_URL (postgresql://user:pass@host:port/dbname)
            if ($dbUrl -match 'postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)') {
                $dbUser = $Matches[1]
                $dbPass = $Matches[2]
                $dbHost = $Matches[3]
                $dbPort = $Matches[4]
                $dbName = $Matches[5]
                
                $env:PGPASSWORD = $dbPass
                
                Write-Host "  -> Backing up database: $dbName" -ForegroundColor Gray
                pg_dump -h $dbHost -p $dbPort -U $dbUser -d $dbName -f $backupFile 2>&1 | Out-Null
                
                if (Test-Path $backupFile) {
                    Write-Host "  [OK] Backup created: $backupFile" -ForegroundColor Green
                } else {
                    Write-Host "  [WARN] Backup failed, continuing anyway..." -ForegroundColor Yellow
                }
                
                Write-Host "  -> Running migration..." -ForegroundColor Gray
                $migrationFile = "$ROOT_DIR\services\api\src\db\migrations\004_subscription_license_system.sql"
                
                if (Test-Path $migrationFile) {
                    psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -f $migrationFile
                    
                    if ($LASTEXITCODE -eq 0) {
                        Write-Host "  [OK] Migration completed successfully" -ForegroundColor Green
                    } else {
                        Write-Host "  [ERROR] Migration failed with exit code: $LASTEXITCODE" -ForegroundColor Red
                        Write-Host "    Backup available at: $backupFile" -ForegroundColor Yellow
                        exit 1
                    }
                } else {
                    Write-Host "  [ERROR] Migration file not found: $migrationFile" -ForegroundColor Red
                    exit 1
                }
                
                Remove-Item env:PGPASSWORD
            } else {
                Write-Host "  [ERROR] Invalid DATABASE_URL format" -ForegroundColor Red
                Write-Host "    Expected: postgresql://user:pass@host:port/dbname" -ForegroundColor Yellow
            }
        } catch {
            Write-Host "  [ERROR] Database operation failed: $_" -ForegroundColor Red
            exit 1
        }
    }
} else {
    Write-Host ""
    Write-Host "[ 4/7 ] Skipping database migration" -ForegroundColor Gray
}

# Step 5: Build API
if (-not $SkipBuild) {
    Write-Host ""
    Write-Host "[ 5/7 ] Building API..." -ForegroundColor Yellow
    
    Set-Location "$ROOT_DIR\services\api"
    npm run build
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  [OK] API built successfully" -ForegroundColor Green
    } else {
        Write-Host "  [ERROR] API build failed" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host ""
    Write-Host "[ 5/7 ] Skipping API build" -ForegroundColor Gray
}

# Step 6: Build desktop app
if (-not $SkipBuild) {
    Write-Host ""
    Write-Host "[ 6/7 ] Building desktop app..." -ForegroundColor Yellow
    
    Set-Location "$ROOT_DIR\apps\desktop"
    npm run build
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  [OK] Desktop app built successfully" -ForegroundColor Green
    } else {
        Write-Host "  [ERROR] Desktop app build failed" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host ""
    Write-Host "[ 6/7 ] Skipping desktop build" -ForegroundColor Gray
}

# Step 7: Summary and next steps
Write-Host ""
Write-Host "[ 7/7 ] Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "           NEXT STEPS                 " -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Update production secrets in:" -ForegroundColor Yellow
Write-Host "   $envFile" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Register routes in API server:" -ForegroundColor Yellow
Write-Host "   services/api/src/index.ts" -ForegroundColor Gray
Write-Host "   -> import { subscriptionLicenseRouter } from './routes/subscription-license.routes.js';" -ForegroundColor Gray
Write-Host "   -> app.use('/subscription', subscriptionLicenseRouter);" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Integrate UI component:" -ForegroundColor Yellow
Write-Host "   apps/desktop/src/renderer/components/PlatformDashboard.tsx" -ForegroundColor Gray
Write-Host "   -> import { SubscriptionLicenseManagement } from './SubscriptionLicenseManagement';" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Integrate desktop license service:" -ForegroundColor Yellow
Write-Host "   apps/desktop/src/main/index.ts" -ForegroundColor Gray
Write-Host "   -> import { validateLicenseOnStartup, initializeHeartbeatScheduler } from './licenseService';" -ForegroundColor Gray
Write-Host ""
Write-Host "5. Test the system:" -ForegroundColor Yellow
Write-Host "   -> Start API: cd services/api; npm run dev" -ForegroundColor Gray
Write-Host "   -> Start desktop: cd apps/desktop; npm run dev" -ForegroundColor Gray
Write-Host "   -> Test license issuance, activation, renewal, revocation" -ForegroundColor Gray
Write-Host ""
Write-Host "6. Review documentation:" -ForegroundColor Yellow
Write-Host "   docs/planning/SUBSCRIPTION-LICENSE-INTEGRATION-GUIDE.md" -ForegroundColor Gray
Write-Host "   docs/planning/MIGRATION-STRATEGY-SUBSCRIPTION-LICENSE.md" -ForegroundColor Gray
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $ROOT_DIR
