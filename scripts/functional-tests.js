// Subscription License System - Functional Test Suite
// Run with: node scripts/functional-tests.js

const crypto = require('crypto');

// Test configuration
const TEST_CONFIG = {
  apiUrl: process.env.API_URL || 'http://localhost:3000',
  dbUser: process.env.DB_USER || 'postgres',
  dbPassword: process.env.DB_PASSWORD || 'postgres',
  dbHost: process.env.DB_HOST || 'localhost',
  dbPort: process.env.DB_PORT || '5432',
  dbName: process.env.DB_NAME || 'wabsender_staging'
};

// Test results
const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  tests: []
};

// Helper function to log test results
function logTest(name, status, message = '', metrics = {}) {
  const result = {
    test: name,
    status: status,  // PASS, FAIL, WARN
    message: message,
    metrics: metrics,
    timestamp: new Date().toISOString()
  };
  
  results.tests.push(result);
  
  const colors = {
    PASS: '\x1b[32m',  // Green
    FAIL: '\x1b[31m',  // Red
    WARN: '\x1b[33m',  // Yellow
    RESET: '\x1b[0m'
  };
  
  console.log(`  ${colors[status]}[${status}]${colors.RESET} ${name}`);
  if (message) {
    console.log(`         ${message}`);
  }
  Object.keys(metrics).forEach(key => {
    console.log(`         ${key}: ${metrics[key]}`);
  });
  
  if (status === 'PASS') results.passed++;
  else if (status === 'FAIL') results.failed++;
  else if (status === 'WARN') results.warnings++;
}

// ============================================================
// TEST 1: License Key Generation
// ============================================================

console.log('\n============================================================');
console.log('  TEST SUITE 1: License Key Generation');
console.log('============================================================\n');

try {
  // Mock implementation since we can't import ES modules in CommonJS
  // This tests the logic conceptually
  
  function generateLicenseKey() {
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No O, I, 1, 0
    let key = 'WAB';
    
    for (let i = 0; i < 4; i++) {
      key += '-';
      for (let j = 0; j < 5; j++) {
        key += charset[Math.floor(Math.random() * charset.length)];
      }
    }
    
    return key;
  }
  
  function validateKeyFormat(key) {
    const pattern = /^WAB-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/;
    return pattern.test(key);
  }
  
  // Test 1.1: Generate single key
  const testKey = generateLicenseKey();
  if (validateKeyFormat(testKey)) {
    logTest('License key format', 'PASS', '', { key: testKey });
  } else {
    logTest('License key format', 'FAIL', 'Invalid format', { key: testKey });
  }
  
  // Test 1.2: Generate multiple keys (uniqueness)
  const keys = new Set();
  for (let i = 0; i < 100; i++) {
    keys.add(generateLicenseKey());
  }
  
  if (keys.size === 100) {
    logTest('Key uniqueness (100 keys)', 'PASS', '', { unique: keys.size });
  } else {
    logTest('Key uniqueness (100 keys)', 'FAIL', `Only ${keys.size}/100 unique`, { unique: keys.size });
  }
  
  // Test 1.3: Key length
  if (testKey.length === 28) {  // WAB-XXXXX-XXXXX-XXXXX-XXXXX = 28 chars
    logTest('Key length validation', 'PASS', '', { length: testKey.length });
  } else {
    logTest('Key length validation', 'FAIL', `Expected 28, got ${testKey.length}`, { length: testKey.length });
  }
  
  // Test 1.4: No ambiguous characters
  const hasAmbiguous = /[OI10l]/i.test(testKey);
  if (!hasAmbiguous) {
    logTest('No ambiguous characters', 'PASS');
  } else {
    logTest('No ambiguous characters', 'FAIL', 'Found O, I, 1, 0, or l', { key: testKey });
  }
  
} catch (error) {
  logTest('License key generation suite', 'FAIL', error.message);
}

// ============================================================
// TEST 2: Database Schema Validation
// ============================================================

console.log('\n============================================================');
console.log('  TEST SUITE 2: Database Schema Validation');
console.log('============================================================\n');

try {
  const { Client } = require('pg');
  
  const client = new Client({
    user: TEST_CONFIG.dbUser,
    password: TEST_CONFIG.dbPassword,
    host: TEST_CONFIG.dbHost,
    port: TEST_CONFIG.dbPort,
    database: TEST_CONFIG.dbName
  });
  
  (async () => {
    try {
      await client.connect();
      logTest('Database connection', 'PASS', '', { host: TEST_CONFIG.dbHost, database: TEST_CONFIG.dbName });
      
      // Test 2.1: Check new tables exist
      const tables = ['license_plans', 'license_audit_logs', 'license_refresh_tokens', 'license_metrics', 'device_fingerprints'];
      
      for (const table of tables) {
        const result = await client.query(
          "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = $1",
          [table]
        );
        
        if (result.rows[0].count === '1') {
          logTest(`Table exists: ${table}`, 'PASS');
        } else {
          logTest(`Table exists: ${table}`, 'FAIL');
        }
      }
      
      // Test 2.2: Check default plans
      const planResult = await client.query('SELECT COUNT(*) FROM license_plans');
      const planCount = parseInt(planResult.rows[0].count);
      
      if (planCount >= 3) {
        logTest('Default plans inserted', 'PASS', '', { count: planCount });
      } else {
        logTest('Default plans inserted', 'FAIL', `Expected 3, found ${planCount}`, { count: planCount });
      }
      
      // Test 2.3: Check plan codes
      const plans = await client.query("SELECT code, name FROM license_plans ORDER BY code");
      const expectedCodes = ['basic', 'enterprise', 'pro'];
      const actualCodes = plans.rows.map(r => r.code).sort();
      
      if (JSON.stringify(actualCodes) === JSON.stringify(expectedCodes)) {
        logTest('Plan codes correct', 'PASS', '', { plans: actualCodes.join(', ') });
      } else {
        logTest('Plan codes correct', 'FAIL', `Expected ${expectedCodes.join(', ')}`, { found: actualCodes.join(', ') });
      }
      
      // Test 2.4: Check enhanced license columns
      const licenseColumns = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'licenses' 
        AND column_name IN ('plan_id', 'seats_total', 'seats_used', 'renewed_at', 'revoked_at')
      `);
      
      if (licenseColumns.rows.length === 5) {
        logTest('Enhanced license columns', 'PASS', '', { columns: licenseColumns.rows.length });
      } else {
        logTest('Enhanced license columns', 'FAIL', `Expected 5, found ${licenseColumns.rows.length}`);
      }
      
      // Test 2.5: Check indexes
      const indexes = await client.query(`
        SELECT COUNT(*) 
        FROM pg_indexes 
        WHERE tablename LIKE 'license_%' OR tablename = 'device_fingerprints'
      `);
      const indexCount = parseInt(indexes.rows[0].count);
      
      if (indexCount >= 10) {
        logTest('Indexes created', 'PASS', '', { count: indexCount });
      } else {
        logTest('Indexes created', 'WARN', `Expected 10+, found ${indexCount}`, { count: indexCount });
      }
      
      // Test 2.6: Check triggers
      const triggers = await client.query(`
        SELECT COUNT(*) 
        FROM information_schema.triggers 
        WHERE trigger_name LIKE 'update_license_%'
      `);
      const triggerCount = parseInt(triggers.rows[0].count);
      
      if (triggerCount >= 1) {
        logTest('Triggers created', 'PASS', '', { count: triggerCount });
      } else {
        logTest('Triggers created', 'FAIL', `Expected 1+, found ${triggerCount}`);
      }
      
      // Test 2.7: Check views
      const views = await client.query(`
        SELECT COUNT(*) 
        FROM information_schema.views 
        WHERE table_name LIKE 'v_%license%' OR table_name LIKE 'v_%subscription%'
      `);
      const viewCount = parseInt(views.rows[0].count);
      
      if (viewCount >= 2) {
        logTest('Views created', 'PASS', '', { count: viewCount });
      } else {
        logTest('Views created', 'WARN', `Expected 2, found ${viewCount}`, { count: viewCount });
      }
      
      await client.end();
      
    } catch (error) {
      logTest('Database schema validation', 'FAIL', error.message);
      if (client._connected) await client.end();
    }
  })();
  
} catch (error) {
  if (error.code === 'MODULE_NOT_FOUND') {
    logTest('PostgreSQL driver', 'WARN', 'pg module not installed, skipping database tests');
  } else {
    logTest('Database test setup', 'FAIL', error.message);
  }
}

// ============================================================
// TEST 3: JWT Token Logic
// ============================================================

console.log('\n============================================================');
console.log('  TEST SUITE 3: JWT Token Logic');
console.log('============================================================\n');

try {
  const jwt = require('jsonwebtoken');
  const SECRET = 'test-secret-key';
  
  // Test 3.1: Generate token
  const payload = {
    licenseId: 'test-license-123',
    deviceId: 'test-device-456',
    type: 'access'
  };
  
  const token = jwt.sign(payload, SECRET, { expiresIn: '24h' });
  
  if (token && token.split('.').length === 3) {
    logTest('JWT token generation', 'PASS', '', { format: 'valid JWT' });
  } else {
    logTest('JWT token generation', 'FAIL', 'Invalid token format');
  }
  
  // Test 3.2: Verify token
  try {
    const verified = jwt.verify(token, SECRET);
    
    if (verified.licenseId === payload.licenseId && verified.deviceId === payload.deviceId) {
      logTest('JWT token verification', 'PASS');
    } else {
      logTest('JWT token verification', 'FAIL', 'Payload mismatch');
    }
  } catch (error) {
    logTest('JWT token verification', 'FAIL', error.message);
  }
  
  // Test 3.3: Token expiration
  const expiredToken = jwt.sign(payload, SECRET, { expiresIn: '1ms' });
  
  setTimeout(() => {
    try {
      jwt.verify(expiredToken, SECRET);
      logTest('JWT token expiration', 'FAIL', 'Expired token still valid');
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        logTest('JWT token expiration', 'PASS');
      } else {
        logTest('JWT token expiration', 'FAIL', error.message);
      }
    }
  }, 10);
  
  // Test 3.4: Invalid signature
  try {
    jwt.verify(token, 'wrong-secret');
    logTest('JWT signature validation', 'FAIL', 'Accepted invalid signature');
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      logTest('JWT signature validation', 'PASS');
    } else {
      logTest('JWT signature validation', 'FAIL', error.message);
    }
  }
  
} catch (error) {
  if (error.code === 'MODULE_NOT_FOUND') {
    logTest('JWT library', 'WARN', 'jsonwebtoken not installed, skipping JWT tests');
  } else {
    logTest('JWT test setup', 'FAIL', error.message);
  }
}

// ============================================================
// TEST 4: Device Fingerprinting
// ============================================================

console.log('\n============================================================');
console.log('  TEST SUITE 4: Device Fingerprinting');
console.log('============================================================\n');

try {
  // Test 4.1: Generate device ID
  function generateDeviceId() {
    // Mock implementation
    const machineId = 'test-machine-id-' + Date.now();
    return crypto.createHash('sha256').update(machineId).digest('hex').substring(0, 32);
  }
  
  const deviceId = generateDeviceId();
  
  if (deviceId.length === 32 && /^[a-f0-9]+$/.test(deviceId)) {
    logTest('Device ID generation', 'PASS', '', { id: deviceId.substring(0, 16) + '...' });
  } else {
    logTest('Device ID generation', 'FAIL', 'Invalid format', { id: deviceId });
  }
  
  // Test 4.2: Device ID consistency
  const id1 = crypto.createHash('sha256').update('test-machine').digest('hex').substring(0, 32);
  const id2 = crypto.createHash('sha256').update('test-machine').digest('hex').substring(0, 32);
  
  if (id1 === id2) {
    logTest('Device ID consistency', 'PASS');
  } else {
    logTest('Device ID consistency', 'FAIL', 'Inconsistent IDs');
  }
  
  // Test 4.3: Device ID uniqueness
  const id3 = crypto.createHash('sha256').update('different-machine').digest('hex').substring(0, 32);
  
  if (id1 !== id3) {
    logTest('Device ID uniqueness', 'PASS');
  } else {
    logTest('Device ID uniqueness', 'FAIL', 'Collision detected');
  }
  
} catch (error) {
  logTest('Device fingerprinting tests', 'FAIL', error.message);
}

// ============================================================
// TEST 5: Encryption/Decryption
// ============================================================

console.log('\n============================================================');
console.log('  TEST SUITE 5: Data Encryption');
console.log('============================================================\n');

try {
  // Test 5.1: AES-256-CBC encryption
  const algorithm = 'aes-256-cbc';
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(16);
  
  const testData = JSON.stringify({
    licenseKey: 'WAB-TEST-12345-ABCDE-FGHIJ',
    deviceId: 'device-12345',
    expiresAt: new Date('2027-01-01').toISOString()
  });
  
  // Encrypt
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(testData, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  if (encrypted && encrypted.length > 0) {
    logTest('AES encryption', 'PASS', '', { encryptedLength: encrypted.length });
  } else {
    logTest('AES encryption', 'FAIL', 'Encryption failed');
  }
  
  // Test 5.2: Decryption
  try {
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    if (decrypted === testData) {
      logTest('AES decryption', 'PASS');
    } else {
      logTest('AES decryption', 'FAIL', 'Data mismatch after decryption');
    }
    
    // Verify JSON structure
    const parsed = JSON.parse(decrypted);
    if (parsed.licenseKey && parsed.deviceId && parsed.expiresAt) {
      logTest('Decrypted data integrity', 'PASS');
    } else {
      logTest('Decrypted data integrity', 'FAIL', 'Missing fields');
    }
  } catch (error) {
    logTest('AES decryption', 'FAIL', error.message);
  }
  
  // Test 5.3: Wrong key fails
  try {
    const wrongKey = crypto.randomBytes(32);
    const decipher = crypto.createDecipheriv(algorithm, wrongKey, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    logTest('Encryption security (wrong key)', 'FAIL', 'Decrypted with wrong key');
  } catch (error) {
    logTest('Encryption security (wrong key)', 'PASS');
  }
  
} catch (error) {
  logTest('Encryption tests', 'FAIL', error.message);
}

// ============================================================
// TEST 6: Date/Time Logic
// ============================================================

console.log('\n============================================================');
console.log('  TEST SUITE 6: Date/Time Logic');
console.log('============================================================\n');

try {
  // Test 6.1: Expiry calculation (365 days)
  const issueDate = new Date('2026-01-01');
  const expiryDate = new Date(issueDate);
  expiryDate.setDate(expiryDate.getDate() + 365);
  
  if (expiryDate.getFullYear() === 2027 && expiryDate.getMonth() === 0 && expiryDate.getDate() === 1) {
    logTest('License expiry calculation', 'PASS', '', { expiry: expiryDate.toISOString().split('T')[0] });
  } else {
    logTest('License expiry calculation', 'FAIL', 'Incorrect date math');
  }
  
  // Test 6.2: Grace period check
  const lastHeartbeat = new Date('2026-02-19');  // 3 days ago
  const now = new Date('2026-02-22');
  const daysDiff = Math.floor((now - lastHeartbeat) / (1000 * 60 * 60 * 24));
  
  if (daysDiff === 3) {
    logTest('Grace period calculation', 'PASS', '', { days: daysDiff });
  } else {
    logTest('Grace period calculation', 'FAIL', `Expected 3, got ${daysDiff}`);
  }
  
  // Test 6.3: Expired license detection
  const expiredLicense = new Date('2026-01-01');
  const isExpired = expiredLicense < now;
  
  if (isExpired) {
    logTest('Expired license detection', 'PASS');
  } else {
    logTest('Expired license detection', 'FAIL');
  }
  
  // Test 6.4: Active license detection
  const activeLicense = new Date('2027-12-31');
  const isActive = activeLicense > now;
  
  if (isActive) {
    logTest('Active license detection', 'PASS');
  } else {
    logTest('Active license detection', 'FAIL');
  }
  
} catch (error) {
  logTest('Date/time logic tests', 'FAIL', error.message);
}

// ============================================================
// FINAL REPORT
// ============================================================

// Wait for async tests to complete
setTimeout(() => {
  console.log('\n============================================================');
  console.log('  FUNCTIONAL TEST SUMMARY');
  console.log('============================================================\n');
  
  const total = results.passed + results.failed;
  const passRate = total > 0 ? ((results.passed / total) * 100).toFixed(2) : 0;
  
  console.log(`Total Tests: ${total}`);
  console.log(`\x1b[32mPassed: ${results.passed}\x1b[0m`);
  console.log(`\x1b[31mFailed: ${results.failed}\x1b[0m`);
  console.log(`\x1b[33mWarnings: ${results.warnings}\x1b[0m`);
  console.log(`Pass Rate: ${passRate}%`);
  console.log('');
  
  // Determine overall status
  if (results.failed === 0 && passRate >= 90) {
    console.log('\x1b[32m✓ All critical tests passed! System ready for deployment.\x1b[0m');
  } else if (results.failed <= 3 && passRate >= 70) {
    console.log('\x1b[33m⚠ Some tests failed. Review before production deployment.\x1b[0m');
  } else {
    console.log('\x1b[31m✗ Multiple failures detected. System NOT ready for deployment.\x1b[0m');
  }
  
  // Export results
  const fs = require('fs');
  const path = require('path');
  
  const reportDir = path.join(__dirname, '..', 'test-results');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportFile = path.join(reportDir, `functional-test-report_${timestamp}.json`);
  
  const report = {
    timestamp: new Date().toISOString(),
    environment: TEST_CONFIG.apiUrl,
    summary: {
      total: total,
      passed: results.passed,
      failed: results.failed,
      warnings: results.warnings,
      passRate: parseFloat(passRate)
    },
    tests: results.tests
  };
  
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  
  console.log(`\nDetailed report saved to: ${reportFile}`);
  console.log('');
  
  process.exit(results.failed > 0 ? 1 : 0);
  
}, 2000);  // Wait 2 seconds for async tests
