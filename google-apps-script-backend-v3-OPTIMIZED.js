/**
* ═══════════════════════════════════════════════════════════════
* CUTSY LICENSE SERVER v3.0 — Optimized & Secure
* ═══════════════════════════════════════════════════════════════
* 
* Листы:
*   users:    email | password_hash | license_key | activated_at | expires_at | created_at | device_tokens | device_count | max_devices
*   licenses: key | used | assigned_to
*   config:   key | value
*   logs:     timestamp | action | email | detail
* 
* 🔐 НАСТРОЙКА ПЕРЕД ЗАПУСКОМ:
* 1. В меню редактора: Выполнить → setupSecrets (один раз)
* 2. Или вручную в Свойства скрипта добавь:
*    TG_BOT_TOKEN = твой_токен
*    TG_CHAT_ID = 358002688
*    ADMIN_EMAIL = cutsypro@gmail.com
*/

// ═══════════════════════════════════════════════════════════════
// КОНФИГ & ГЛОБАЛЬНЫЙ КЭШ
// ═══════════════════════════════════════════════════════════════

const SHEET_USERS    = 'users';
const SHEET_LICENSES = 'licenses';
const SHEET_CONFIG   = 'config';
const SHEET_LOGS     = 'logs';

let TG_BOT_TOKEN = '';
let TG_CHAT_ID = '';
let ADMIN_EMAIL = 'cutsypro@gmail.com';

// Внутренний кэш (живёт в рамках одного выполнения скрипта)
let _sheetsCache = {};
let _configCache = {};
let _userEmailCache = null;

// ═══════════════════════════════════════════════════════════════
// ИНИЦИАЛИЗАЦИЯ СЕКРЕТОВ
// ═══════════════════════════════════════════════════════════════

function setupSecrets() {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('TG_BOT_TOKEN', '8526541616:AAEwEZzd4jrwjNgiSqwjLUR_c8GyGTrfPiE');
  props.setProperty('TG_CHAT_ID', '358002688');
  props.setProperty('ADMIN_EMAIL', 'cutsypro@gmail.com');
  Logger.log('✅ Секреты сохранены в PropertiesService');
}

function loadSecrets() {
  const props = PropertiesService.getScriptProperties();
  TG_BOT_TOKEN = props.getProperty('TG_BOT_TOKEN') || '';
  TG_CHAT_ID = props.getProperty('TG_CHAT_ID') || '';
  ADMIN_EMAIL = props.getProperty('ADMIN_EMAIL') || 'cutsypro@gmail.com';
}

// ═══════════════════════════════════════════════════════════════
// 🚀 ОПТИМИЗАЦИЯ: КЭШ ЛИСТОВ И ДАННЫХ
// ═══════════════════════════════════════════════════════════════

function initSheets() {
  if (Object.keys(_sheetsCache).length === 0) {
    _sheetsCache = {
      users: ensureSheet(SHEET_USERS, ['email','password_hash','license_key','activated_at','expires_at','created_at','device_tokens','device_count','max_devices','is_trial']),
      licenses: ensureSheet(SHEET_LICENSES, ['key','used','assigned_to']),
      config: ensureSheet(SHEET_CONFIG, ['key','value']),
      logs: ensureSheet(SHEET_LOGS, ['timestamp','action','email','detail'])
    };
  }
  return _sheetsCache;
}

function ensureSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers) sheet.appendRow(headers);
  } else if (headers) {
    // 🔥 Если лист уже есть — проверяем и добавляем недостающие заголовки
    const lastCol = sheet.getLastColumn();
    const expectedHeaders = headers.length;
    if (lastCol < expectedHeaders) {
      // Добавляем недостающие заголовки
      const existingHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      const newHeaders = [];
      for (let i = lastCol; i < expectedHeaders; i++) {
        newHeaders.push(headers[i]);
      }
      if (newHeaders.length > 0) {
        sheet.getRange(1, lastCol + 1, 1, newHeaders.length).setValues([newHeaders]);
        console.log(`✅ Добавлены заголовки в лист ${name}: ${newHeaders.join(', ')}`);
      }
    }
  }
  return sheet;
}

// 🔥 Быстрый поиск пользователя (читает только столбец A)
function findUserRow(email) {
  const search = email.toLowerCase().trim();
  
  const sheet = initSheets().users;
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return -1;
  const emails = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < emails.length; i++) {
    if (emails[i][0] && emails[i][0].toString().toLowerCase().trim() === search) {
      return i + 2;
    }
  }
  return -1;
}

function getUserData(rowIndex) {
  const sheet = initSheets().users;
  const row = sheet.getRange(rowIndex, 1, 1, 10).getValues()[0];
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
    isTrial:      row[9] === true || row[9] === 'TRUE' || row[9] === 1,
    rowIndex:     rowIndex
  };
}

function updateUser(rowIndex, col, value) {
  initSheets().users.getRange(rowIndex, col).setValue(value);
}

// 🔥 Быстрый поиск свободного ключа (читает только A и B)
function findFreeLicense() {
  const sheet = initSheets().licenses;
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return null;
  const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (let i = 0; i < data.length; i++) {
    const used = data[i][1];
    if (!used || used === false || used === 'FALSE' || used === 0 || used === '') {
      return { key: data[i][0], rowIndex: i + 2 };
    }
  }
  return null;
}

// 🔥 Поиск ключа в таблице licenses
function findLicenseRow(key) {
  const sheet = initSheets().licenses;
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return -1;
  const data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === key) return i + 2;
  }
  return -1;
}

// 🔥 Конфиг с кэшем
function getConfig(key, defaultValue) {
  if (_configCache[key] !== undefined) return _configCache[key];
  
  const scriptCache = CacheService.getScriptCache();
  const cacheKey = 'cfg_' + key;
  const cached = scriptCache.get(cacheKey);
  if (cached !== null) {
    const val = cached === '__NULL__' ? defaultValue : cached;
    _configCache[key] = val;
    return val;
  }
  
  try {
    const sheet = initSheets().config;
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
      for (let i = 0; i < data.length; i++) {
        if (data[i][0] && data[i][0].toString().trim() === key) {
          let val = data[i][1];
          if (!isNaN(val) && val !== '') val = parseInt(val, 10);
          _configCache[key] = val;
          scriptCache.put(cacheKey, val === null ? '__NULL__' : val.toString(), 21600);
          return val;
        }
      }
    }
  } catch (e) { console.error('getConfig error:', e); }
  
  _configCache[key] = defaultValue;
  return defaultValue;
}

function logEvent(action, email, detail) {
  try {
    initSheets().logs.appendRow([new Date().toISOString(), action, email || '', detail || '']);
  } catch (e) { console.error('logEvent error:', e); }
}

// ═══════════════════════════════════════════════════════════════
// УТИЛИТЫ
// ═══════════════════════════════════════════════════════════════

// 🔐 Настоящий SHA-256
function sha256(str) {
  try {
    const salt = 'cutsy_salt_v3_' + str.length;
    const rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str + salt);
    return rawHash.map(b => ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2)).join('');
  } catch (e) {
    console.error('Hash error:', e);
    return Utilities.base64Encode(str + 'cutsy_fallback').replace(/[^a-zA-Z0-9]/g, '').slice(0, 64);
  }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateSessionToken() {
  return Utilities.getUuid() + '_' + Date.now().toString(36);
}

function jsonResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function doOptions(e) {
  const output = ContentService.createTextOutput('');
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

// 🛡️ Лимит запросов (защита от брутфорса)
function checkRateLimit(identifier, maxRequests, windowSeconds) {
  maxRequests = maxRequests || 10;
  windowSeconds = windowSeconds || 60;
  const cache = CacheService.getUserCache();
  const key = 'rate_' + identifier;
  const current = cache.get(key);
  if (current) {
    const data = JSON.parse(current);
    if (Date.now() - data.startTime < windowSeconds * 1000) {
      if (data.count >= maxRequests) return false;
      data.count++;
      cache.put(key, JSON.stringify(data), windowSeconds);
      return true;
    }
  }
  cache.put(key, JSON.stringify({count: 1, startTime: Date.now()}), windowSeconds);
  return true;
}

// ═══════════════════════════════════════════════════════════════
// TELEGRAM
// ═══════════════════════════════════════════════════════════════

function sendTelegram(text) {
  try {
    loadSecrets();
    if (!TG_BOT_TOKEN) return console.error('❌ TG_BOT_TOKEN not configured');
    const url = 'https://api.telegram.org/bot' + TG_BOT_TOKEN + '/sendMessage';
    UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ chat_id: TG_CHAT_ID, text: text, parse_mode: 'Markdown' })
    });
    console.log('✅ Telegram sent');
  } catch (e) { console.error('❌ Telegram error:', e.message); }
}

function sendTelegramWithButton(text, buttonText, buttonUrl) {
  try {
    loadSecrets();
    if (!TG_BOT_TOKEN) return sendTelegram(text + '\n\n[Отправить письмо](' + buttonUrl + ')');
    const url = 'https://api.telegram.org/bot' + TG_BOT_TOKEN + '/sendMessage';
    const payload = {
      chat_id: TG_CHAT_ID, text: text,
      reply_markup: JSON.stringify({ inline_keyboard: [[{ text: buttonText, url: buttonUrl }]] })
    };
    UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload) });
  } catch (e) {
    console.error('❌ Telegram button error:', e.message);
    sendTelegram(text + '\n\n[Отправить письмо](' + buttonUrl + ')');
  }
}

// ═══════════════════════════════════════════════════════════════
// ОБРАБОТЧИКИ
// ═══════════════════════════════════════════════════════════════

function doPost(e) {
  try {
    loadSecrets();
    initSheets();
    const data = parsePayload(e);
    const identifier = e.parameter && e.parameter.ip ? e.parameter.ip : (data && data.email ? data.email : 'unknown');
    if (!checkRateLimit(identifier)) {
      return jsonResponse({ status: 'error', message: '⚠️ Слишком много запросов. Попробуйте позже.' });
    }
    console.log('🔥 doPost action:', data ? data.action : 'null');
    if (!data || !data.action) return jsonResponse({ status: 'error', message: 'Missing action' });
    switch (data.action) {
      case 'register':         return handleRegister(data);
      case 'login':            return handleLogin(data);
      case 'activate-license': return handleActivateLicense(data);
      case 'check-license':    return handleCheckLicense(data);
      case 'remove-device':    return handleRemoveDevice(data);
      default: return jsonResponse({ status: 'error', message: 'Unknown action' });
    }
  } catch (error) {
    console.error('Server error:', error);
    return jsonResponse({ status: 'error', message: 'Server error: ' + error.message });
  }
}

function doGet(e) {
  loadSecrets();
  initSheets();
  if (e && e.parameter && e.parameter.action === 'form') return showRegistrationForm();
  return jsonResponse({ status: 'ok', message: 'Cutsy License Server v3.0 is running', timestamp: new Date().toISOString() });
}

// ═══════════════════════════════════════════════════════════════
// HTML ФОРМА РЕГИСТРАЦИИ
// ═══════════════════════════════════════════════════════════════

function showRegistrationForm() {
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Регистрация Cutsy CAD PRO</title><style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.container{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:32px;max-width:420px;width:100%;backdrop-filter:blur(10px)}h1{color:#00d4aa;font-size:24px;margin-bottom:8px;text-align:center}.subtitle{color:#888;font-size:14px;text-align:center;margin-bottom:24px}.form-group{margin-bottom:20px}label{display:block;color:#ccc;font-size:13px;margin-bottom:8px;font-weight:500}input,select{width:100%;padding:12px 16px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#fff;font-size:15px;transition:all 0.3s}input:focus,select:focus{outline:none;border-color:#00d4aa;background:rgba(255,255,255,0.12)}select option{background:#1a1a2e;color:#fff}button{width:100%;padding:14px;background:linear-gradient(135deg,#00d4aa 0%,#00b894 100%);color:#000;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;transition:transform 0.2s,box-shadow 0.2s}button:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,212,170,0.3)}button:disabled{opacity:0.6;cursor:not-allowed;transform:none}.error{color:#ff6b6b;font-size:13px;margin-top:8px;display:none}.success{background:rgba(0,212,170,0.15);border:1px solid #00d4aa;border-radius:12px;padding:24px;text-align:center}.success h2{color:#00d4aa;font-size:22px;margin-bottom:12px}.success p{color:#ccc;font-size:14px;line-height:1.6;margin-bottom:16px}.next-step{margin-top:20px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.1)}.next-step a{color:#00d4aa;text-decoration:none;font-weight:600}.next-step a:hover{text-decoration:underline}.loading{display:inline-block;width:20px;height:20px;border:2px solid rgba(0,0,0,0.3);border-top-color:#000;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:8px;vertical-align:middle}@keyframes spin{to{transform:rotate(360deg)}}
</style></head><body><div class="container"><div id="formContainer"><h1>🔐 Регистрация</h1><p class="subtitle">Cutsy CAD PRO — Создание аккаунта</p><form id="regForm" onsubmit="handleSubmit(event)"><div class="form-group"><label for="email">📧 Email</label><input type="email" id="email" name="email" placeholder="your@email.com" required></div><div class="form-group"><label for="password">🔑 Пароль</label><input type="password" id="password" name="password" placeholder="Минимум 6 символов" minlength="6" required></div><div class="form-group"><label for="password2">🔑 Повторите пароль</label><input type="password" id="password2" name="password2" placeholder="Повторите пароль" minlength="6" required></div><div class="form-group"><label for="licenseType">📅 Выберите тариф</label><select id="licenseType" name="licenseType" required><option value="">-- Выберите тариф --</option><option value="1 месяц">1 месяц — 300 ₽</option><option value="6 месяцев">6 месяцев — 1 700 ₽</option><option value="1 год">1 год — 3 200 ₽ (2 устройства)</option></select></div><div id="error" class="error"></div><button type="submit" id="submitBtn"><span id="btnText">Зарегистрироваться и оплатить</span></button></form></div><div id="successContainer" style="display:none;"><div class="success"><h2>✅ Регистрация успешна!</h2><p>Ваш аккаунт создан.</p><p style="font-size:14px;color:#00d4aa;margin:16px 0;">📧 Код лицензии будет отправлен вам на указанный электронный адрес</p><p style="font-size:13px;color:#888;margin-bottom:20px;">После получения ключа вернитесь в программу для активации.</p><div class="next-step"><button onclick="window.location.href='https://cutsypro.ru'" style="margin-bottom:12px;background:linear-gradient(135deg,#00d4aa 0%,#00b894 100%);color:#000;border:none;border-radius:8px;padding:14px;font-size:15px;font-weight:600;cursor:pointer;width:100%;">🔑 Открыть программу</button><p style="margin-top:16px;color:#888;font-size:12px;">💬 Поддержка: <a href="https://t.me/SilikinK" target="_blank">@SilikinK</a></p></div></div></div></div><script>function handleSubmit(e){e.preventDefault();var b=document.getElementById('submitBtn'),bt=document.getElementById('btnText'),er=document.getElementById('error'),fd=new FormData(e.target),d={email:fd.get('email'),password:fd.get('password'),password2:fd.get('password2'),licenseType:fd.get('licenseType')};if(d.password!==d.password2){er.textContent='❌ Пароли не совпадают';er.style.display='block';return}b.disabled=true;bt.innerHTML='<span class="loading"></span>Регистрация...';er.style.display='none';google.script.run.withSuccessHandler(function(r){if(r.status==='ok'){document.getElementById('formContainer').style.display='none';document.getElementById('successContainer').style.display='block'}else{er.textContent='❌ '+r.message;er.style.display='block';b.disabled=false;bt.textContent='Зарегистрироваться'}}).withFailureHandler(function(err){er.textContent='❌ Ошибка соединения: '+err.message;er.style.display='block';b.disabled=false;bt.textContent='Зарегистрироваться'}).handleFormRegister(d)}</script></body></html>`;
  return HtmlService.createHtmlOutput(html).setTitle('Регистрация Cutsy CAD PRO').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ═══════════════════════════════════════════════════════════════
// REGISTER (для формы)
// ═══════════════════════════════════════════════════════════════

function handleFormRegister(data) {
  loadSecrets();
  initSheets();
  const email = data.email;
  const password = data.password;
  const password2 = data.password2;
  const licenseType = data.licenseType || '1 месяц';
  console.log('🔥 handleFormRegister:', { email, licenseType });
  
  if (!email || !password) return { status: 'error', message: '❌ Введите email и пароль' };
  if (!isValidEmail(email)) return { status: 'error', message: '❌ Неверный формат email' };
  if (password !== password2) return { status: 'error', message: '❌ Пароли не совпадают' };
  if (password.length < 6) return { status: 'error', message: '❌ Пароль минимум 6 символов' };
  
  const validLicenses = ['1 неделя', '1 месяц', '6 месяцев', '1 год'];
  if (!validLicenses.includes(licenseType)) return { status: 'error', message: '❌ Неверный тариф' };
  
  // ═══════════════════════════════════════════════════════
  // ОБЪЯВЛЯЕМ ПЕРЕМЕННЫЕ ПЕРЕД ПРОВЕРКОЙ (нужны для обновления тарифа)
  // ═══════════════════════════════════════════════════════
  const now = new Date();
  let licenseDays = licenseType === '1 неделя' ? 7 : licenseType === '1 месяц' ? 30 : licenseType === '6 месяцев' ? 180 : 365;
  const expiresAt = new Date(now.getTime() + licenseDays * 24 * 60 * 60 * 1000);
  const defaultMaxDevices = licenseType === '1 год' ? 2 : 1;
  const isTrial = licenseType === '1 неделя';
  let price = licenseType === '1 неделя' ? 'БЕСПЛАТНО' : licenseType === '1 месяц' ? '300 ₽' : licenseType === '6 месяцев' ? '1 700 ₽' : '3 200 ₽';
  
  // ═══════════════════════════════════════════════════════
  // ПРОВЕРКА: если email уже есть — обновляем пробный аккаунт
  // ═══════════════════════════════════════════════════════
  const existingRow = findUserRow(email);
  if (existingRow > 0) {
    const existingUser = getUserData(existingRow);
    
    // Если это был пробный тариф с ключом — обновляем на платный
    if (existingUser.isTrial === true && existingUser.licenseKey !== '') {
      // Обновляем данные
      updateUser(existingRow, 5, expiresAt);  // expires_at
      updateUser(existingRow, 9, defaultMaxDevices);  // max_devices
      // is_trial НЕ меняем (будет false после активации ключа админом)
      
      logEvent('TARIFF_UPGRADE', email, 'Trial → ' + licenseType);
      
      // Отправляем письмо админу
      try {
        MailApp.sendEmail({ 
          to: ADMIN_EMAIL, 
          subject: '🔄 Обновление тарифа Cutsy CAD PRO', 
          body: `📧 Email: ${email}\n📅 Старый тариф: Пробный (1 неделя)\n📅 Новый тариф: ${licenseType}\n💰 ${price}\n⏱ ${licenseDays} дней\n🔑 Ключ: ${existingUser.licenseKey}\n\n✅ Ключ остался тот же. Проверьте оплату и отправьте ключ клиенту.` 
        });
        console.log('✅ Email отправлен админу (обновление тарифа)');
      } catch (e) { 
        console.error('❌ Email error:', e.message); 
      }
      
      // Отправляем письмо клиенту
      try {
        const htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
          <tr><td style="background:#1a2a4a;padding:40px 30px;text-align:center;">
            <h1 style="margin:0;color:#00d4aa;font-size:28px;font-weight:bold;">Cutsy CAD PRO</h1>
            <p style="margin:10px 0 0;color:#ccc;font-size:14px;">Веб-приложение для проектирования и раскладки</p>
          </td></tr>
          <tr><td style="padding:40px 30px;">
            <h2 style="margin:0 0 20px;color:#00d4aa;font-size:22px;">✅ Тариф обновлён!</h2>
            <p style="margin:0 0 10px;color:#333;font-size:15px;line-height:1.6;">Здравствуйте!</p>
            <p style="margin:0 0 30px;color:#333;font-size:15px;line-height:1.6;">Вы успешно обновили тариф с пробного на ${licenseType}.</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 30px;background:#fff8e1;border:1px solid #ffa726;border-radius:8px;">
              <tr><td style="padding:20px;">
                <p style="margin:0 0 10px;color:#e65100;font-size:16px;font-weight:bold;">💰 Тариф: ${licenseType}</p>
                <p style="margin:0 0 20px;color:#e65100;font-size:16px;">💵 Сумма: ${price}</p>
                <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;margin:0 0 20px;">
                  <tr><td align="center" style="padding:20px;">
                    <img src="https://drive.google.com/uc?export=view&id=1DlZdfxkNN3aZDv8rWrNqKZeZEt4vNzsX" alt="QR-код для оплаты" style="max-width:200px;height:auto;border:2px solid #ffa726;border-radius:8px;">
                  </td></tr>
                </table>
                <p style="margin:0;color:#e65100;font-size:14px;">🏦 Реквизиты:</p>
                <p style="margin:5px 0 0;color:#e65100;font-size:14px;">Карта: 2200 0000 0000 0000</p>
                <p style="margin:10px 0 0;color:#e65100;font-size:14px;">После оплаты пришлите скриншот:</p>
                <p style="margin:5px 0 0;color:#e65100;font-size:14px;"><a href="https://t.me/SilikinK" style="color:#e65100;text-decoration:none;font-weight:bold;">Telegram: @SilikinK</a></p>
                <p style="margin:20px 0 0;color:#e65100;font-size:14px;font-weight:bold;">⚠️ Ваш лицензионный ключ остался тот же: ${existingUser.licenseKey}</p>
              </td></tr>
            </table>
            <p style="margin:0 0 10px;color:#333;font-size:15px;">Если у вас есть вопросы, свяжитесь с нами:</p>
            <p style="margin:0 0 30px;color:#0096ff;font-size:15px;">
              📧 <a href="mailto:cutsypro@gmail.com" style="color:#0096ff;text-decoration:none;">cutsypro@gmail.com</a><br>
              ✈️ Telegram: <a href="https://t.me/SilikinK" style="color:#0096ff;text-decoration:none;">@SilikinK</a>
            </p>
            <p style="margin:0 0 0;color:#333;font-size:15px;">Спасибо, что выбрали Cutsy CAD PRO!</p>
          </td></tr>
          <tr><td style="background:#f5f5f5;padding:20px 30px;text-align:center;border-top:1px solid #eee;">
            <p style="margin:0;color:#888;font-size:12px;">© 2025 Cutsy CAD PRO. Все права защищены.</p>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
    
        MailApp.sendEmail({ 
          to: email,
          subject: 'Cutsy CAD PRO — Тариф обновлён',
          htmlBody: htmlBody
        });
        console.log('✅ Email отправлен клиенту (обновление тарифа)');
      } catch (e) { 
        console.error('❌ Email клиент error:', e.message); 
      }
      
      return { 
        status: 'ok', 
        message: '✅ Тариф обновлён! Ожидайте проверки оплаты.', 
        email: email, 
        licenseType: licenseType, 
        licenseDays: licenseDays, 
        licenseKey: existingUser.licenseKey,  // Старый ключ
        activatedAt: existingUser.activatedAt, 
        expiresAt: expiresAt.toISOString(), 
        maxDevices: defaultMaxDevices,
        isTrial: false
      };
    }
    
    // Если уже платный аккаунт — не даем дублироваться
    return { status: 'error', message: '❌ Аккаунт уже активный. Если хотите сменить тариф — обратитесь в поддержку.' };
  }
  
  const passwordHash = sha256(password);
  
  initSheets().users.appendRow([email.toLowerCase().trim(), passwordHash, '', '', expiresAt, now, '', 0, defaultMaxDevices, isTrial]);
  
  const freeKey = findFreeLicense();
  let assignedKey = null;
  if (freeKey) {
    const userRow = findUserRow(email);
    if (userRow > 0) { 
      updateUser(userRow, 3, freeKey.key); 
      updateUser(userRow, 4, now); 
      updateUser(userRow, 5, expiresAt); 
      updateUser(userRow, 9, defaultMaxDevices); 
    }
    initSheets().licenses.getRange(freeKey.rowIndex, 2).setValue(true);
    initSheets().licenses.getRange(freeKey.rowIndex, 3).setValue(email);
    assignedKey = freeKey.key;
    logEvent('KEY_ASSIGNED', email, assignedKey + ' | ' + licenseType);
  } else {
    logEvent('NO_FREE_KEY', email, 'No free keys'); 
  }
  
  logEvent('REGISTER', email, licenseType);
  
  // Для пробного тарифа — сразу выдаём ключ, для платных — ждём оплаты
  if (licenseType === '1 неделя' && freeKey) {
    console.log('✅ Пробный тариф — ключ выдаётся автоматически');
  } else if (licenseType !== '1 неделя' && !freeKey) {
    logEvent('NO_FREE_KEY', email, 'No free keys'); 
  }
  
  try {
    MailApp.sendEmail({ 
      to: ADMIN_EMAIL, 
      subject: '🔔 Новая регистрация Cutsy CAD PRO', 
      body: `📧 Email: ${email}\n📅 Тариф: ${licenseType}\n💰 ${price}\n⏱ ${licenseDays} дней\n🔑 Ключ: ${assignedKey || 'Нет свободных ключей'}\n📅 Дата: ${now.toLocaleString('ru-RU')}\n\n────────────────────────────\nСледующие шаги:\n1. Проверьте оплату от клиента\n2. Отправьте инструкцию по активации\n3. Ключ уже записан в таблицу users (столбец C)` 
    });
    console.log('✅ Email отправлен админу');
  } catch (e) { 
    console.error('❌ Email error:', e.message); 
  }
  
  // ═══════════════════════════════════════════════════════
  // ОТПРАВКА ПИСЬМА КЛИЕНТУ С КРАСИВЫМ HTML-ДИЗАЙНОМ
  // ═══════════════════════════════════════════════════════
  try {
    const htmlBody = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Регистрация успешна</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
          
          <!-- Шапка -->
          <tr>
            <td style="background:#1a2a4a;padding:40px 30px;text-align:center;">
              <h1 style="margin:0;color:#00d4aa;font-size:28px;font-weight:bold;">Cutsy CAD PRO</h1>
              <p style="margin:10px 0 0;color:#ccc;font-size:14px;">Веб-приложение для проектирования и раскладки</p>
            </td>
          </tr>
          
          <!-- Тело -->
          <tr>
            <td style="padding:40px 30px;">
              <h2 style="margin:0 0 20px;color:#00d4aa;font-size:22px;">✅ Регистрация успешна!</h2>
              <p style="margin:0 0 10px;color:#333;font-size:15px;line-height:1.6;">Здравствуйте!</p>
              <p style="margin:0 0 30px;color:#333;font-size:15px;line-height:1.6;">Вы успешно зарегистрировались в Cutsy CAD PRO.</p>
              
              <!-- Инфо-блок -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 30px;background:#f0fdf4;border:1px solid #00d4aa;border-radius:8px;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0;color:#006400;font-size:15px;line-height:1.6;">⏰ После оплаты вам будет отправлен лицензионный ключ для активации PRO-версии.</p>
                  </td>
                </tr>
              </table>
              
              ${isTrial ? `
              <!-- Пробный тариф - показать ключ -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 30px;background:#e8f5e9;border:1px solid #00d4aa;border-radius:8px;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0 0 10px;color:#006400;font-size:16px;font-weight:bold;">✅ Ваш лицензионный ключ:</p>
                    <p style="margin:0;color:#006400;font-size:18px;font-family:monospace;background:#fff;padding:12px;border-radius:4px;text-align:center;">${assignedKey}</p>
                  </td>
                </tr>
              </table>
              ` : `
              <!-- Платный тариф - показать тариф, сумму и QR-код -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 30px;background:#fff8e1;border:1px solid #ffa726;border-radius:8px;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0 0 10px;color:#e65100;font-size:16px;font-weight:bold;">💰 Тариф: ${licenseType}</p>
                    <p style="margin:0 0 20px;color:#e65100;font-size:16px;">💵 Сумма: ${price}</p>
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;margin:0 0 20px;">
                      <tr>
                        <td align="center" style="padding:20px;">
                          <img src="https://drive.google.com/uc?export=view&id=1DlZdfxkNN3aZDv8rWrNqKZeZEt4vNzsX" alt="QR-код для оплаты" style="max-width:200px;height:auto;border:2px solid #ffa726;border-radius:8px;">
                        </td>
                      </tr>
                    </table>
                    <p style="margin:10px 0 0;color:#e65100;font-size:14px;">После оплаты пришлите скриншот для ускоренной отправки лицензионного ключа:</p>
                    <p style="margin:5px 0 0;color:#e65100;font-size:14px;"><a href="https://t.me/SilikinK" style="color:#e65100;text-decoration:none;font-weight:bold;">Telegram: @SilikinK</a></p>
                  </td>
                </tr>
              </table>
              `}
              
              <!-- Контакты -->
              <p style="margin:0 0 10px;color:#333;font-size:15px;">Если у вас есть вопросы, свяжитесь с нами:</p>
              <p style="margin:0 0 30px;color:#0096ff;font-size:15px;">
                📧 <a href="mailto:cutsypro@gmail.com" style="color:#0096ff;text-decoration:none;">cutsypro@gmail.com</a><br>
                ✈️ Telegram: <a href="https://t.me/SilikinK" style="color:#0096ff;text-decoration:none;">@SilikinK</a>
              </p>
              
              <p style="margin:0 0 0;color:#333;font-size:15px;">Спасибо, что выбрали Cutsy CAD PRO!</p>
            </td>
          </tr>
          
          <!-- Футер -->
          <tr>
            <td style="background:#f5f5f5;padding:20px 30px;text-align:center;border-top:1px solid #eee;">
              <p style="margin:0;color:#888;font-size:12px;">© 2025 Cutsy CAD PRO. Все права защищены.</p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
    
    MailApp.sendEmail({ 
      to: email,
      subject: 'Cutsy CAD PRO — Регистрация успешна',
      htmlBody: htmlBody
    });
    console.log('✅ Email отправлен клиенту');
  } catch (e) { 
    console.error('❌ Email клиент error:', e.message); 
  }
  
  return { 
    status: 'ok', 
    message: '✅ Регистрация успешна!', 
    email: email, 
    licenseType: licenseType, 
    licenseDays: licenseDays, 
    licenseKey: assignedKey, 
    activatedAt: assignedKey ? now.toISOString() : null, 
    expiresAt: expiresAt.toISOString(), 
    maxDevices: defaultMaxDevices,
    isTrial: isTrial
  };
}

// ═══════════════════════════════════════════════════════════════
// REGISTER (для API)
// ═══════════════════════════════════════════════════════════════

function handleRegister(data) {
  const email = data.email;
  const password = data.password;
  const licenseType = data.licenseType || '1 неделя';
  console.log('🔥 handleRegister:', { email, licenseType });
  
  if (!email || !password) return jsonResponse({ status: 'error', message: '❌ Введите email и пароль' });
  if (!isValidEmail(email)) return jsonResponse({ status: 'error', message: '❌ Неверный формат email' });
  if (password.length < 6) return jsonResponse({ status: 'error', message: '❌ Пароль минимум 6 символов' });
  if (!['1 неделя', '1 месяц', '6 месяцев', '1 год'].includes(licenseType)) return jsonResponse({ status: 'error', message: '❌ Неверный тариф' });
  
  // ═══════════════════════════════════════════════════════
  // ОБЪЯВЛЯЕМ ПЕРЕМЕННЫЕ ПЕРЕД ПРОВЕРКОЙ (нужны для обновления тарифа)
  // ═══════════════════════════════════════════════════════
  const now = new Date();
  let licenseDays = licenseType === '1 неделя' ? 7 : licenseType === '1 месяц' ? 30 : licenseType === '6 месяцев' ? 180 : 365;
  const expiresAt = new Date(now.getTime() + licenseDays * 24 * 60 * 60 * 1000);
  const defaultMaxDevices = licenseType === '1 год' ? 2 : 1;
  const isTrial = licenseType === '1 неделя';
  
  // ═══════════════════════════════════════════════════════
  // ПРОВЕРКА: если email уже есть — обновляем пробный аккаунт
  // ═══════════════════════════════════════════════════════
  const existingRow = findUserRow(email);
  if (existingRow > 0) {
    const existingUser = getUserData(existingRow);
    
    // Если это был пробный тариф с ключом — обновляем на платный
    if (existingUser.isTrial === true && existingUser.licenseKey !== '') {
      // Обновляем данные
      updateUser(existingRow, 5, expiresAt);  // expires_at
      updateUser(existingRow, 9, defaultMaxDevices);  // max_devices
      
      logEvent('TARIFF_UPGRADE', email, 'Trial → ' + licenseType);
      
      return jsonResponse({ 
        status: 'ok', 
        message: '✅ Тариф обновлён! Ожидайте проверки оплаты.', 
        email: email, 
        licenseType: licenseType, 
        licenseDays: licenseDays, 
        licenseKey: existingUser.licenseKey,  // Старый ключ
        activatedAt: existingUser.activatedAt, 
        expiresAt: expiresAt.toISOString(), 
        maxDevices: defaultMaxDevices,
        isTrial: false
      });
    }
    
    // Если уже платный аккаунт — не даем дублироваться
    return jsonResponse({ status: 'error', message: '❌ Аккаунт уже активный. Если хотите сменить тариф — обратитесь в поддержку.' });
  }
  
  const passwordHash = sha256(password);
  
  initSheets().users.appendRow([email.toLowerCase().trim(), passwordHash, '', '', expiresAt, now, '', 0, defaultMaxDevices, isTrial]);
  
  const freeKey = findFreeLicense();
  let assignedKey = null;
  if (freeKey) {
    const userRow = findUserRow(email);
    if (userRow > 0) { 
      updateUser(userRow, 3, freeKey.key); 
      updateUser(userRow, 4, now); 
      updateUser(userRow, 5, expiresAt); 
      updateUser(userRow, 9, defaultMaxDevices); 
    }
    initSheets().licenses.getRange(freeKey.rowIndex, 2).setValue(true);
    initSheets().licenses.getRange(freeKey.rowIndex, 3).setValue(email);
    assignedKey = freeKey.key;
    logEvent('KEY_ASSIGNED', email, assignedKey + ' | ' + licenseType);
  } else {
    logEvent('NO_FREE_KEY', email, 'No free keys'); 
  }
  
  logEvent('REGISTER', email, licenseType);
  let price = licenseType === '1 неделя' ? 'БЕСПЛАТНО' : licenseType === '1 месяц' ? '300 ₽' : licenseType === '6 месяцев' ? '1 700 ₽' : '3 200 ₽';
  
  const tgText = assignedKey
    ? `🔔 *Новая регистрация Cutsy CAD PRO*\n\n📧 \`${email}\`\n🔑 \`${assignedKey}\`\n📅 Тариф: *${licenseType}*\n💰 ${price}\n⏱ ${licenseDays} дней\n📅 ${now.toLocaleString('ru-RU')}\n\n${licenseType === '1 неделя' ? '✅ Пробный период — ключ выдан автоматически' : '✉️ Отправьте ключ клиенту.'}`
    : `🔔 *Новая регистрация Cutsy CAD PRO*\n\n📧 \`${email}\`\n📅 Тариф: *${licenseType}*\n💰 ${price}\n⚠️ Ключей нет!\n📅 ${now.toLocaleString('ru-RU')}`;
  sendTelegram(tgText);
  
  // Для пробного тарифа — отправляем письмо клиенту с ключом
  // Для платного — отправляем письмо с QR-кодом
  try {
    const isTrial = licenseType === '1 неделя';
    const htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
          <tr><td style="background:#1a2a4a;padding:40px 30px;text-align:center;">
            <h1 style="margin:0;color:#00d4aa;font-size:28px;font-weight:bold;">Cutsy CAD PRO</h1>
            <p style="margin:10px 0 0;color:#ccc;font-size:14px;">Веб-приложение для проектирования и раскладки</p>
          </td></tr>
          <tr><td style="padding:40px 30px;">
            <h2 style="margin:0 0 20px;color:#00d4aa;font-size:22px;">✅ Регистрация успешна!</h2>
            <p style="margin:0 0 10px;color:#333;font-size:15px;line-height:1.6;">Здравствуйте!</p>
            <p style="margin:0 0 30px;color:#333;font-size:15px;line-height:1.6;">Вы успешно зарегистрировались в Cutsy CAD PRO.</p>
            ${isTrial && assignedKey ? `
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 30px;background:#e8f5e9;border:1px solid #00d4aa;border-radius:8px;">
              <tr><td style="padding:20px;">
                <p style="margin:0 0 10px;color:#006400;font-size:16px;font-weight:bold;">✅ Ваш лицензионный ключ:</p>
                <p style="margin:0;color:#006400;font-size:18px;font-family:monospace;background:#fff;padding:12px;border-radius:4px;text-align:center;">${assignedKey}</p>
              </td></tr>
            </table>
            ` : `
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 30px;background:#fff8e1;border:1px solid #ffa726;border-radius:8px;">
              <tr><td style="padding:20px;">
                <p style="margin:0 0 10px;color:#e65100;font-size:16px;font-weight:bold;">💰 Тариф: ${licenseType}</p>
                <p style="margin:0 0 20px;color:#e65100;font-size:16px;">💵 Сумма: ${price}</p>
                <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;margin:0 0 20px;">
                  <tr><td align="center" style="padding:20px;">
                    <img src="https://drive.google.com/uc?export=view&id=1DlZdfxkNN3aZDv8rWrNqKZeZEt4vNzsX" alt="QR-код для оплаты" style="max-width:200px;height:auto;border:2px solid #ffa726;border-radius:8px;">
                  </td></tr>
                </table>
                <p style="margin:10px 0 0;color:#e65100;font-size:14px;">После оплаты пришлите скриншот:</p>
                <p style="margin:5px 0 0;color:#e65100;font-size:14px;"><a href="https://t.me/SilikinK" style="color:#e65100;text-decoration:none;font-weight:bold;">Telegram: @SilikinK</a></p>
              </td></tr>
            </table>
            `}
            <p style="margin:0 0 10px;color:#333;font-size:15px;">Если у вас есть вопросы, свяжитесь с нами:</p>
            <p style="margin:0 0 30px;color:#0096ff;font-size:15px;">
              📧 <a href="mailto:cutsypro@gmail.com" style="color:#0096ff;text-decoration:none;">cutsypro@gmail.com</a><br>
              ✈️ Telegram: <a href="https://t.me/SilikinK" style="color:#0096ff;text-decoration:none;">@SilikinK</a>
            </p>
            <p style="margin:0 0 0;color:#333;font-size:15px;">Спасибо, что выбрали Cutsy CAD PRO!</p>
          </td></tr>
          <tr><td style="background:#f5f5f5;padding:20px 30px;text-align:center;border-top:1px solid #eee;">
            <p style="margin:0;color:#888;font-size:12px;">© 2025 Cutsy CAD PRO. Все права защищены.</p>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
    
    MailApp.sendEmail({ 
      to: email,
      subject: 'Cutsy CAD PRO — ' + (isTrial ? 'Регистрация успешна' : 'Ожидайте оплаты'),
      htmlBody: htmlBody
    });
    console.log('✅ Email отправлен клиенту');
  } catch (e) { 
    console.error('❌ Email клиент error:', e.message); 
  }
  
  return jsonResponse({ 
    status: 'ok', 
    message: '✅ Регистрация успешна!', 
    email: email, 
    licenseType: licenseType, 
    licenseDays: licenseDays, 
    licenseKey: assignedKey, 
    activatedAt: assignedKey ? now.toISOString() : null, 
    expiresAt: expiresAt.toISOString(), 
    maxDevices: defaultMaxDevices,
    isTrial: isTrial
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
  
  if (!email || !password) return jsonResponse({ status: 'error', message: '❌ Введите email и пароль' });
  
  const userRow = findUserRow(email);
  if (userRow < 0) return jsonResponse({ status: 'error', message: '❌ Пользователь не найден' });
  
  const user = getUserData(userRow);
  if (user.passwordHash !== sha256(password)) { 
    logEvent('LOGIN_FAILED', email); 
    return jsonResponse({ status: 'error', message: '❌ Неверный пароль' }); 
  }
  
  // Проверка срока лицензии
  if (user.expiresAt && new Date(user.expiresAt) < new Date()) { 
    logEvent('LOGIN_EXPIRED', email); 
    return jsonResponse({ status: 'error', message: '❌ Срок лицензии истёк', isExpired: true, expiresAt: user.expiresAt }); 
  }
  
  const globalMax = getConfig('max_devices', 1);
  let maxDevices = parseInt(user.maxDevices, 10) || globalMax;
  if (maxDevices <= 0) { maxDevices = globalMax; updateUser(userRow, 9, maxDevices); }
  
  let currentCount = parseInt(user.deviceCount, 10) || 0;
  
  if (deviceToken) {
    let tokens = user.deviceTokens ? user.deviceTokens.toString().split('|').filter(function(t){ return t.trim(); }) : [];
    if (tokens.indexOf(deviceToken) >= 0) {
      tokens = [deviceToken].concat(tokens.filter(function(t){ return t !== deviceToken; }));
      updateUser(userRow, 7, tokens.join('|')); 
      updateUser(userRow, 8, tokens.length); 
      currentCount = tokens.length;
    } else if (tokens.length < maxDevices) {
      tokens.push(deviceToken); 
      updateUser(userRow, 7, tokens.join('|')); 
      updateUser(userRow, 8, tokens.length); 
      currentCount = tokens.length; 
      logEvent('DEVICE_ADDED', email, tokens.length + '/' + maxDevices);
    } else {
      logEvent('DEVICE_LIMIT', email, tokens.length + '/' + maxDevices);
      return jsonResponse({ status: 'error', message: '❌ Лимит ' + maxDevices + ' устройств. Удалите старое.', deviceLimit: true, currentDevices: tokens.length, maxDevices: maxDevices });
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
    maxDevices: maxDevices,
    isTrial: user.isTrial
  });
}

// ═══════════════════════════════════════════════════════════════
// ACTIVATE / CHECK / REMOVE
// ═══════════════════════════════════════════════════════════════

function handleActivateLicense(data) {
  const email = data.email;
  const licenseKey = data.licenseKey;
  if (!email || !licenseKey) return jsonResponse({ status: 'error', message: '❌ Введите email и ключ' });
  
  const userRow = findUserRow(email);
  if (userRow < 0) return jsonResponse({ status: 'error', message: '❌ Пользователь не найден' });
  
  const licenseRow = findLicenseRow(licenseKey);
  if (licenseRow < 0) return jsonResponse({ status: 'error', message: '❌ Ключ не найден' });
  
  const ls = initSheets().licenses;
  const ld = ls.getRange(licenseRow, 1, 1, 3).getValues()[0];
  if (ld[1] === true || ld[1] === 'TRUE' || ld[1] === 1) {
    return (ld[2] && ld[2].toString().toLowerCase().trim() === email.toLowerCase().trim()) 
      ? jsonResponse({ status: 'ok', message: '✅ Ключ уже на вашем аккаунте' }) 
      : jsonResponse({ status: 'error', message: '❌ Ключ использован другим' });
  }
  
  const now = new Date();
  const days = getConfig('license_days', 180);
  const exp = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  updateUser(userRow, 3, licenseKey); 
  updateUser(userRow, 4, now); 
  updateUser(userRow, 5, exp);
  ls.getRange(licenseRow, 2).setValue(true); 
  ls.getRange(licenseRow, 3).setValue(email);
  logEvent('LICENSE_ACTIVATED', email, licenseKey);
  return jsonResponse({ status: 'ok', message: '✅ Лицензия активирована!', licenseKey: licenseKey, activatedAt: now.toISOString(), expiresAt: exp.toISOString(), daysLeft: days });
}

function handleCheckLicense(data) {
  if (!data.email) return jsonResponse({ status: 'error', message: '❌ Нет email' });
  const userRow = findUserRow(data.email);
  if (userRow < 0) return jsonResponse({ status: 'error', message: '❌ Пользователь не найден' });
  const u = getUserData(userRow);
  const has = !!u.licenseKey;
  const exp = u.expiresAt ? new Date(u.expiresAt) < new Date() : true;
  const max = parseInt(u.maxDevices, 10) || getConfig('max_devices', 1);
  if (!has) return jsonResponse({ status: 'ok', hasLicense: false, maxDevices: max, isTrial: u.isTrial });
  return jsonResponse({ status: 'ok', message: exp ? '❌ Срок истёк' : '✅ Лицензия активна', hasLicense: true, isExpired: exp, licenseKey: u.licenseKey, activatedAt: u.activatedAt, expiresAt: u.expiresAt, daysLeft: exp ? 0 : Math.ceil((new Date(u.expiresAt) - Date.now()) / 86400000), maxDevices: max, isTrial: u.isTrial });
}

function handleRemoveDevice(data) {
  if (!data.email) return jsonResponse({ status: 'error', message: '❌ Нет email' });
  const userRow = findUserRow(data.email);
  if (userRow < 0) return jsonResponse({ status: 'error', message: '❌ Пользователь не найден' });
  const u = getUserData(userRow);
  let tokens = u.deviceTokens ? u.deviceTokens.toString().split('|').filter(function(t){ return t.trim(); }) : [];
  if (tokens.length === 0) return jsonResponse({ status: 'error', message: '❌ Нет устройств' });
  if (data.deviceToken) {
    if (tokens.indexOf(data.deviceToken) < 0) return jsonResponse({ status: 'error', message: '❌ Устройство не найдено' });
    tokens = tokens.filter(function(t){ return t !== data.deviceToken; });
  } else { tokens.pop(); }
  updateUser(userRow, 7, tokens.join('|')); 
  updateUser(userRow, 8, tokens.length);
  logEvent('DEVICE_REMOVED', data.email, 'Remaining: ' + tokens.length);
  return jsonResponse({ status: 'ok', message: '✅ Устройство удалено', remainingDevices: tokens.length });
}

// ═══════════════════════════════════════════════════════════════
// ADMIN: Генерация ключей
// ═══════════════════════════════════════════════════════════════

function generateKey() {
  const p = 'CUTSY2-PRO-', c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = p;
  for (let g = 0; g < 4; g++) { 
    for (let i = 0; i < 4; i++) r += c[Math.floor(Math.random() * c.length)]; 
    if (g < 3) r += '-'; 
  }
  return r + '-' + calculateChecksum(r);
}

function calculateChecksum(str) {
  let h = 0; 
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
  return Math.abs(h).toString(16).padStart(8, '0').toUpperCase().slice(-8);
}

function generateLicenseKeys(count) {
  count = count || 10;
  const s = initSheets().licenses; 
  for (let i = 0; i < count; i++) s.appendRow([generateKey(), false, '']); 
  console.log('✅ Generated', count, 'keys');
}

function generate500Keys() {
  const s = initSheets().licenses; 
  const ex = new Set(); 
  const d = s.getDataRange().getValues();
  for (let i = 1; i < d.length; i++) if (d[i][0]) ex.add(d[i][0]);
  const keys = []; 
  let gen = 0; 
  while (gen < 500) { 
    const k = generateKey(); 
    if (!ex.has(k)) { keys.push([k, false, '']); ex.add(k); gen++; } 
  }
  for (let i = 0; i < keys.length; i += 100) s.getRange(s.getLastRow() + 1, 1, keys.slice(i, i + 100).length, 3).setValues(keys.slice(i, i + 100));
  console.log('✅ Generated', gen, 'keys'); 
  return gen;
}

// ═══════════════════════════════════════════════════════════════
// MIGRATION: Добавление столбца is_trial
// ═══════════════════════════════════════════════════════════════

function migrateUsersSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('users');
  
  if (!sheet) {
    Logger.log('❌ Лист users не найден');
    return;
  }
  
  const lastCol = sheet.getLastColumn();
  Logger.log(`📊 Текущее количество столбцов: ${lastCol}`);
  
  if (lastCol < 10) {
    // Добавляем заголовок is_trial
    sheet.getRange(1, 10).setValue('is_trial');
    Logger.log('✅ Добавлен заголовок is_trial в столбец J');
    
    // Обновляем всех существующих пользователей
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const data = sheet.getRange(2, 10, lastRow - 1, 1).getValues();
      const updates = [];
      for (let i = 0; i < data.length; i++) {
        updates.push([false]); // По умолчанию false для старых пользователей
      }
      if (updates.length > 0) {
        sheet.getRange(2, 10, updates.length, 1).setValues(updates);
        Logger.log(`✅ Обновлено ${updates.length} существующих пользователей (is_trial = false)`);
      }
    }
  } else {
    Logger.log('✅ Столбец is_trial уже существует');
  }
  
  Logger.log('✅ Миграция завершена');
}