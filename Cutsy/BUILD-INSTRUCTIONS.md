# 🔨 Сборка проекта Cutsy CAD PRO

## 📋 Что изменено в этой версии (v3.1)

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
# 1. Перейди в папку проекта
cd Cutsy

# 2. Установи зависимости (если ещё не установлены)
npm install

# 3. Запусти сборку
node build.js

# 4. Результат: папка dist/ с готовыми файлами
```

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
cp sheet-remnant.js dist/
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

---

## 📞 Поддержка

При возникновении проблем:
- 📧 Email: cutsypro@gmail.com
- ✈️ Telegram: @SilikinK
