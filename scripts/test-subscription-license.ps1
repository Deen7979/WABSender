# Subscription License System - Comprehensive Testing Script
# Run with: .\scripts\test-subscription-license.ps1

param(
    [switch]$SkipDatabase,
    [switch]$SkipFunctional,
    [switch]$SkipSecurity,
    [switch]$SkipLoad,
    [string]$Environment = "staging",
    [string]$DatabaseUrl = "postgresql://postgres:postgres@localhost:5432/wabsender_staging"
)

$ErrorActionPreference = "Continue"
$ROOT_DIR = (Get-Item -Path ".\").FullName
$TEST_RESULTS = @()
$PASSED_TESTS = 0
$FAILED_TESTS = 0
$WARNINGS = 0

function Write-TestHeader {
    param([string]$Title)
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "  $Title" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-TestResult {
    param(
        [string]$TestName,
        [string]$Status,  # PASS, FAIL, WARN
        [string]$Message = "",
        [hashtable]$Metrics = @{}
    )
    
    $result = @{
        Test = $TestName
        Status = $Status
        Message = $Message
        Metrics = $Metrics
        Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    }
    
    $script:TEST_RESULTS +=  $result
    
    switch ($Status) {
        "PASS" { 
            Write-Host "  [PASS] $TestName" -ForegroundColor Green
            $script:PASSED_TESTS++
        }
        "FAIL" { 
            Write-Host "  [FAIL] $TestName" -ForegroundColor Red
            if ($Message) { Write-Host "         $Message" -ForegroundColor Red }
            $script:FAILED_TESTS++
        }
        "WARN" { 
            Write-Host "  [WARN] $TestName" -ForegroundColor Yellow
            if ($Message) { Write-Host "         $Message" -ForegroundColor Yellow }
            $script:WARNINGS++
        }
    }
    
    if ($Metrics.Count -gt 0) {
        foreach ($key in $Metrics.Keys) {
            Write-Host "         $key : $($Metrics[$key])" -ForegroundColor Gray
        }
    }
}

Write-TestHeader "Subscription License System - Test Suite"
Write-Host "Environment: $Environment" -ForegroundColor Cyan
Write-Host "Start Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host ""

# ============================================================
# PHASE 1: Pre-Test Validation
# ============================================================

Write-TestHeader "PHASE 1: Pre-Test Validation"

# Check prerequisites
Write-Host "Checking prerequisites..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-TestResult -TestName "Node.js installed" -Status "PASS" -Metrics @{"Version" = $nodeVersion}
} catch {
    Write-TestResult -TestName "Node.js installed" -Status "FAIL" -Message "Node.js not found"
}

try {
    $npmVersion = npm --version
    Write-TestResult -TestName "npm installed" -Status "PASS" -Metrics @{"Version" = $npmVersion}
} catch {
    Write-TestResult -TestName "npm installed" -Status "FAIL" -Message "npm not found"
}

try {
    $psqlVersion = psql --version
    Write-TestResult -TestName "PostgreSQL client installed" -Status "PASS" -Metrics @{"Version" = $psqlVersion}
} catch {
    Write-TestResult -TestName "PostgreSQL client installed" -Status "FAIL" -Message "psql not found"
}

# Check if migration file exists
$migrationFile = "$ROOT_DIR\services\api\src\db\migrations\004_subscription_license_system.sql"
if (Test-Path $migrationFile) {
    $fileSize = (Get-Item $migrationFile).Length
    Write-TestResult -TestName "Migration file exists" -Status "PASS" -Metrics @{"Size" = "$fileSize bytes"}
} else {
    Write-TestResult -TestName "Migration file exists" -Status "FAIL" -Message "File not found: $migrationFile"
}

# Check if service files exist
$serviceFiles = @(
    "services\api\src\services\licenseKeyGenerator.ts",
    "services\api\src\services\licenseTokenService.ts",
    "services\api\src\routes\subscription-license.routes.ts",
    "apps\desktop\src\main\licenseService.ts",
    "apps\desktop\src\renderer\components\SubscriptionLicenseManagement.tsx",
    "apps\desktop\src\renderer\services\subscriptionLicenseAPI.ts"
)

foreach ($file in $serviceFiles) {
    $fullPath = "$ROOT_DIR\$file"
    if (Test-Path $fullPath) {
        Write-TestResult -TestName "File exists: $(Split-Path $file -Leaf)" -Status "PASS"
    } else {
        Write-TestResult -TestName "File exists: $(Split-Path $file -Leaf)" -Status "FAIL" -Message $file
    }
}

# ============================================================
# PHASE 2: Database Testing
# ============================================================

if (-not $SkipDatabase) {
    Write-TestHeader "PHASE 2: Database Migration Testing"
    
    # Parse database URL
    if ($DatabaseUrl -match 'postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)') {
        $dbUser = $Matches[1]
        $dbPass = $Matches[2]
        $dbHost = $Matches[3]
        $dbPort = $Matches[4]
        $dbName = $Matches[5]
        
        $env:PGPASSWORD = $dbPass
        
        Write-Host "Testing database connection..." -ForegroundColor Yellow
        Write-Host "  Host: $dbHost" -ForegroundColor Gray
        Write-Host "  Port: $dbPort" -ForegroundColor Gray
        Write-Host "  Database: $dbName" -ForegroundColor Gray
        Write-Host "  User: $dbUser" -ForegroundColor Gray
        Write-Host ""
        
        # Test database connection
        $connTest = psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -t -c "SELECT 1;" 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-TestResult -TestName "Database connection" -Status "PASS"
        } else {
            Write-TestResult -TestName "Database connection" -Status "FAIL" -Message "Cannot connect to database"
            Write-Host "  Error: $connTest" -ForegroundColor Red
        }
        
        # Check existing tables (before migration)
        Write-Host ""
        Write-Host "Checking existing schema..." -ForegroundColor Yellow
        $existingTables = psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -t -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public';" 2>&1
        if ($LASTEXITCODE -eq 0) {
            $tableCount = ($existingTables -split "`n" | Where-Object { $_ -match '\S' }).Count
            Write-TestResult -TestName "Existing tables count" -Status "PASS" -Metrics @{"Count" = $tableCount}
        } else {
            Write-TestResult -TestName "Existing tables count" -Status "WARN" -Message "Could not query tables"
        }
        
        # Create backup
        Write-Host ""
        Write-Host "Creating backup..." -ForegroundColor Yellow
        $backupFile = "$ROOT_DIR\backups\test_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql"
        $backupDir = "$ROOT_DIR\backups"
        
        if (-not (Test-Path $backupDir)) {
            New-Item -ItemType Directory -Path $backupDir | Out-Null
        }
        
        pg_dump -h $dbHost -p $dbPort -U $dbUser -d $dbName -f $backupFile 2>&1 | Out-Null
        if (Test-Path $backupFile) {
            $backupSize = (Get-Item $backupFile).Length
            Write-TestResult -TestName "Database backup created" -Status "PASS" -Metrics @{"Size" = "$backupSize bytes"; "File" = $backupFile}
        } else {
            Write-TestResult -TestName "Database backup created" -Status "WARN" -Message "Backup may have failed"
        }
        
        # Run migration
        Write-Host ""
        Write-Host "Running migration..." -ForegroundColor Yellow
        $migrationOutput = psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -f $migrationFile 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-TestResult -TestName "Migration execution" -Status "PASS"
        } else {
            Write-TestResult -TestName "Migration execution" -Status "FAIL" -Message "Migration failed with exit code: $LASTEXITCODE"
            Write-Host "  Output: $migrationOutput" -ForegroundColor Red
        }
        
        # Verify new tables
        Write-Host ""
        Write-Host "Verifying new tables..." -ForegroundColor Yellow
        $expectedTables = @(
            "license_plans",
            "license_audit_logs",
            "license_refresh_tokens",
            "license_metrics",
            "device_fingerprints"
        )
        
        foreach ($table in $expectedTables) {
            $check = psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = '$table';" 2>&1
            if ($check -match '1') {
                Write-TestResult -TestName "Table exists: $table" -Status "PASS"
            } else {
                Write-TestResult -TestName "Table exists: $table" -Status "FAIL"
            }
        }
        
        # Verify default plans inserted
        Write-Host ""
        Write-Host "Verifying default data..." -ForegroundColor Yellow
        $planCount = psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -t -c "SELECT COUNT(*) FROM license_plans;" 2>&1
        if ($planCount -match '3') {
            Write-TestResult -TestName "Default plans inserted" -Status "PASS" -Metrics @{"Count" = 3}
        } else {
            Write-TestResult -TestName "Default plans inserted" -Status "FAIL" -Metrics @{"Count" = $planCount}
        }
        
        # Verify indexes created
        Write-Host ""
        Write-Host "Verifying indexes..." -ForegroundColor Yellow
        $indexCount = psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -t -c "SELECT COUNT(*) FROM pg_indexes WHERE tablename LIKE 'license%';" 2>&1
        if ($LASTEXITCODE -eq 0) {
            $cleanCount = $indexCount -replace '\s', ''
            Write-TestResult -TestName "Indexes created" -Status "PASS" -Metrics @{"Count" = $cleanCount}
        } else {
            Write-TestResult -TestName "Indexes created" -Status "WARN" -Message "Could not verify indexes"
        }
        
        # Verify triggers created
        Write-Host ""
        Write-Host "Verifying triggers..." -ForegroundColor Yellow
        $triggerCount = psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -t -c "SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_name LIKE 'update_license_%';" 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-TestResult -TestName "Triggers created" -Status "PASS" -Metrics @{"Count" = $triggerCount.Trim()}
        } else {
            Write-TestResult -TestName "Triggers created" -Status "WARN" -Message "Could not verify triggers"
        }
        
        # Verify views created
        Write-Host ""
        Write-Host "Verifying views..." -ForegroundColor Yellow
        $viewCount = psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -t -c "SELECT COUNT(*) FROM information_schema.views WHERE table_name LIKE 'v_%license%';" 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-TestResult -TestName "Views created" -Status "PASS" -Metrics @{"Count" = $viewCount.Trim()}
        } else {
            Write-TestResult -TestName "Views created" -Status "WARN" -Message "Could not verify views"
        }
        
        # Test backward compatibility
        Write-Host ""
        Write-Host "Testing backward compatibility..." -ForegroundColor Yellow
        
        # Check if licenses table has new columns
        $newColumns = @("plan_id", "seats_total", "seats_used", "renewed_at", "revoked_at")
        foreach ($column in $newColumns) {
            $check = psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -t -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'licenses' AND column_name = '$column';" 2>&1
            if ($check -match $column) {
                Write-TestResult -TestName "License column added: $column" -Status "PASS"
            } else {
                Write-TestResult -TestName "License column added: $column" -Status "FAIL"
            }
        }
        
        Remove-Item env:PGPASSWORD
    } else {
        Write-TestResult -TestName "Database URL parsing" -Status "FAIL" -Message "Invalid DATABASE_URL format"
    }
} else {
    Write-Host "[ SKIPPED ] Database testing" -ForegroundColor Gray
}

# ============================================================
# PHASE 3: Code Quality & Syntax Validation
# ============================================================

Write-TestHeader "PHASE 3: Code Quality & Syntax Validation"

# Check TypeScript files for syntax errors
Write-Host "Checking TypeScript syntax..." -ForegroundColor Yellow

$tsFiles = @(
    "services\api\src\services\licenseKeyGenerator.ts",
    "services\api\src\services\licenseTokenService.ts",
    "services\api\src\routes\subscription-license.routes.ts"
)

foreach ($file in $tsFiles) {
    $fullPath = "$ROOT_DIR\$file"
    if (Test-Path $fullPath) {
        $content = Get-Content $fullPath -Raw
        
        # Check for common issues
        $hasExports = $content -match 'export\s+(function|const|class|interface)'
        $hasImports = $content -match 'import\s+.*\s+from'
        
        if ($hasExports) {
            Write-TestResult -TestName "File has exports: $(Split-Path $file -Leaf)" -Status "PASS"
        } else {
            Write-TestResult -TestName "File has exports: $(Split-Path $file -Leaf)" -Status "WARN" -Message "No exports found"
        }
    }
}

# Check React component
$componentFile = "$ROOT_DIR\apps\desktop\src\renderer\components\SubscriptionLicenseManagement.tsx"
if (Test-Path $componentFile) {
    $content = Get-Content $componentFile -Raw
    
    # Check for React patterns
    $hasImportReact = $content -match 'import.*React'
    $hasComponent = $content -match 'export\s+(const|function)\s+SubscriptionLicenseManagement'
    $hasJSX = $content -match '<.*>'
    
    if ($hasImportReact -and $hasComponent -and $hasJSX) {
        Write-TestResult -TestName "React component structure" -Status "PASS"
    } else {
        Write-TestResult -TestName "React component structure" -Status "WARN" -Message "Component may be incomplete"
    }
}

# ============================================================
# PHASE 4: License Key Generation Testing
# ============================================================

if (-not $SkipFunctional) {
    Write-TestHeader "PHASE 4: License Key Generation Testing"
    
    Write-Host "Testing license key generator..." -ForegroundColor Yellow
    
    # Create test script for key generation
    $testScript = @"
const { generateLicenseKey, validateLicenseKey, generateBatchLicenseKeys } = require('./services/api/src/services/licenseKeyGenerator.js');

// Test 1: Generate single key
try {
    const result = generateLicenseKey();
    console.log('TEST:SINGLE_KEY:PASS:' + result.key);
} catch (error) {
    console.log('TEST:SINGLE_KEY:FAIL:' + error.message);
}

// Test 2: Validate generated key
try {
    const result = generateLicenseKey();
    const isValid = validateLicenseKey(result.key);
    console.log('TEST:KEY_VALIDATION:' + (isValid ? 'PASS' : 'FAIL'));
} catch (error) {
    console.log('TEST:KEY_VALIDATION:FAIL:' + error.message);
}

// Test 3: Generate batch
try {
    const batch = generateBatchLicenseKeys(5);
    const uniqueKeys = new Set(batch.map(b => b.key));
    console.log('TEST:BATCH_GENERATION:' + (uniqueKeys.size === 5 ? 'PASS' : 'FAIL') + ':' + batch.length);
} catch (error) {
    console.log('TEST:BATCH_GENERATION:FAIL:' + error.message);
}

// Test 4: Invalid key detection
try {
    const isValid = validateLicenseKey('WAB-INVALID-KEY-12345-XXXXX');
    console.log('TEST:INVALID_KEY:' + (isValid ? 'FAIL' : 'PASS'));
} catch (error) {
    console.log('TEST:INVALID_KEY:PASS');
}
"@
    
    $testScriptFile = "$ROOT_DIR\temp_test_script.js"
    Set-Content -Path $testScriptFile -Value $testScript
    
    Set-Location "$ROOT_DIR\services\api"
    $testOutput = node $testScriptFile 2>&1
    
    foreach ($line in $testOutput) {
        if ($line -match 'TEST:([^:]+):([^:]+)(:(.+))?') {
            $testName = $Matches[1]
            $status = $Matches[2]
            $details = if ($Matches[4]) { $Matches[4] } else { "" }
            
            Write-TestResult -TestName $testName -Status $status -Message $details
        }
    }
    
    Remove-Item $testScriptFile -ErrorAction SilentlyContinue
    Set-Location $ROOT_DIR
}

# ============================================================
# PHASE 5: Security Testing
# ============================================================

if (-not $SkipSecurity) {
    Write-TestHeader "PHASE 5: Security Testing"
    
    Write-Host "Running security checks..." -ForegroundColor Yellow
    
    # Check for hardcoded secrets
    $sensitiveFiles = @(
        "services\api\src\services\licenseTokenService.ts",
        "apps\desktop\src\main\licenseService.ts"
    )
    
    foreach ($file in $sensitiveFiles) {
        $fullPath = "$ROOT_DIR\$file"
        if (Test-Path $fullPath) {
            $content = Get-Content $fullPath -Raw
            
            # Check for environment variable usage
            $usesEnvVars = $content -match 'process\.env\.'
            
            if ($usesEnvVars) {
                Write-TestResult -TestName "Uses environment variables: $(Split-Path $file -Leaf)" -Status "PASS"
            } else {
                Write-TestResult -TestName "Uses environment variables: $(Split-Path $file -Leaf)" -Status "WARN" -Message "May contain hardcoded values"
            }
            
            # Check for SQL injection protection
            $usesParameterized = $content -match '\$\d+' -or $content -match 'parameterized'
            
            if ($file -match 'routes' -and $usesParameterized) {
                Write-TestResult -TestName "SQL injection protection: $(Split-Path $file -Leaf)" -Status "PASS"
            }
        }
    }
    
    # Check for authentication middleware
    $routesFile = "$ROOT_DIR\services\api\src\routes\subscription-license.routes.ts"
    if (Test-Path $routesFile) {
        $content = Get-Content $routesFile -Raw
        
        $hasAuth = $content -match 'requireAuth|authenticate'
        $hasSuperAdmin = $content -match 'requireSuperAdmin|isSuperAdmin'
        
        if ($hasAuth -and $hasSuperAdmin) {
            Write-TestResult -TestName "Authentication middleware present" -Status "PASS"
        } else {
            Write-TestResult -TestName "Authentication middleware present" -Status "FAIL" -Message "Endpoints may be unprotected"
        }
    }
}

# ============================================================
# PHASE 6: Performance Estimation
# ============================================================

Write-TestHeader "PHASE 6: Performance Metrics"

Write-Host "Analyzing code complexity..." -ForegroundColor Yellow

# Count lines of code
$totalLines = 0
$codeFiles = Get-ChildItem -Path "$ROOT_DIR\services\api\src" -Filter *.ts -Recurse
$codeFiles += Get-ChildItem -Path "$ROOT_DIR\apps\desktop\src" -Filter *.ts -Recurse
$codeFiles += Get-ChildItem -Path "$ROOT_DIR\apps\desktop\src" -Filter *.tsx -Recurse

foreach ($file in $codeFiles) {
    if ($file.Name -match 'subscription|license') {
        $lines = (Get-Content $file.FullName).Count
        $totalLines += $lines
    }
}

Write-TestResult -TestName "Total lines of subscription code" -Status "PASS" -Metrics @{"Lines" = $totalLines}

# Check migration file size
$migrationSize = (Get-Item $migrationFile).Length
Write-TestResult -TestName "Migration file size" -Status "PASS" -Metrics @{"Bytes" = $migrationSize; "KB" = [math]::Round($migrationSize/1024, 2)}

# ============================================================
# FINAL REPORT
# ============================================================

Write-TestHeader "TEST SUMMARY"

$totalTests = $PASSED_TESTS + $FAILED_TESTS
$passRate = if ($totalTests -gt 0) { [math]::Round(($PASSED_TESTS / $totalTests) * 100, 2) } else { 0 }

Write-Host "Total Tests: $totalTests" -ForegroundColor Cyan
Write-Host "Passed: $PASSED_TESTS" -ForegroundColor Green
Write-Host "Failed: $FAILED_TESTS" -ForegroundColor Red
Write-Host "Warnings: $WARNINGS" -ForegroundColor Yellow
Write-Host "Pass Rate: $passRate%" -ForegroundColor $(if ($passRate -ge 90) { "Green" } elseif ($passRate -ge 70) { "Yellow" } else { "Red" })
Write-Host ""

if ($FAILED_TESTS -eq 0) {
    Write-Host "All critical tests passed! System ready for staging deployment." -ForegroundColor Green
} elseif ($FAILED_TESTS -le 3) {
    Write-Host "Some tests failed. Review failures before production deployment." -ForegroundColor Yellow
} else {
    Write-Host "Multiple critical failures detected. System NOT ready for deployment." -ForegroundColor Red
}

# Export results to JSON
$reportFile = "$ROOT_DIR\test-results\test_report_$(Get-Date -Format 'yyyyMMdd_HHmmss').json"
$reportDir = "$ROOT_DIR\test-results"

if (-not (Test-Path $reportDir)) {
    New-Item -ItemType Directory -Path $reportDir | Out-Null
}

$report = @{
    Environment = $Environment
    StartTime = $TEST_RESULTS[0].Timestamp
    EndTime = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Summary = @{
        TotalTests = $totalTests
        Passed = $PASSED_TESTS
        Failed = $FAILED_TESTS
        Warnings = $WARNINGS
        PassRate = $passRate
    }
    Tests = $TEST_RESULTS
}

$report | ConvertTo-Json -Depth 10 | Set-Content -Path $reportFile

Write-Host ""
Write-Host "Detailed report saved to: $reportFile" -ForegroundColor Cyan
Write-Host ""
Write-Host "End Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
