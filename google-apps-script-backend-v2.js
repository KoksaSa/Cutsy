/**
 * ═══════════════════════════════════════════════════════════════
 * CUTSY LICENSE SERVER v2.1 — Account-Based System
 * ═══════════════════════════════════════════════════════════════
 */

const SHEET_USERS = 'users';
const SHEET_LICENSES = 'licenses';
const SHEET_CONFIG = 'config';
const LICENSE_DAYS = 180;  // 6 месяцев

// ═══════════════════════════════════════════════════════════════
// УТИЛИТЫ (объявлены ДО обработчиков!)
// ═══════════════════════════════════════════════════════════════

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name);
}

function findUserByEmail(sheet, email) {
  const data = sheet.getDataRange().getValues();
  const searchEmail = email.toLowerCase().trim();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString().toLowerCase().trim() === searchEmail) {
      // Защита для старых записей с меньшим количеством столбцов
      const row = data[i];
      return {
        email: row[0],
        passwordHash: row[1],
        licenseKey: row[2] || '',
        activatedAt: row[3] || null,
        expiresAt: row[4] || null,
        createdAt: row[5] || null,
        deviceTokens: (row[6] !== undefined && row[6] !== null) ? row[6] : '',
        deviceCount: (row[7] !== undefined && row[7] !== null) ? row[7] : 0,
        maxDevices: (row[8] !== undefined && row[8] !== null) ? row[8] : null,
        rowIndex: i + 1
      };
    }
  }
  return null;
}

function findUserRow(sheet, email) {
  const data = sheet.getDataRange().getValues();
  const searchEmail = email.toLowerCase().trim();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString().toLowerCase().trim() === searchEmail) {
      return i + 1;
    }
  }
  return -1;
}

function findLicenseByKey(sheet, key) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      return {
        key: data[i][0],
        used: data[i][1],
        assignedTo: data[i][2] || '',
        rowIndex: i + 1
      };
    }
  }
  return null;
}

function findLicenseRow(sheet, key) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      return i + 1;
    }
  }
  return -1;
}

function findFreeLicense(sheet) {
  if (!sheet) {
    console.error('findFreeLicense: sheet is undefined!');
    return null;
  }
  const data = sheet.getDataRange().getValues();
  console.log('findFreeLicense: проверяем ' + (data.length - 1) + ' строк');
  for (let i = 1; i < data.length; i++) {
    const key = data[i][0];
    const used = data[i][1];
    if (!used || used === false || used === 'FALSE' || used === 0 || used === '') {
      console.log('findFreeLicense: найден свободный ключ ' + key);
      return { key: key, rowIndex: i + 1 };
    }
  }
  console.log('findFreeLicense: нет свободных ключей');
  return null;
}

function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function isLicenseExpired(expiresAt) {
  if (!expiresAt) return true;
  return new Date(expiresAt) < new Date();
}

function calculateDaysLeft(expiresAt) {
  if (!expiresAt) return 0;
  const ms = new Date(expiresAt) - new Date();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function getConfig(key, defaultValue) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CONFIG);
    if (!sheet) {
      console.warn('Config sheet not found, using default:', defaultValue);
      return defaultValue;
    }
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().trim() === key) {
        const val = data[i][1];
        if (!isNaN(val) && val !== '') {
          return parseInt(val, 10);
        }
        return val;
      }
    }
    return defaultValue;
  } catch (error) {
    console.error('Config error:', error);
    return defaultValue;
  }
}

function sha256(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const salted = str + 'cutsy_salt_v2_' + str.length;
  let h = 0;
  for (let i = 0; i < salted.length; i++) {
    h = ((h << 5) - h) + salted.charCodeAt(i);
    h = h & h;
  }
  return Math.abs(h).toString(16).padStart(16, '0') + Math.abs(hash).toString(16).padStart(16, '0');
}

function generateSessionToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token + Date.now().toString(36);
}

function parsePayload(e) {
  try {
    if (e.postData && e.postData.contents) {
      try {
        return JSON.parse(e.postData.contents);
      } catch (jsonError) {
        // Не JSON
      }
    }
    if (e.parameter) {
      const params = {};
      for (const key in e.parameter) {
        params[key] = e.parameter[key];
      }
      return params;
    }
  } catch (error) {
    console.error('Parse payload error:', error);
  }
  return null;
}

function jsonResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function logEvent(action, email, detail) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let logSheet = ss.getSheetByName('logs');
    if (!logSheet) {
      logSheet = ss.insertSheet('logs');
      logSheet.appendRow(['timestamp', 'action', 'email', 'detail']);
    }
    logSheet.appendRow([
      new Date().toISOString(),
      action,
      email || '',
      detail || ''
    ]);
  } catch (e) {
    console.error('Log error:', e);
  }
}

// ═══════════════════════════════════════════════════════════════
// ОСНОВНЫЕ ОБРАБОТЧИКИ
// ═══════════════════════════════════════════════════════════════

function doPost(e) {
  try {
    console.log('🔥 doPost вызван');
    const data = parsePayload(e);
    console.log('📋 doPost data:', JSON.stringify(data));
    
    if (!data || !data.action) {
      return jsonResponse({ status: 'error', message: 'Missing action' });
    }

    switch (data.action) {
      case 'register':
        return handleRegister(data);
      case 'login':
        return handleLogin(data);
      case 'activate-license':
        return handleActivateLicense(data);
      case 'check-license':
        return handleCheckLicense(data);
      case 'get-user':
        return handleGetUser(data);
      case 'remove-device':
        return handleRemoveDevice(data);
      default:
        return jsonResponse({ status: 'error', message: 'Unknown action: ' + data.action });
    }
  } catch (error) {
    console.error('Server error:', error);
    return jsonResponse({ status: 'error', message: 'Server error: ' + error.message });
  }
}

function doGet(e) {
  return jsonResponse({
    status: 'ok',
    message: 'Cutsy License Server v2.1 is running',
    timestamp: new Date().toISOString()
  });
}

function doOptions(e) {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.JSON)
    .setHeaders({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    });
}

// ═══════════════════════════════════════════════════════════════
// РЕГИСТРАЦИЯ
// ═══════════════════════════════════════════════════════════════

function handleRegister(data) {
  const { email, password } = data;

  if (!email || !password) {
    return jsonResponse({ status: 'error', message: '❌ Введите email и пароль' });
  }

  if (!isValidEmail(email)) {
    return jsonResponse({ status: 'error', message: '❌ Неверный формат email' });
  }

  if (password.length < 6) {
    return jsonResponse({ status: 'error', message: '❌ Пароль должен быть минимум 6 символов' });
  }

  const usersSheet = getSheet(SHEET_USERS);
  const licensesSheet = getSheet(SHEET_LICENSES);

  if (!usersSheet) {
    return jsonResponse({ status: 'error', message: 'Sheet "users" not found' });
  }
  if (!licensesSheet) {
    return jsonResponse({ status: 'error', message: 'Sheet "licenses" not found' });
  }

  if (findUserByEmail(usersSheet, email)) {
    return jsonResponse({ status: 'error', message: '❌ Этот email уже зарегистрирован' });
  }

  const passwordHash = sha256(password);
  const now = new Date();
  const licenseDays = getConfig('license_days', 180);  // 6 месяцев
  const expiresAt = new Date(now.getTime() + licenseDays * 24 * 60 * 60 * 1000);
  const defaultMaxDevices = getConfig('max_devices', 1);

  usersSheet.appendRow([
    email.toLowerCase().trim(),
    passwordHash,
    '',
    '',
    '',
    now,
    '',       // device_tokens
    0,        // device_count
    defaultMaxDevices  // max_devices
  ]);

  // Найти свободный ключ
  console.log('handleRegister: ищем свободный ключ...');
  const freeKey = findFreeLicense(licensesSheet);
  console.log('handleRegister: результат findFreeLicense =', freeKey ? freeKey.key : 'null');

  if (freeKey) {
    const userRow = findUserRow(usersSheet, email);
    if (userRow > 0) {
      usersSheet.getRange(userRow, 3).setValue(freeKey.key);     // license_key
      usersSheet.getRange(userRow, 4).setValue(now);             // activated_at
      usersSheet.getRange(userRow, 5).setValue(expiresAt);       // expires_at
    }
    const licenseRow = findLicenseRow(licensesSheet, freeKey.key);
    if (licenseRow > 0) {
      licensesSheet.getRange(licenseRow, 2).setValue(true);
      licensesSheet.getRange(licenseRow, 3).setValue(email);
    }
    logEvent('KEY_ASSIGNED', email, freeKey.key);
  } else {
    logEvent('NO_FREE_KEY', email, 'No free license key available');
  }

  logEvent('REGISTER', email);

  return jsonResponse({
    status: 'ok',
    message: '✅ Регистрация успешна! Проверьте вашу почту.',
    email: email,
    licenseKey: freeKey ? freeKey.key : null,
    activatedAt: freeKey ? now.toISOString() : null,
    expiresAt: freeKey ? expiresAt.toISOString() : null
  });
}

// ═══════════════════════════════════════════════════════════════
// ЛОГИН
// ═══════════════════════════════════════════════════════════════

function handleLogin(data) {
  console.log('🔥 handleLogin вызван, data:', JSON.stringify(data));
  
  const { email, password, deviceToken } = data;
  console.log('📋 email:', email, 'password:', password ? '***' : 'empty', 'deviceToken:', deviceToken);

  if (!email || !password) {
    return jsonResponse({ status: 'error', message: '❌ Введите email и пароль' });
  }

  const usersSheet = getSheet(SHEET_USERS);
  if (!usersSheet) {
    return jsonResponse({ status: 'error', message: 'Sheet "users" not found' });
  }

  const user = findUserByEmail(usersSheet, email);
  if (!user) {
    return jsonResponse({ status: 'error', message: '❌ Пользователь не найден' });
  }

  const passwordHash = sha256(password);
  if (user.passwordHash !== passwordHash) {
    logEvent('LOGIN_FAILED', email);
    return jsonResponse({ status: 'error', message: '❌ Неверный пароль' });
  }

  const globalMaxDevices = getConfig('max_devices', 1);
  let maxDevices = user.maxDevices !== null && user.maxDevices !== '' ? parseInt(user.maxDevices, 10) : globalMaxDevices;
  
  // Защита: если maxDevices = 0 или не валидно, использовать значение по умолчанию
  if (!maxDevices || maxDevices <= 0) {
    maxDevices = globalMaxDevices;
    // Записываем в таблицу, если было пусто
    usersSheet.getRange(user.rowIndex, 9).setValue(maxDevices);
    console.log('handleLogin: установлено maxDevices по умолчанию =', maxDevices);
  }
  
  let currentDeviceCount = user.deviceCount || 0;
  console.log('handleLogin: deviceToken =', deviceToken, 'maxDevices =', maxDevices, 'currentCount =', currentDeviceCount);
  console.log('handleLogin: user.deviceTokens =', user.deviceTokens, 'rowIndex =', user.rowIndex);

  if (deviceToken) {
    const deviceTokens = user.deviceTokens ? user.deviceTokens.split('|') : [];
    const filteredTokens = deviceTokens.filter(t => t && t.trim());
    console.log('handleLogin: существующие токены =', filteredTokens.length, filteredTokens);

    if (filteredTokens.includes(deviceToken)) {
      // Обновляем порядок (этот токен становится первым)
      const updatedTokens = [deviceToken, ...filteredTokens.filter(t => t !== deviceToken)];
      usersSheet.getRange(user.rowIndex, 7).setValue(updatedTokens.join('|'));
      usersSheet.getRange(user.rowIndex, 8).setValue(updatedTokens.length);
      currentDeviceCount = updatedTokens.length;
      console.log('handleLogin: токен уже существует, обновлён порядок, device_tokens =', updatedTokens.join('|'));
    } else if (filteredTokens.length < maxDevices) {
      filteredTokens.push(deviceToken);
      usersSheet.getRange(user.rowIndex, 7).setValue(filteredTokens.join('|'));
      usersSheet.getRange(user.rowIndex, 8).setValue(filteredTokens.length);
      currentDeviceCount = filteredTokens.length;
      logEvent('NEW_DEVICE_ADDED', email, `Devices: ${filteredTokens.length}/${maxDevices}`);
      console.log('handleLogin: новое устройство добавлено, device_tokens =', filteredTokens.join('|'), 'всего =', filteredTokens.length);
    } else {
      logEvent('DEVICE_LIMIT_REACHED', email, `Already ${filteredTokens.length}/${maxDevices} devices`);
      return jsonResponse({
        status: 'error',
        message: `❌ Лимит ${maxDevices} устройства превышен. Удалите старое устройство через меню аккаунта.`,
        deviceLimit: true,
        currentDevices: filteredTokens.length,
        maxDevices: maxDevices
      });
    }
  }

  const sessionToken = generateSessionToken();

  logEvent('LOGIN_SUCCESS', email);

  return jsonResponse({
    status: 'ok',
    message: '✅ Вход выполнен!',
    email: user.email,
    sessionToken: sessionToken,
    hasLicense: !!user.licenseKey,
    licenseKey: user.licenseKey || null,
    activatedAt: user.activatedAt || null,
    expiresAt: user.expiresAt || null,
    isExpired: isLicenseExpired(user.expiresAt),
    deviceCount: currentDeviceCount,
    maxDevices: maxDevices
  });
}

// ═══════════════════════════════════════════════════════════════
// АКТИВАЦИЯ ЛИЦЕНЗИИ
// ═══════════════════════════════════════════════════════════════

function handleActivateLicense(data) {
  const { email, licenseKey } = data;

  if (!email || !licenseKey) {
    return jsonResponse({ status: 'error', message: '❌ Введите email и ключ лицензии' });
  }

  const usersSheet = getSheet(SHEET_USERS);
  const licensesSheet = getSheet(SHEET_LICENSES);

  if (!usersSheet || !licensesSheet) {
    return jsonResponse({ status: 'error', message: ' Sheets not found' });
  }

  const user = findUserByEmail(usersSheet, email);
  if (!user) {
    return jsonResponse({ status: 'error', message: '❌ Пользователь не найден' });
  }

  const license = findLicenseByKey(licensesSheet, licenseKey);
  if (!license) {
    logEvent('LICENSE_NOT_FOUND', email, licenseKey);
    return jsonResponse({ status: 'error', message: '❌ Ключ лицензии не найден' });
  }

  if (license.used === true || license.used === 'TRUE' || license.used === 1) {
    if (license.assignedTo === email) {
      return jsonResponse({
        status: 'ok',
        message: '✅ Ключ уже активирован на вашем аккаунте',
        licenseKey: licenseKey,
        expiresAt: user.expiresAt
      });
    }
    logEvent('LICENSE_ALREADY_USED', email, licenseKey);
    return jsonResponse({ status: 'error', message: '❌ Этот ключ уже использован другим пользователем' });
  }

  const now = new Date();
  const licenseDays = getConfig('license_days', 180);  // 6 месяцев
  const expiresAt = new Date(now.getTime() + licenseDays * 24 * 60 * 60 * 1000);

  const userRow = findUserRow(usersSheet, email);
  if (userRow > 0) {
    usersSheet.getRange(userRow, 3).setValue(licenseKey);
    usersSheet.getRange(userRow, 4).setValue(now);
    usersSheet.getRange(userRow, 5).setValue(expiresAt);
  }

  const licenseRow = findLicenseRow(licensesSheet, licenseKey);
  if (licenseRow > 0) {
    licensesSheet.getRange(licenseRow, 2).setValue(true);
    licensesSheet.getRange(licenseRow, 3).setValue(email);
  }

  logEvent('LICENSE_ACTIVATED', email, licenseKey);

  return jsonResponse({
    status: 'ok',
    message: '✅ Лицензия активирована!',
    licenseKey: licenseKey,
    activatedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    daysLeft: licenseDays
  });
}

// ═══════════════════════════════════════════════════════════════
// ПРОВЕРКА ЛИЦЕНЗИИ
// ═══════════════════════════════════════════════════════════════

function handleCheckLicense(data) {
  const { email } = data;

  if (!email) {
    return jsonResponse({ status: 'error', message: '❌ Введите email' });
  }

  const usersSheet = getSheet(SHEET_USERS);
  if (!usersSheet) {
    return jsonResponse({ status: 'error', message: 'Sheet not found' });
  }

  const user = findUserByEmail(usersSheet, email);
  if (!user) {
    return jsonResponse({ status: 'error', message: '❌ Пользователь не найден' });
  }

  const hasLicense = !!user.licenseKey;
  const expired = isLicenseExpired(user.expiresAt);
  const globalMaxDevices = getConfig('max_devices', 1);
  const maxDevices = user.maxDevices !== null && user.maxDevices !== '' ? parseInt(user.maxDevices, 10) : globalMaxDevices;

  if (!hasLicense) {
    return jsonResponse({
      status: 'ok',
      message: 'У пользователя нет активной лицензии',
      hasLicense: false,
      maxDevices: maxDevices
    });
  }

  return jsonResponse({
    status: 'ok',
    message: expired ? '❌ Срок лицензии истёк' : '✅ Лицензия активна',
    hasLicense: true,
    isExpired: expired,
    licenseKey: user.licenseKey,
    activatedAt: user.activatedAt,
    expiresAt: user.expiresAt,
    daysLeft: expired ? 0 : calculateDaysLeft(user.expiresAt),
    maxDevices: maxDevices
  });
}

// ═══════════════════════════════════════════════════════════════
// УДАЛЕНИЕ УСТРОЙСТВА
// ═══════════════════════════════════════════════════════════════

function handleRemoveDevice(data) {
  const { email, deviceToken } = data;

  if (!email) {
    return jsonResponse({ status: 'error', message: '❌ Введите email' });
  }

  const usersSheet = getSheet(SHEET_USERS);
  if (!usersSheet) {
    return jsonResponse({ status: 'error', message: 'Sheet not found' });
  }

  const user = findUserByEmail(usersSheet, email);
  if (!user) {
    return jsonResponse({ status: 'error', message: '❌ Пользователь не найден' });
  }

  let deviceTokens = user.deviceTokens ? user.deviceTokens.split('|') : [];
  const filteredTokens = deviceTokens.filter(t => t && t.trim());

  if (filteredTokens.length === 0) {
    return jsonResponse({ status: 'error', message: '❌ Нет привязанных устройств' });
  }

  if (deviceToken && filteredTokens.includes(deviceToken)) {
    const updatedTokens = filteredTokens.filter(t => t !== deviceToken);
    usersSheet.getRange(user.rowIndex, 7).setValue(updatedTokens.join('|'));
    usersSheet.getRange(user.rowIndex, 8).setValue(updatedTokens.length);
    logEvent('DEVICE_REMOVED', email, `Removed: ${deviceToken}, Remaining: ${updatedTokens.length}`);
    return jsonResponse({
      status: 'ok',
      message: '✅ Устройство удалено',
      remainingDevices: updatedTokens.length
    });
  }

  filteredTokens.pop();
  usersSheet.getRange(user.rowIndex, 7).setValue(filteredTokens.join('|'));
  usersSheet.getRange(user.rowIndex, 8).setValue(filteredTokens.length);
  logEvent('DEVICE_REMOVED', email, `Removed oldest, Remaining: ${filteredTokens.length}`);
  return jsonResponse({
    status: 'ok',
    message: '✅ Старое устройство удалено',
    remainingDevices: filteredTokens.length
  });
}

// ═══════════════════════════════════════════════════════════════
// ПОЛУЧЕНИЕ ДАННЫХ ПОЛЬЗОВАТЕЛЯ
// ═══════════════════════════════════════════════════════════════

function handleGetUser(data) {
  const { email } = data;

  if (!email) {
    return jsonResponse({ status: 'error', message: 'Missing email' });
  }

  const usersSheet = getSheet(SHEET_USERS);
  if (!usersSheet) {
    return jsonResponse({ status: 'error', message: 'Sheet not found' });
  }

  const user = findUserByEmail(usersSheet, email);
  if (!user) {
    return jsonResponse({ status: 'error', message: 'User not found' });
  }

  return jsonResponse({
    status: 'ok',
    email: user.email,
    hasLicense: !!user.licenseKey,
    licenseKey: user.licenseKey || null,
    activatedAt: user.activatedAt || null,
    expiresAt: user.expiresAt || null,
    isExpired: isLicenseExpired(user.expiresAt)
  });
}

// ═══════════════════════════════════════════════════════════════
// АДМИН-ФУНКЦИИ (для ручного запуска в редакторе)
// ═══════════════════════════════════════════════════════════════

function generateLicenseKeys(count) {
  count = count || 10;
  const sheet = getSheet(SHEET_LICENSES);
  if (!sheet) {
    console.error('Sheet "licenses" not found!');
    return;
  }

  const keys = [];
  for (let i = 0; i < count; i++) {
    const key = generateKey();
    sheet.appendRow([key, false, '']);
    keys.push(key);
  }

  console.log('Generated ' + count + ' keys:');
  keys.forEach(k => console.log(k));
  return keys;
}

function generate500Keys() {
  const sheet = getSheet(SHEET_LICENSES);
  if (!sheet) {
    throw new Error('Лист "licenses" не найден');
  }

  const count = 500;
  const keys = [];
  const existingKeys = new Set();

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) existingKeys.add(data[i][0]);
  }

  let generated = 0;
  while (generated < count) {
    const key = generateKey();
    if (!existingKeys.has(key)) {
      keys.push([key, false, '']);
      existingKeys.add(key);
      generated++;
    }
  }

  const batchSize = 100;
  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);
    sheet.getRange(sheet.getLastRow() + 1, 1, batch.length, 3).setValues(batch);
  }

  console.log('✅ Сгенерировано ' + generated + ' ключей');
  return generated;
}

function generateKey() {
  const prefix = 'CUTSY2-PRO-';
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = prefix;
  for (let g = 0; g < 4; g++) {
    for (let i = 0; i < 4; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (g < 3) result += '-';
  }
  const cs = calculateChecksum(result);
  return result + '-' + cs;
}

function calculateChecksum(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(16).padStart(8, '0').toUpperCase().slice(-8);
}

function getStats() {
  const usersSheet = getSheet(SHEET_USERS);
  const licensesSheet = getSheet(SHEET_LICENSES);

  const usersData = usersSheet ? usersSheet.getDataRange().getValues() : [];
  const licensesData = licensesSheet ? licensesSheet.getDataRange().getValues() : [];

  let totalUsers = 0;
  let usersWithLicense = 0;
  let expiredLicenses = 0;

  for (let i = 1; i < usersData.length; i++) {
    totalUsers++;
    if (usersData[i][2]) {
      usersWithLicense++;
      if (isLicenseExpired(usersData[i][4])) {
        expiredLicenses++;
      }
    }
  }

  let totalKeys = 0;
  let usedKeys = 0;
  for (let i = 1; i < licensesData.length; i++) {
    totalKeys++;
    if (licensesData[i][1] === true || licensesData[i][1] === 'TRUE' || licensesData[i][1] === 1) {
      usedKeys++;
    }
  }

  const stats = {
    totalUsers: totalUsers,
    usersWithLicense: usersWithLicense,
    expiredLicenses: expiredLicenses,
    totalKeys: totalKeys,
    usedKeys: usedKeys,
    availableKeys: totalKeys - usedKeys
  };

  console.log('Stats:', stats);
  return stats;
}