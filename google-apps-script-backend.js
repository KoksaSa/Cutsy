/**
 * ═══════════════════════════════════════════════════════════════
 * CUTSY LICENSE SERVER — Google Apps Script Backend
 * ═══════════════════════════════════════════════════════════════
 * 
 * 📋 Инструкция по установке:
 * 1. Создай Google Таблицу: https://sheets.new
 * 2. Переименуй лист в "licenses"
 * 3. Создай заголовки в первой строке:
 *    A1: key | B1: activated | C1: device_id | D1: activated_at | E1: expires_at | F1: notes
 * 4. Открой Расширения → Apps Script
 * 5. Удали весь код и вставь код ниже
 * 6. Нажми Сохранить (дискетка)
 * 7. Нажми Развернуть → Новое развёртывание
 * 8. Тип: Веб-приложение
 * 9. Кто имеет доступ: Все
 * 10. Скопируй URL (он понадобится в license.js)
 * 
 * ⚠️ ВАЖНО: URL должен быть в формате:
 * https://script.google.com/macros/s/XXXXXXXX/exec
 */

const SHEET_NAME = 'licenses';
const LICENSE_DAYS = 365; // 1 год

/**
 * Обработка POST-запросов
 */
function doPost(e) {
  try {
    // CORS заголовки
    const output = ContentService.createTextOutput();
    output.setMimeType(ContentService.MimeType.JSON);
    
    // Парсим входные данные
    let data;
    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else if (e.parameter) {
      data = e.parameter;
    } else {
      return jsonResponse({ status: 'error', message: 'No data provided' });
    }
    
    const { key, deviceId, action } = data;
    
    if (!key || !deviceId) {
      return jsonResponse({ status: 'error', message: 'Missing key or deviceId' });
    }
    
    // Получаем таблицу
    const sheet = getSheet();
    if (!sheet) {
      return jsonResponse({ status: 'error', message: 'Sheet not found' });
    }
    
    // Ищем ключ
    const rowIndex = findKeyRow(sheet, key);
    
    if (rowIndex === -1) {
      logAttempt(key, deviceId, 'KEY_NOT_FOUND');
      return jsonResponse({ status: 'error', message: '❌ Ключ не найден' });
    }
    
    const rowData = getRowData(sheet, rowIndex);
    
    // Обработка действий
    switch (action) {
      case 'check':
        return handleCheck(sheet, rowIndex, rowData, deviceId);
      case 'deactivate':
        return handleDeactivate(sheet, rowIndex, rowData, deviceId);
      default:
        return handleActivate(sheet, rowIndex, rowData, deviceId);
    }
    
  } catch (error) {
    console.error('Error:', error);
    return jsonResponse({ status: 'error', message: 'Server error: ' + error.message });
  }
}

/**
 * Обработка GET-запросов (для проверки работы)
 */
function doGet(e) {
  return jsonResponse({ 
    status: 'ok', 
    message: 'Ctesy License Server is running',
    timestamp: new Date().toISOString()
  });
}

/**
 * Активация/проверка лицензии
 */
function handleActivate(sheet, rowIndex, rowData, deviceId) {
  const now = new Date();
  
  // Ключ не активирован
  if (!rowData.activated) {
    const expiresAt = new Date(now.getTime() + LICENSE_DAYS * 24 * 60 * 60 * 1000);
    
    // Записываем данные
    sheet.getRange(rowIndex, 2).setValue(true);                    // activated
    sheet.getRange(rowIndex, 3).setValue(deviceId);                // device_id
    sheet.getRange(rowIndex, 4).setValue(now);                     // activated_at
    sheet.getRange(rowIndex, 5).setValue(expiresAt);               // expires_at
    
    logAttempt(rowData.key, deviceId, 'ACTIVATED');
    
    return jsonResponse({
      status: 'ok',
      message: '✅ Лицензия активирована на 1 год!',
      key: rowData.key,
      activated: true,
      activatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      deviceId: deviceId
    });
  }
  
  // Ключ уже активирован — проверяем устройство
  if (rowData.deviceId === deviceId) {
    // Проверяем срок
    if (rowData.expiresAt && new Date(rowData.expiresAt) < now) {
      logAttempt(rowData.key, deviceId, 'EXPIRED');
      return jsonResponse({
        status: 'error',
        message: '❌ Срок лицензии истёк',
        expired: true,
        expiresAt: rowData.expiresAt
      });
    }
    
    logAttempt(rowData.key, deviceId, 'REACTIVATED_SAME_DEVICE');
    return jsonResponse({
      status: 'ok',
      message: '✅ Лицензия подтверждена',
      key: rowData.key,
      activated: true,
      activatedAt: rowData.activatedAt,
      expiresAt: rowData.expiresAt,
      deviceId: deviceId
    });
  }
  
  // Другое устройство!
  logAttempt(rowData.key, deviceId, 'REJECTED_DIFFERENT_DEVICE');
  return jsonResponse({
    status: 'error',
    message: '❌ Ключ уже активирован на другом устройстве',
    alreadyUsed: true,
    activatedAt: rowData.activatedAt
  });
}

/**
 * Проверка статуса без активации
 */
function handleCheck(sheet, rowIndex, rowData, deviceId) {
  if (!rowData.activated) {
    return jsonResponse({
      status: 'ok',
      message: 'Ключ не активирован',
      activated: false
    });
  }
  
  const now = new Date();
  const isExpired = rowData.expiresAt && new Date(rowData.expiresAt) < now;
  const isSameDevice = rowData.deviceId === deviceId;
  
  return jsonResponse({
    status: 'ok',
    message: isSameDevice ? 'Ключ активирован на этом устройстве' : 'Ключ активирован на другом устройстве',
    activated: true,
    expired: isExpired,
    sameDevice: isSameDevice,
    expiresAt: rowData.expiresAt,
    activatedAt: rowData.activatedAt
  });
}

/**
 * Деактивация лицензии
 */
function handleDeactivate(sheet, rowIndex, rowData, deviceId) {
  if (!rowData.activated) {
    return jsonResponse({
      status: 'error',
      message: 'Ключ не активирован'
    });
  }
  
  if (rowData.deviceId !== deviceId) {
    return jsonResponse({
      status: 'error',
      message: '❌ Нельзя деактивировать чужую лицензию'
    });
  }
  
  // Очищаем данные
  sheet.getRange(rowIndex, 2).setValue(false);   // activated
  sheet.getRange(rowIndex, 3).setValue('');      // device_id
  sheet.getRange(rowIndex, 4).setValue('');      // activated_at
  sheet.getRange(rowIndex, 5).setValue('');      // expires_at
  
  logAttempt(rowData.key, deviceId, 'DEACTIVATED');
  
  return jsonResponse({
    status: 'ok',
    message: '✅ Лицензия деактивирована'
  });
}

/**
 * Получить таблицу
 */
function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME);
}

/**
 * Найти строку с ключом
 */
function findKeyRow(sheet, key) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) { // i=1 пропускаем заголовок
    if (data[i][0] === key) {
      return i + 1; // +1 потому что getRange начинается с 1
    }
  }
  return -1;
}

/**
 * Получить данные строки
 */
function getRowData(sheet, rowIndex) {
  const row = sheet.getRange(rowIndex, 1, 1, 6).getValues()[0];
  return {
    key: row[0],
    activated: row[1] === true || row[1] === 'TRUE' || row[1] === 1,
    deviceId: row[2] || '',
    activatedAt: row[3] || null,
    expiresAt: row[4] || null,
    notes: row[5] || ''
  };
}

/**
 * Логирование попыток (в отдельный лист)
 */
function logAttempt(key, deviceId, action) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let logSheet = ss.getSheetByName('logs');
    
    if (!logSheet) {
      logSheet = ss.insertSheet('logs');
      logSheet.appendRow(['timestamp', 'key', 'deviceId', 'action', 'ip']);
    }
    
    logSheet.appendRow([
      new Date().toISOString(),
      key,
      deviceId,
      action,
      '' // IP можно получить через e.parameter если нужно
    ]);
  } catch (e) {
    console.error('Log error:', e);
  }
}

/**
 * Формирование JSON-ответа
 */
function jsonResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

/**
 * ═══════════════════════════════════════════════════════════════
 * УТИЛИТЫ (для ручного управления через редактор)
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * Сгенерировать новые лицензионные ключи
 * Запусти эту функцию в редакторе Apps Script
 */
function generateKeys(count) {
  count = count || 10;
  const sheet = getSheet();
  const keys = [];
  
  for (let i = 0; i < count; i++) {
    const key = generateKey();
    sheet.appendRow([key, false, '', '', '', 'Auto-generated']);
    keys.push(key);
  }
  
  console.log('Generated keys:', keys);
  return keys;
}

/**
 * Генерация одного ключа
 */
function generateKey() {
  const prefix = 'CUTSY2-PRO-';
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = prefix;
  
  // 4 группы по 4 символа
  for (let g = 0; g < 4; g++) {
    for (let i = 0; i < 4; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (g < 3) result += '-';
  }
  
  // Контрольная сумма
  const cs = calculateChecksum(result);
  return result + '-' + cs;
}

/**
 * Расчёт контрольной суммы
 */
function calculateChecksum(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(16).padStart(8, '0').toUpperCase().slice(-8);
}

/**
 * Проверить все лицензии (очистить просроченные)
 */
function cleanupExpired() {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const now = new Date();
  let cleaned = 0;
  
  for (let i = 1; i < data.length; i++) {
    const expiresAt = data[i][4];
    if (expiresAt && new Date(expiresAt) < now) {
      sheet.getRange(i + 1, 6).setValue('EXPIRED: ' + data[i][6]);
      cleaned++;
    }
  }
  
  console.log('Cleaned expired licenses:', cleaned);
  return cleaned;
}

/**
 * Получить статистику
 */
function getStats() {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  let total = 0, active = 0, expired = 0;
  const now = new Date();
  
  for (let i = 1; i < data.length; i++) {
    total++;
    if (data[i][1] === true) {
      if (data[i][4] && new Date(data[i][4]) < now) {
        expired++;
      } else {
        active++;
      }
    }
  }
  
  const stats = { total, active, expired, available: total - active };
  console.log('Stats:', stats);
  return stats;
}
