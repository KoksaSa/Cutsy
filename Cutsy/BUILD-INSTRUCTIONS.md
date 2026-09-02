# 🔨 Сборка проекта Cutsy CAD PRO

## 📋 Что изменено в этой версии (v3.3)

### 🚀 Полная SEO-оптимизация:
- ✅ **Расширенные мета-теги** — Open Graph, Twitter Cards, keywords, description
- ✅ **Schema.org разметка** — WebApplication, FAQPage, HowTo для rich snippets
- ✅ **robots.txt** — с ссылкой на sitemap.xml
- ✅ **sitemap.xml** — карта сайта для поисковых систем
- ✅ **manifest.json** — PWA поддержка для установки на мобильные
- ✅ **Канонический URL** — предотвращение дублирования контента
- ✅ **SEO-текстовый блок** — скрытый контент с ключевыми словами
- ✅ **FAQ-секция** — видимая для поисковиков с микроразметкой
- ✅ **Автоматическое удаление console.log** — через disableConsoleOutput

### 🔧 Технические исправления:
- ✅ **Исправлена функция `stripConsoleLogs`** — корректная обработка template literals
- ✅ **Добавлено подключение `keyboard-events.js`** — исправлены горячие клавиши
- ✅ **Удаление ?v=X.XX из HTML** — правильное CDN-кэширование

### Упрощённая система лицензирования:
- ✅ **Пробная версия без регистрации** — 7 дней полного доступа
- ✅ **Вход по кнопке** — только для тех, у кого уже есть лицензия
- ✅ **Покупка PRO** — форма регистрации с выбором тарифа

### Ограничения пробной версии:
- Лимит: **5 авто-раскладок**
- ❌ Экспорт DXF раскладки
- ❌ Инструмент "Линия"
- ❌ Инструмент "Размер"
- ❌ Установка цен

---

## 🚀 Инструкция по сборке

### Вариант 1: Автоматическая сборка (рекомендуется)

```bash
# ═══════════════════════════════════════════════════════════
# ⚠️  ПЕРЕД ПРОДАКШЕН-СБОРКОЙ: Включи защиту!
# ═══════════════════════════════════════════════════════════
# 1. Открой Cutsy/build.js
# 2. Найди строку: const ENABLE_ANTI_DEBUG = false;
# 3. Поменяй на:   const ENABLE_ANTI_DEBUG = true;
# 4. Запусти сборку:
```

```bash
# 1. Перейди в папку проекта
cd Cutsy

# 2. Установи зависимости (если ещё не установлены)
npm install

# 3. Запусти сборку
node build.js

# 4. Результат: папка dist/ с готовыми файлами
```

```bash
# ═══════════════════════════════════════════════════════════
# ✅ ПОСЛЕ ПРОДАКШЕН-СБОРКИ: Отключи защиту!
# ═══════════════════════════════════════════════════════════
# 1. Открой Cutsy/build.js
# 2. Найди строку: const ENABLE_ANTI_DEBUG = true;
# 3. Поменяй на:   const ENABLE_ANTI_DEBUG = false;
# 4. Собирай normally — F12 будет работать для отладки
```

### ⚠️ Включение защиты от отладки (продакшен)

По умолчанию сборка выполняется **без блокировки F12** — для удобства отладки.
Чтобы включить anti-debug защиту (блокировка консоли, F12, Ctrl+Shift+I) для продакшен-сборки:

1. Открой `Cutsy/build.js`
2. Найди строку в начале файла:
   ```javascript
   const ENABLE_ANTI_DEBUG = false;
   ```
3. Поменяй `false` на `true`:
   ```javascript
   const ENABLE_ANTI_DEBUG = true;
   ```
4. Запусти сборку:
   ```bash
   node build.js
   ```

**Что включится при `ENABLE_ANTI_DEBUG = true`:**
- 🔒 Блокировка клавиши F12
- 🔒 Блокировка Ctrl+Shift+I / Ctrl+U
- 🔒 Блокировка правого клика мыши
- 🔒 Подключение `js/anti-debug.js` с детекцией DevTools

> 💡 **Совет:** Всегда собирай с `ENABLE_ANTI_DEBUG = false` для разработки и отладки, и переключай на `true` только перед деплоем на продакшен.

### Вариант 2: Ручная подготовка для Google Apps Script

Если терминал недоступен, выполни следующие шаги:

#### Шаг 1: Скопируй файлы в папку dist/

```bash
# Создай папку dist/
mkdir dist

# Скопируй все JS-файлы (без обфускации)
cp splash.js dist/
cp flip-nested.js dist/
cp svg-export.js dist/
cp detail-export.js dist/
cp shapes.js dist/
cp ui-functions.js dist/
cp render.js dist/
cp snapping.js dist/
cp dimensions.js dist/
cp nesting.js dist/
cp translations.js dist/
cp js/sheet-remnant.js dist/
cp dxf-import.js dist/
cp dxf-import-ui.js dist/
cp pdf-report.js dist/
cp pricing-mutual-exclusion.js dist/
cp index.html dist/
cp styles.css dist/
cp favicon.png dist/

# Скопируй папку js/
cp -r js dist/
```

#### Шаг 2: Проверь содержимое index.html

Убедись, что в `dist/index.html` подключены все скрипты в правильном порядке:

```html
<script src="js/globals.js"></script>
<script src="js/config.js"></script>
<script src="js/license.js"></script>
<script src="js/license-gate.js"></script>
```

---

## 📤 Деплой в Google Apps Script

### Бэкенд (`google-apps-script-backend-v3-OPTIMIZED.js`)

1. Открой [Google Apps Script](https://script.google.com/)
2. Создай новый проект
3. Скопируй содержимое `google-apps-script-backend-v3-OPTIMIZED.js`
4. Сохрани и разверни:
   - **Развернуть → Новые развертывания**
   - **Тип: Веб-приложение**
   - **Доступ: Все**
   - **Кто имеет доступ: Любой, у кого есть ссылка**
5. Скопируй URL веб-приложения

### Фронтенд (`dist/index.html`)

1. Открой `dist/index.html`
2. Найди строку с `GOOGLE_SCRIPT_URL`
3. Замени URL на свой из шага выше
4. Загрузи всё содержимое `dist/` на хостинг (GitHub Pages, Netlify, Vercel и т.д.)

---

## 🧪 Тестирование

### 1. Пробная версия
1. Открой `dist/index.html` в браузере
2. Должно появиться окно "Выберите вариант использования"
3. Нажми **"🚀 Начать пробный период"**
4. Должен исчезнуть оверлей и появиться бейдж "🆓 ПРОБНЫЙ ПЕРИОД"
5. Проверь лимиты:
   - Авто-раскладка: работает до 5 раз
   - Экспорт DXF: заблокирован
   - Инструмент "Линия": заблокирован
   - Инструмент "Размер": заблокирован

### 2. Покупка PRO
1. Нажми **"💳 Купить PRO-версию"**
2. Должна открыться форма регистрации в новой вкладке
3. Выбери тариф (1 месяц / 6 месяцев / 1 год)
4. Введи email и пароль
5. После регистрации на email придёт письмо с QR-кодом для оплаты

### 3. Активация лицензии
1. После оплаты админ пришлёт ключ
2. В программе нажми **"Уже есть лицензия? Войти"**
3. Введи email, пароль и ключ
4. Лицензия активируется

---

## 📁 Структура папок

```
Cutsy/
├── dist/                    # Собранный проект (после сборки)
│   ├── index.html
│   ├── styles.css
│   ├── js/
│   │   ├── license.js
│   │   ├── license-gate.js  # ← Новый экран выбора тарифа
│   │   └── ...
│   └── favicon.png
├── js/                      # Исходный код
├── google-apps-script-backend-v3-OPTIMIZED.js  # Бэкенд
└── build.js                 # Скрипт сборки
```

---

## 🔧 Troubleshooting

### Ошибка: "License server not configured"
- Проверь, что `GOOGLE_SCRIPT_URL` в `js/license.js` заменён на твой URL

### Ошибка: CORS
- Убедись, что веб-приложение развернуто как "Любой, у кого есть ссылка"
- Проверь, что `doGet` и `doPost` обработчики настроены

### Пробная версия не активируется
- Проверь консоль браузера (F12) на ошибки
- Убедись, что `localStorage` не заблокирован

### Горячие клавиши не работают
- Проверь, что `js/keyboard-events.js` подключён в `index.html` после `js/join-parts.js`
- Очисти кэш браузера (Ctrl+Shift+R)
- Убедись, что фокус не в input/textarea

### Холст не отображается
- Проверь консоль браузера (F12) на ошибки JavaScript
- Убедись, что все JS-файлы загружаются (Network tab)
- Проверь, что `styles.css` загружается корректно

---

## 📞 Поддержка

При возникновении проблем:
- 📧 Email: cutsypro@gmail.com
- ✈️ Telegram: @SilikinK

---

## 🚀 SEO-Оптимизация

### Что включено:

#### 1. Мета-теги в `index.html`:
```html
<!-- Основные -->
<meta name="description" content="...">
<meta name="keywords" content="...">
<meta name="robots" content="index, follow">

<!-- Open Graph (Facebook, VK) -->
<meta property="og:type" content="website">
<meta property="og:title" content="...">
<meta property="og:image" content="https://cutsypro.ru/og-image.png">

<!-- Twitter Cards -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="...">
```

#### 2. Schema.org разметка:
```html
<script type="application/ld+json">
{
    "@type": "WebApplication",
    "name": "Cutsy CAD PRO",
    "url": "https://cutsypro.ru/",
    "aggregateRating": { ... }
}
</script>
```

#### 3. Файлы для SEO:
- `robots.txt` — https://cutsypro.ru/robots.txt
- `sitemap.xml` — https://cutsypro.ru/sitemap.xml
- `manifest.json` — PWA манифест

### Проверка SEO:

1. **Google Search Console** — https://search.google.com/search-console
   - Добавьте сайт: https://cutsypro.ru/
   - Отправьте sitemap.xml
   - Проверьте индексацию

2. **Yandex.Webmaster** — https://webmaster.yandex.ru/
   - Добавьте сайт: https://cutsypro.ru/
   - Подтвердите права
   - Отправьте sitemap.xml

3. **Rich Results Test** — https://search.google.com/test/rich-results
   - Проверьте FAQ и HowTo разметку

4. **PageSpeed Insights** — https://pagespeed.web.dev/
   - Проверьте скорость загрузки

### Рекомендации для cutsypro.ru:

- ✅ Добавьте `og-image.png` (1200×630px) в корень сайта
- ✅ Создайте страницы `/privacy.html` и `/terms.html`
- ✅ Настройте HTTPS на хостинге (SSL-сертификат)
- ✅ Добавьте сайт в Google Search Console и Yandex.Webmaster
- ✅ Настройте 301 редирект с http → https
- ✅ Настройте gzip_static on для nginx
- ✅ Добавьте заголовки безопасности:
  ```
  X-Frame-Options: SAMEORIGIN
  X-Content-Type-Options: nosniff
  Strict-Transport-Security: max-age=31536000
  ```

### Конфигурация nginx для cutsypro.ru:

```nginx
server {
    listen 80;
    server_name cutsypro.ru www.cutsypro.ru;
    return 301 https://cutsypro.ru$request_uri;
}

server {
    listen 443 ssl http2;
    server_name cutsypro.ru www.cutsypro.ru;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    root /var/www/cutsypro;
    index index.html;
    
    # Включить gzip_static для .gz файлов
    gzip_static on;
    
    location / {
        try_files $uri $uri/ =404;
    }
    
    location ~* \.(jpg|jpeg|png|gif|ico|svg|webp)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    location ~* \.(js|css)$ {
        expires 1M;
        add_header Cache-Control "public";
    }
}
```
