# ✅ Validators - Валидация данных

## 🎯 Назначение

Предотвращение ошибок и некорректного поведения через проверку:
- Корректности деталей
- Размеров (отрицательные, NaN, Infinity)
- Количества (1-9999)
- Координат
- Размеров листа

---

## 📁 API

### 1️⃣ Проверка числа

```javascript
// Базовая проверка
Validators.isNumber(value);
// { valid: true } или { valid: false, error: '...' }

// С опциями
Validators.isNumber(value, { 
    allowZero: true,      // Разрешить 0
    allowNegative: true   // Разрешить отрицательные
});
```

### 2️⃣ Проверка размеров

```javascript
Validators.isDimension(value, fieldName = 'Размер');
// Пример:
Validators.isDimension(100, 'Ширина');
// { valid: true }
// или
// { valid: false, error: 'Ширина: слишком маленькое значение (мин. 1 мм)' }
```

### 3️⃣ Проверка количества

```javascript
Validators.isQuantity(value);
// Проверяет: 1 <= value <= 9999, целое число
```

### 4️⃣ Проверка детали

```javascript
Validators.isPart(part);
/*
{
    valid: true,
    errors: []  // Если есть ошибки
}
*/
```

### 5️⃣ Проверка массива деталей

```javascript
Validators.areParts(parts);
/*
{
    valid: true,
    errors: [
        'Деталь #1: Ширина: слишком маленькое значение',
        'Деталь #3: Количество: максимум 9999 шт'
    ]
}
*/
```

### 6️⃣ Проверка размера листа

```javascript
Validators.isSheetSize(width, height);
```

### 7️⃣ Проверка координат

```javascript
Validators.areCoordinates(x, y);
```

### 8️⃣ Проверка объекта DXF

```javascript
Validators.isDxfObject(obj);
```

---

## 🛠️ Быстрые функции

```javascript
// Глобальные функции для удобства
validatePart(part);           // То же что Validators.isPart()
validateParts(parts);         // То же что Validators.areParts()
validateSheetSize(w, h);      // То же что Validators.isSheetSize()
validateNumber(val, opts);    // То же что Validators.isNumber()
```

---

## 📊 Примеры использования

### Пример 1: Валидация перед созданием детали

```javascript
function createPartFromSelection(quantity, name = '') {
    // Проверка количества
    const qtyValid = validateNumber(quantity, { 
        allowZero: false, 
        allowNegative: false 
    });
    
    if (!qtyValid.valid) {
        alert(`⚠️ Некорректное количество: ${qtyValid.error}`);
        return;
    }
    
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) {
        alert('⚠️ Количество должно быть от 1 до 9999');
        return;
    }
    
    // ... создание детали ...
    
    // Проверка созданной детали
    const partValid = validatePart(part);
    if (!partValid.valid) {
        alert(`⚠️ Ошибка создания детали\n\n${partValid.errors.join('\n')}`);
        return;
    }
}
```

### Пример 2: Валидация перед раскладкой

```javascript
document.getElementById('nestMultiParts').addEventListener('click', async () => {
    const partsToNest = parts.filter(p => p.nestingEnabled !== false);
    
    // Проверка всех деталей
    const validation = validateParts(partsToNest);
    if (!validation.valid) {
        let errorMessage = '⚠️ Ошибка валидации деталей\n\n';
        errorMessage += validation.errors.slice(0, 5).join('\n');
        if (validation.errors.length > 5) {
            errorMessage += `\n... и ещё ${validation.errors.length - 5} ошибок`;
        }
        alert(errorMessage);
        return;
    }
    
    // ... запуск раскладки ...
});
```

### Пример 3: Проверка размера листа

```javascript
function setSheetSize(width, height) {
    const valid = validateSheetSize(width, height);
    if (!valid.valid) {
        alert(`⚠️ Некорректный размер листа\n\n${valid.errors.join('\n')}`);
        return false;
    }
    
    sheetSize = { width, height };
    return true;
}
```

---

## ⚠️ Типы ошибок

### Числа

| Ошибка | Сообщение |
|--------|-----------|
| Не число | 'Должно быть числом' |
| NaN | 'Некорректное число' |
| Infinity | 'Слишком большое значение' |
| Отрицательное | 'Не может быть отрицательным' |
| Ноль | 'Не может быть нулём' |

### Размеры

| Ошибка | Сообщение |
|--------|-----------|
| < 1 мм | 'Слишком маленькое значение (мин. 1 мм)' |
| > 100000 мм | 'Слишком большое значение (макс. 100000 мм)' |

### Количество

| Ошибка | Сообщение |
|--------|-----------|
| < 1 | 'Минимум 1 шт' |
| > 9999 | 'Максимум 9999 шт' |
| Не целое | 'Должно быть целым числом' |

---

## 🧪 Тестирование

**Откройте консоль (F12) и проверьте:**

```javascript
// 1. Проверка числа
console.log(validateNumber(100));  // { valid: true }
console.log(validateNumber(-5));   // { valid: false, error: '...' }
console.log(validateNumber(NaN));  // { valid: false, error: '...' }

// 2. Проверка размера
console.log(validateSheetSize(1250, 2500));  // { valid: true }
console.log(validateSheetSize(-100, 2500));  // { valid: false, errors: [...] }

// 3. Проверка детали
const part = {
    id: 1,
    bounds: { width: 100, height: 50 },
    quantity: 5,
    objects: [{ type: 'rect', x: 0, y: 0, width: 100, height: 50 }]
};
console.log(validatePart(part));  // { valid: true }

// 4. Проверка некорректной детали
const badPart = {
    id: 2,
    bounds: { width: -100, height: NaN },  // Ошибки!
    quantity: 99999,  // Ошибка!
    objects: []
};
console.log(validatePart(badPart));  // { valid: false, errors: [...] }
```

---

## 📊 Интеграция

Валидаторы автоматически подключены и работают в:

1. **Создание детали** (`createPartFromSelection`)
   - Проверка количества
   - Проверка размеров
   - Проверка созданной детали

2. **Раскладка** (`nestMultiParts`)
   - Проверка всех деталей перед раскладкой

3. **Импорт DXF** (можно добавить)
   - Проверка импортированных объектов

---

**Готово! Данные валидируются!** 🎉
