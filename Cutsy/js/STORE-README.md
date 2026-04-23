# 📦 State Management (Store) - Документация

## 🎯 Назначение

Единый центр хранения и управления данными приложения для:
- Уменьшения багов с рассинхронизацией
- Автоматического обновления UI
- Упрощения отладки
- Централизованного хранения

---

## 📁 Структура Store

```javascript
Store.state = {
    // Детали
    parts: [],                      // Массив деталей
    
    // Размещённые детали
    nestedParts: [],                // На текущем листе
    selectedNestedParts: [],        // Выделенные
    allSheets: [],                  // Все листы
    currentSheetIndex: 0,           // Текущий лист
    
    // Вид
    showSheetView: false,           // Показать лист
    sheetSize: { width: 1250, height: 2500 },
    
    // Разметка
    markupRects: [],                // Прямоугольники
    selectedRectIndex: -1,          // Выделенный
    
    // Настройки
    allowOverlap: false,            // Наложение деталей
    
    // Холст
    objects: [],                    // Объекты
    selectedObjects: [],            // Выделенные
    dimensionLines: [],             // Размеры
    currentTool: 'select'           // Инструмент
};
```

---

## 🔧 Использование

### 1️⃣ Получить значение

```javascript
// Получить всё состояние
const state = Store.get();

// Получить конкретное значение
const parts = Store.get('parts');
const sheetSize = Store.get('sheetSize');
const width = Store.get('sheetSize.width');
```

### 2️⃣ Установить значение

```javascript
// Установить значение
Store.set('parts', newParts);
Store.set('showSheetView', true);
Store.set('sheetSize.width', 1500);

// Без авто-обновления UI
Store.set('parts', newParts, { skipRender: true });

// Без уведомлений (silent)
Store.set('parts', newParts, { silent: true });
```

### 3️⃣ Подписаться на изменения

```javascript
// Подписка на изменения
const unsubscribe = Store.subscribe('parts', (newValue, oldValue, path) => {
    console.log('Детали изменились:', newValue);
});

// Отписка
unsubscribe();
```

### 4️⃣ Сбросить состояние

```javascript
// Сбросить всё
Store.reset();

// Сбросить с новыми значениями
Store.reset({ parts: [], nestedParts: [] });
```

### 5️⃣ Экспорт/Импорт

```javascript
// Экспорт состояния (для сохранения)
const state = Store.exportState();
localStorage.setItem('myapp_state', JSON.stringify(state));

// Импорт состояния (для загрузки)
const saved = JSON.parse(localStorage.getItem('myapp_state'));
Store.importState(saved);
```

### 6️⃣ Отладка

```javascript
// Вывод состояния в консоль
Store.debug();

// Вывод в консоль браузера (F12)
console.log(Store.state);
```

---

## 🛠️ StoreHelpers

Вспомогательные функции для работы с деталями:

```javascript
// Получить количество размещённых деталей типа
const count = StoreHelpers.getPlacedCount(partId);

// Получить деталь по ID
const part = StoreHelpers.getPart(partId);

// Получить общее количество
const total = StoreHelpers.getTotalQuantity(partId);

// Получить оставшееся количество
const remaining = StoreHelpers.getRemainingQuantity(partId);

// Проверить, все ли размещены
const isDone = StoreHelpers.isFullyPlaced(partId);

// Очистить все размещённые
StoreHelpers.clearAllNested();

// Очистить разметку
StoreHelpers.clearAllMarkup();
```

---

## 📊 Примеры использования

### Пример 1: Добавление детали

```javascript
// БЫЛО (прямое изменение)
parts.push(newPart);
render();
updatePartsList();

// СТАЛО (через Store)
const parts = Store.get('parts');
parts.push(newPart);
Store.set('parts', parts);  // render() и updatePartsList() вызовутся автоматически
```

### Пример 2: Выделение детали

```javascript
// БЫЛО
selectedNestedParts.push(index);
render();

// СТАЛО
const selected = Store.get('selectedNestedParts');
selected.push(index);
Store.set('selectedNestedParts', selected);
```

### Пример 3: Очистка раскладки

```javascript
// БЫЛО
nestedParts = [];
selectedNestedParts = [];
allSheets = [];
currentSheetIndex = 0;
render();
updatePartsList();

// СТАЛО
StoreHelpers.clearAllNested();  // Автоматический render() и updatePartsList()
```

---

## ⚠️ Важные замечания

1. **Store доступен глобально** через `window.Store`
2. **Автоматический render()** вызывается при изменении любых данных
3. **Отключить авто-render** можно через `{ skipRender: true }`
4. **Store синхронизирован** с глобальными переменными (parts, nestedParts, etc.)

---

## 🎯 Преимущества

| Было | Стало |
|------|-------|
| Прямое изменение переменных | ✅ Централизованное управление |
| Ручной вызов render() | ✅ Автоматическое обновление |
| Рассинхронизация данных | ✅ Единый источник правды |
| Сложная отладка | ✅ Логирование всех изменений |

---

## 🧪 Тестирование

**Откройте консоль (F12) и проверьте:**

```javascript
// 1. Получить состояние
Store.debug();

// 2. Изменить значение
Store.set('showSheetView', true);

// 3. Подписаться на изменения
Store.subscribe('parts', (newVal) => {
    console.log('Новые детали:', newVal);
});

// 4. Добавить деталь
const parts = Store.get('parts');
parts.push({ id: 1, name: 'Тест', quantity: 5 });
Store.set('parts', parts);
```

---

**Готово! Store управляет данными!** 🎉
