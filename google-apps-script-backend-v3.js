/**
 * ═══════════════════════════════════════════════════════════════
 * CUTSY LICENSE SERVER v3.0 — Clean Rewrite
 * ═══════════════════════════════════════════════════════════════
 * 
 * Листы:
 *   users:    email | password_hash | license_key | activated_at | expires_at | created_at | device_tokens | device_count | max_devices
 *   licenses: key | used | assigned_to
 *   config:   key | value
 *   logs:     timestamp | action | email | detail
 */

// ═══════════════════════════════════════════════════════════════
// КОНФИГ
// ═══════════════════════════════════════════════════════════════

const SHEET_USERS    = 'users';
const SHEET_LICENSES = 'licenses';
const SHEET_CONFIG   = 'config';
const SHEET_LOGS     = 'logs';

const TG_BOT_TOKEN   = '8526541616:AAEwEZzd4jrwjNgiSqwjLUR_c8GyGTrfPiE';
const TG_CHAT_ID     = '358002688';

// ═══════════════════════════════════════════════════════════════
// УТИЛИТЫ (все до обработчиков!)
// ═══════════════════════════════════════════════════════════════

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name);
}

function ensureSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers) sheet.appendRow(headers);
  }
  return sheet;
}

function sha256(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  const salted = str + 'cutsy_salt_v3_' + str.length;
  let h = 0;
  for (let i = 0; i < salted.length; i++) {
    h = ((h << 5) - h) + salted.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(16).padStart(16, '0') + Math.abs(hash).toString(16).padStart(16, '0');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateSessionToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) token += chars.charAt(Math.floor(Math.random() * chars.length));
  return token + Date.now().toString(36);
}

function jsonResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function parsePayload(e) {
  try {
    if (e.postData && e.postData.contents) {
      try { return JSON.parse(e.postData.contents); } catch (e2) {}
    }
    if (e.parameter) {
      const params = {};
      for (const key in e.parameter) params[key] = e.parameter[key];
      return params;
    }
  } catch (err) { console.error('parsePayload error:', err); }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// РАБОТА С ТАБЛИЦЕЙ USERS
// ═══════════════════════════════════════════════════════════════

function getUsersSheet() {
  return ensureSheet(SHEET_USERS, ['email','password_hash','license_key','activated_at','expires_at','created_at','device_tokens','device_count','max_devices']);
}

function findUserRow(email) {
  const sheet = getUsersSheet();
  const data = sheet.getDataRange().getValues();
  const search = email.toLowerCase().trim();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString().toLowerCase().trim() === search) {
      return i + 1;
    }
  }
  return -1;
}

function getUserData(rowIndex) {
  const sheet = getUsersSheet();
  const row = sheet.getRange(rowIndex, 1, 1, 9).getValues()[0];
  return {
    email:        row[0],
    passwordHash: row[1],
    licenseKey:   row[2] || '',
    activatedAt:  row[3] || null,
    expiresAt:    row[4] || null,
    createdAt:    row[5] || null,
    deviceTokens: row[6] || '',
    deviceCount:  row[7] || 0,
    maxDevices:   row[8] || null,
    rowIndex:     rowIndex
  };
}

function updateUser(rowIndex, col, value) {
  getUsersSheet().getRange(rowIndex, col).setValue(value);
}

// ═══════════════════════════════════════════════════════════════
// РАБОТА С ТАБЛИЦЕЙ LICENSES
// ═══════════════════════════════════════════════════════════════

function getLicensesSheet() {
  return ensureSheet(SHEET_LICENSES, ['key','used','assigned_to']);
}

function findLicenseRow(key) {
  const sheet = getLicensesSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) return i + 1;
  }
  return -1;
}

function findFreeLicense() {
  const sheet = getLicensesSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const used = data[i][1];
    if (!used || used === false || used === 'FALSE' || used === 0 || used === '') {
      return { key: data[i][0], rowIndex: i + 1 };
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════

function getConfig(key, defaultValue) {
  try {
    const sheet = ensureSheet(SHEET_CONFIG, ['key','value']);
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().trim() === key) {
        const val = data[i][1];
        if (!isNaN(val) && val !== '') return parseInt(val, 10);
        return val;
      }
    }
  } catch (e) { console.error('getConfig error:', e); }
  return defaultValue;
}

// ═══════════════════════════════════════════════════════════════
// ЛОГИ
// ═══════════════════════════════════════════════════════════════

function logEvent(action, email, detail) {
  try {
    const sheet = ensureSheet(SHEET_LOGS, ['timestamp','action','email','detail']);
    sheet.appendRow([new Date().toISOString(), action, email || '', detail || '']);
  } catch (e) { console.error('logEvent error:', e); }
}

// ═══════════════════════════════════════════════════════════════
// TELEGRAM
// ═══════════════════════════════════════════════════════════════

function sendTelegram(text) {
  try {
    const url = 'https://api.telegram.org/bot' + TG_BOT_TOKEN + '/sendMessage';
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        chat_id: TG_CHAT_ID,
        text: text,
        parse_mode: 'Markdown'
      })
    });
    console.log('✅ Telegram sent');
  } catch (e) {
    console.error('❌ Telegram error:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// ОБРАБОТЧИКИ
// ═══════════════════════════════════════════════════════════════

function doPost(e) {
  try {
    const data = parsePayload(e);
    console.log('🔥 doPost action:', data ? data.action : 'null');
    
    if (!data || !data.action) {
      return jsonResponse({ status: 'error', message: 'Missing action' });
    }

    switch (data.action) {
      case 'register':         return handleRegister(data);
      case 'login':            return handleLogin(data);
      case 'activate-license': return handleActivateLicense(data);
      case 'check-license':    return handleCheckLicense(data);
      case 'remove-device':    return handleRemoveDevice(data);
      default:
        return jsonResponse({ status: 'error', message: 'Unknown action' });
    }
  } catch (error) {
    console.error('Server error:', error);
    return jsonResponse({ status: 'error', message: 'Server error: ' + error.message });
  }
}

function doGet(e) {
  return jsonResponse({
    status: 'ok',
    message: 'Cutsy License Server v3.0 is running',
    timestamp: new Date().toISOString()
  });
}

// ═══════════════════════════════════════════════════════════════
// REGISTER
// ═══════════════════════════════════════════════════════════════

function handleRegister(data) {
  const email = data.email;
  const password = data.password;

  if (!email || !password) {
    return jsonResponse({ status: 'error', message: '❌ Введите email и пароль' });
  }
  if (!isValidEmail(email)) {
    return jsonResponse({ status: 'error', message: '❌ Неверный формат email' });
  }
  if (password.length < 6) {
    return jsonResponse({ status: 'error', message: '❌ Пароль минимум 6 символов' });
  }

  const usersSheet = getUsersSheet();
  const licensesSheet = getLicensesSheet();

  if (findUserRow(email) > 0) {
    return jsonResponse({ status: 'error', message: '❌ Этот email уже зарегистрирован' });
  }

  const passwordHash = sha256(password);
  const now = new Date();
  const licenseDays = getConfig('license_days', 180);
  const expiresAt = new Date(now.getTime() + licenseDays * 24 * 60 * 60 * 1000);
  const defaultMaxDevices = getConfig('max_devices', 1);

  // Записываем 9 столбцов
  usersSheet.appendRow([
    email.toLowerCase().trim(),
    passwordHash,
    '',           // license_key
    '',           // activated_at
    '',           // expires_at
    now,          // created_at
    '',           // device_tokens
    0,            // device_count
    defaultMaxDevices // max_devices
  ]);

  // Найти свободный ключ
  const freeKey = findFreeLicense();
  let assignedKey = null;

  if (freeKey) {
    const userRow = findUserRow(email);
    if (userRow > 0) {
      updateUser(userRow, 3, freeKey.key);     // C: license_key
      updateUser(userRow, 4, now);             // D: activated_at
      updateUser(userRow, 5, expiresAt);       // E: expires_at
    }
    licensesSheet.getRange(freeKey.rowIndex, 2).setValue(true);
    licensesSheet.getRange(freeKey.rowIndex, 3).setValue(email);
    assignedKey = freeKey.key;
    logEvent('KEY_ASSIGNED', email, assignedKey);
  } else {
    logEvent('NO_FREE_KEY', email, 'No free keys');
  }

  logEvent('REGISTER', email);

  // Telegram уведомление
  const tgText = assignedKey
    ? `🔔 *Новая регистрация Cutsy*\n\n📧 \`${email}\`\n🔑 \`${assignedKey}\`\n📅 ${now.toLocaleString('ru-RU')}\n\n✉️ Отправьте ключ клиенту.`
    : `🔔 *Новая регистрация Cutsy*\n\n📧 \`${email}\`\n⚠️ Ключей нет!\n📅 ${now.toLocaleString('ru-RU')}`;
  sendTelegram(tgText);

  return jsonResponse({
    status: 'ok',
    message: '✅ Регистрация успешна!',
    email: email,
    licenseKey: assignedKey,
    activatedAt: assignedKey ? now.toISOString() : null,
    expiresAt: assignedKey ? expiresAt.toISOString() : null
  });
}

// ═══════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════

function handleLogin(data) {
  const email = data.email;
  const password = data.password;
  const deviceToken = data.deviceToken;

  console.log('🔥 handleLogin:', email, 'deviceToken:', deviceToken);

  if (!email || !password) {
    return jsonResponse({ status: 'error', message: '❌ Введите email и пароль' });
  }

  const userRow = findUserRow(email);
  if (userRow < 0) {
    return jsonResponse({ status: 'error', message: '❌ Пользователь не найден' });
  }

  const user = getUserData(userRow);
  const passwordHash = sha256(password);

  if (user.passwordHash !== passwordHash) {
    logEvent('LOGIN_FAILED', email);
    return jsonResponse({ status: 'error', message: '❌ Неверный пароль' });
  }

  // maxDevices
  const globalMax = getConfig('max_devices', 1);
  let maxDevices = parseInt(user.maxDevices, 10);
  if (isNaN(maxDevices) || maxDevices <= 0) {
    maxDevices = globalMax;
    updateUser(userRow, 9, maxDevices);
  }

  let currentCount = parseInt(user.deviceCount, 10) || 0;
  console.log('📋 maxDevices:', maxDevices, 'currentCount:', currentCount);

  // Устройства
  if (deviceToken) {
    let tokens = user.deviceTokens ? user.deviceTokens.toString().split('|') : [];
    tokens = tokens.filter(t => t && t.trim());
    console.log('📋 existing tokens:', tokens.length, tokens);

    if (tokens.includes(deviceToken)) {
      // Перемещаем в начало
      tokens = [deviceToken, ...tokens.filter(t => t !== deviceToken)];
      updateUser(userRow, 7, tokens.join('|'));
      updateUser(userRow, 8, tokens.length);
      currentCount = tokens.length;
      console.log('📋 token exists, reordered');
    } else if (tokens.length < maxDevices) {
      tokens.push(deviceToken);
      updateUser(userRow, 7, tokens.join('|'));
      updateUser(userRow, 8, tokens.length);
      currentCount = tokens.length;
      logEvent('DEVICE_ADDED', email, `${tokens.length}/${maxDevices}`);
      console.log('📋 new device added:', tokens.join('|'));
    } else {
      logEvent('DEVICE_LIMIT', email, `${tokens.length}/${maxDevices}`);
      return jsonResponse({
        status: 'error',
        message: `❌ Лимит ${maxDevices} устройств. Удалите старое.`,
        deviceLimit: true,
        currentDevices: tokens.length,
        maxDevices: maxDevices
      });
    }
  }

  logEvent('LOGIN_SUCCESS', email);

  return jsonResponse({
    status: 'ok',
    message: '✅ Вход выполнен!',
    email: user.email,
    sessionToken: generateSessionToken(),
    hasLicense: !!user.licenseKey,
    licenseKey: user.licenseKey || null,
    activatedAt: user.activatedAt,
    expiresAt: user.expiresAt,
    isExpired: user.expiresAt ? new Date(user.expiresAt) < new Date() : false,
    deviceCount: currentCount,
    maxDevices: maxDevices
  });
}

// ═══════════════════════════════════════════════════════════════
// ACTIVATE LICENSE
// ═══════════════════════════════════════════════════════════════

function handleActivateLicense(data) {
  const email = data.email;
  const licenseKey = data.licenseKey;

  if (!email || !licenseKey) {
    return jsonResponse({ status: 'error', message: '❌ Введите email и ключ' });
  }

  const userRow = findUserRow(email);
  if (userRow < 0) {
    return jsonResponse({ status: 'error', message: '❌ Пользователь не найден' });
  }

  const licenseRow = findLicenseRow(licenseKey);
  if (licenseRow < 0) {
    return jsonResponse({ status: 'error', message: '❌ Ключ не найден' });
  }

  const licenseSheet = getLicensesSheet();
  const licenseData = licenseSheet.getRange(licenseRow, 1, 1, 3).getValues()[0];
  const used = licenseData[1];
  const assignedTo = licenseData[2] || '';

  if (used === true || used === 'TRUE' || used === 1) {
    if (assignedTo.toLowerCase().trim() === email.toLowerCase().trim()) {
      return jsonResponse({ status: 'ok', message: '✅ Ключ уже на вашем аккаунте' });
    }
    return jsonResponse({ status: 'error', message: '❌ Ключ использован другим' });
  }

  const now = new Date();
  const licenseDays = getConfig('license_days', 180);
  const expiresAt = new Date(now.getTime() + licenseDays * 24 * 60 * 60 * 1000);

  updateUser(userRow, 3, licenseKey);
  updateUser(userRow, 4, now);
  updateUser(userRow, 5, expiresAt);

  licenseSheet.getRange(licenseRow, 2).setValue(true);
  licenseSheet.getRange(licenseRow, 3).setValue(email);

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
// CHECK LICENSE
// ═══════════════════════════════════════════════════════════════

function handleCheckLicense(data) {
  const email = data.email;
  if (!email) return jsonResponse({ status: 'error', message: '❌ Нет email' });

  const userRow = findUserRow(email);
  if (userRow < 0) return jsonResponse({ status: 'error', message: '❌ Пользователь не найден' });

  const user = getUserData(userRow);
  const hasLicense = !!user.licenseKey;
  const expired = user.expiresAt ? new Date(user.expiresAt) < new Date() : true;
  const globalMax = getConfig('max_devices', 1);
  let maxDevices = parseInt(user.maxDevices, 10);
  if (isNaN(maxDevices) || maxDevices <= 0) maxDevices = globalMax;

  if (!hasLicense) {
    return jsonResponse({ status: 'ok', hasLicense: false, maxDevices: maxDevices });
  }

  return jsonResponse({
    status: 'ok',
    message: expired ? '❌ Срок истёк' : '✅ Лицензия активна',
    hasLicense: true,
    isExpired: expired,
    licenseKey: user.licenseKey,
    activatedAt: user.activatedAt,
    expiresAt: user.expiresAt,
    daysLeft: expired ? 0 : Math.ceil((new Date(user.expiresAt) - Date.now()) / (1000 * 60 * 60 * 24)),
    maxDevices: maxDevices
  });
}

// ═══════════════════════════════════════════════════════════════
// REMOVE DEVICE
// ═══════════════════════════════════════════════════════════════

function handleRemoveDevice(data) {
  const email = data.email;
  const deviceToken = data.deviceToken;

  if (!email) return jsonResponse({ status: 'error', message: '❌ Нет email' });

  const userRow = findUserRow(email);
  if (userRow < 0) return jsonResponse({ status: 'error', message: '❌ Пользователь не найден' });

  const user = getUserData(userRow);
  let tokens = user.deviceTokens ? user.deviceTokens.toString().split('|') : [];
  tokens = tokens.filter(t => t && t.trim());

  if (tokens.length === 0) {
    return jsonResponse({ status: 'error', message: '❌ Нет устройств' });
  }

  if (deviceToken && tokens.includes(deviceToken)) {
    tokens = tokens.filter(t => t !== deviceToken);
  } else {
    tokens.pop(); // удаляем последнее
  }

  updateUser(userRow, 7, tokens.join('|'));
  updateUser(userRow, 8, tokens.length);

  logEvent('DEVICE_REMOVED', email, `Remaining: ${tokens.length}`);

  return jsonResponse({
    status: 'ok',
    message: '✅ Устройство удалено',
    remainingDevices: tokens.length
  });
}

// ═══════════════════════════════════════════════════════════════
// ADMIN: Генерация ключей
// ═══════════════════════════════════════════════════════════════

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

function generateLicenseKeys(count) {
  count = count || 10;
  const sheet = getLicensesSheet();
  for (let i = 0; i < count; i++) {
    sheet.appendRow([generateKey(), false, '']);
  }
  console.log('✅ Generated', count, 'keys');
}

function generate500Keys() {
  const sheet = getLicensesSheet();
  const existing = new Set();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) existing.add(data[i][0]);
  }

  const keys = [];
  let generated = 0;
  while (generated < 500) {
    const key = generateKey();
    if (!existing.has(key)) {
      keys.push([key, false, '']);
      existing.add(key);
      generated++;
    }
  }

  // batch insert
  const BATCH = 100;
  for (let i = 0; i < keys.length; i += BATCH) {
    const batch = keys.slice(i, i + BATCH);
    sheet.getRange(sheet.getLastRow() + 1, 1, batch.length, 3).setValues(batch);
  }

  console.log('✅ Generated', generated, 'keys');
  return generated;
}
