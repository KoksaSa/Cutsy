# 🔐 Cutsy CAD PRO — Security Summary v2.6.0

## Дата: 2026-05-11

---

## 📋 Обзор изменений

Версия **2.6.0** фокусируется на **усилении безопасности** и **защите от несанкционированного доступа**.

---

## 🛡️ Новые защитные меры

### 1. Проверка лицензии при каждом запуске

**Файл:** `js/license.js`

```javascript
const CHECK_INTERVAL_DAYS = 0; // Проверка при каждом запуске
```

**Что изменилось:**
- Раньше: проверка раз в 7 дней
- Теперь: проверка **каждый запуск** приложения
- Серверная валидация с кэшированием результата

**Преимущества:**
- Мгновенная блокировка при отзыве лицензии
- Невозможность использования после истечения срока
- Актуальное состояние с сервером

---

### 2. Усиленный Device Fingerprint

**Файл:** `js/license.js` → `getDeviceToken()`

**Методы идентификации устройства:**
1. **Canvas Fingerprint** — рендеринг скрытого изображения
2. **WebGL Fingerprint** — информация о GPU и драйверах
3. **Audio Fingerprint** — обработка аудиосигнала
4. **UserAgent + Screen + Timezone** — базовые параметры
5. **localStorage token** — постоянное хранилище

**Результат:**
- Уникальный токен устройства (SHA-256)
- Синхронная версия `getDeviceTokenSync()` для критичных проверок
- Защита от подмены через `localStorage`

---

### 3. Anti-Debug Защита

**Файл:** `js/anti-debug.js` (новый модуль)

**Обнаруживает:**
- ✅ **DevTools** (через `debugger` и задержки)
- ✅ **console.clear()** (очистка консоли)
- ✅ **eval()** (попытки выполнения кода)
- ✅ **localStorage tampering** (удаление/изменение лицензии)
- ✅ **LicenseManager подмена** (проверка существования)

**Реакция:**
1. Очистка `localStorage` (удаление сессии)
2. Принудительная перезагрузка страницы
3. Логирование попытки взлома

**Интеграция:**
- Подключён в `index.html` после `license-gate.js`
- Добавлен в `build.js` (без обфускации для читаемости)

---

### 4. Watermark в PDF-отчётах

**Файл:** `pdf-report.js`

**Что добавлено:**
```javascript
const userEmail = session.email; // Из сессии LicenseManager
const watermarkText = userEmail ? `Cutsy CAD PRO — ${userEmail}` : 'Cutsy CAD PRO';
```

**Где отображается:**
- Футер каждого PDF-отчёта
- Невидимый слой (opacity: 0.6)
- Текст: `Cutsy CAD PRO — user@example.com | cutsypro.ru`

**Назначение:**
- Идентификация утечки отчётов
- Персонализация для каждого пользователя
- Маркетинговое продвижение (ссылка на сайт)

---

## 📊 Архитектура безопасности

```
┌─────────────────────────────────────────────────────────┐
│                    КЛИЕНТ (Browser)                     │
├─────────────────────────────────────────────────────────┤
│  ┌───────────────┐  ┌───────────────┐  ┌─────────────┐ │
│  │  anti-debug   │  │   license.js  │  │  fingerprint│ │
│  │    .js        │  │               │  │             │ │
│  └───────┬───────┘  └───────┬───────┘  └──────┬──────┘ │
│          │                  │                  │        │
│          └──────────────────┼──────────────────┘        │
│                             │                           │
│                    ┌────────▼────────┐                  │
│                    │  LicenseManager │                  │
│                    │  (глобальный)   │                  │
│                    └────────┬────────┘                  │
│                             │                           │
└─────────────────────────────┼───────────────────────────┘
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────┐
│              СЕРВЕР (Google Apps Script)                │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐   │
│  │  google-apps-script-backend-v3-OPTIMIZED.js     │   │
│  ├─────────────────────────────────────────────────┤   │
│  │  • SHA-256 + соль (hashPassword)                │   │
│  │  • Rate limiting (checkRateLimit)               │   │
│  │  • Device tokens (max_devices)                  │   │
│  │  • Кэш (CacheService)                           │   │
│  │  • Логирование (logs sheet)                     │   │
│  │  • Telegram уведомления                         │   │
│  └─────────────────────────────────────────────────┘   │
│                        │                                │
│                        ▼                                │
│              ┌──────────────────┐                       │
│              │  Google Sheets   │                       │
│              │  - users         │                       │
│              │  - licenses      │                       │
│              │  - config        │                       │
│              │  - logs          │                       │
│              └──────────────────┘                       │
└─────────────────────────────────────────────────────────┘
```

---

## 🔍 Детали реализации

### Anti-Debug: Механизм работы

```javascript
// 1. Проверка DevTools через debugger
setInterval(() => {
    const start = performance.now();
    debugger; // Пауза в DevTools
    const end = performance.now();
    if (end - start > DEBUG_THRESHOLD) {
        wipeSessionAndReload(); // Взлом обнаружен
    }
}, CHECK_INTERVAL);

// 2. Блокировка console.clear()
const originalClear = console.clear;
console.clear = function() {
    wipeSessionAndReload();
    return originalClear.apply(this, arguments);
};

// 3. Защита localStorage
const originalRemoveItem = localStorage.removeItem;
localStorage.removeItem = function(key) {
    if (key.includes('license') || key.includes('session')) {
        wipeSessionAndReload();
    }
    return originalRemoveItem.apply(this, arguments);
};
```

### Fingerprint: Многослойная идентификация

```javascript
async function getDeviceToken() {
    // 1. Canvas fingerprint
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.fillText('Cutsy CAD', 1, 1);
    const canvasFP = canvas.toDataURL().slice(5);
    
    // 2. WebGL fingerprint
    const gl = canvas.getContext('webgl');
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const glFP = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    
    // 3. Audio fingerprint
    const audioCtx = new AudioContext();
    const oscillator = audioCtx.createOscillator();
    // ... обработка аудиосигнала ...
    
    // 4. Комбинируем и хэшируем
    const combined = canvasFP + glFP + audioFP + navigator.userAgent;
    return await sha256(combined);
}
```

---

## 📈 Сравнение с предыдущей версией

| Мера защиты | v2.5.1 | v2.6.0 | Улучшение |
|-------------|--------|--------|-----------|
| Проверка лицензии | Раз в 7 дней | Каждый запуск | ⬆️ 7x чаще |
| Fingerprint | Navigator только | Canvas + WebGL + Audio | ⬆️ 3 метода |
| Anti-debug | ❌ Нет | ✅ 5 детекторов | ✨ Новое |
| Watermark в PDF | ❌ Нет | ✅ Email пользователя | ✨ Новое |
| Rate limiting | ✅ Есть | ✅ Улучшен | ⬆️ Кэш + логирование |
| Соль в хэше | ✅ Есть | ✅ Улучшена | ⬆️ Динамическая |

---

## 🚀 Интеграция в сборку

### build.js

```javascript
const JS_FILES = [
    // ...
    'js/license-gate.js',
    'js/anti-debug.js',  // ← Добавлен
    // ...
];

const NO_OBFUSCATE_FILES = [
    // ...
    'js/anti-debug.js'  // ← Без обфускации (читаемость)
];
```

### index.html

```html
<!-- ✅ Подключение проверки лицензии при запуске -->
<script src="js/license-gate.js?v=3.27"></script>
<!-- 🔐 Защита от отладки -->
<script src="js/anti-debug.js?v=3.27"></script>
```

---

## 📝 Рекомендации по развёртыванию

### 1. Google Apps Script

```bash
# 1. Откройте google-apps-script-backend-v3-OPTIMIZED.js
# 2. Выполните функцию setupSecrets() (один раз)
# 3. Разверните как Web App:
#    - Execute: Me
#    - Who has access: Anyone
# 4. Скопируйте URL деплоя
```

### 2. Обновление конфигурации

```javascript
// Cutsy/js/config.js
const BACKEND_URL = 'https://script.google.com/macros/s/.../exec';
```

### 3. Тестирование

```bash
# 1. Откройте dist/index.html
# 2. Проверьте консоль (F12) — anti-debug сработает
# 3. Попробуйте удалить localStorage — перезагрузка
# 4. Проверьте PDF-отчёт — watermark виден
```

---

## ⚠️ Предупреждения

### Ложные срабатывания

**Anti-debug** может срабатывать при:
- Открытии DevTools для отладки (намеренно)
- Медленном устройстве (задержка > 100ms)
- Расширениях браузера (блокировщики рекламы)

**Решение:**
- Отключить anti-debug в режиме разработки
- Добавить whitelist для доменов

### Производительность

**Fingerprinting** добавляет:
- ~50-100ms при первом запуске
- Кэширование в localStorage (быстро)

**Решение:**
- Использовать `getDeviceTokenSync()` для критичных проверок
- Кэшировать результат на сессию

---

## 📞 Поддержка

При возникновении проблем:

- **Email:** cutsypro@gmail.com
- **Telegram:** @SilikinK
- **Сайт:** https://cutsypro.ru

---

## 📄 Лицензия

© 2025 Cutsy CAD PRO. Все права защищены.  
Разработано командой **NLP-Core-Team**.
