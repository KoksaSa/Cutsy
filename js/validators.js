// ═══════════════════════════════════════════════════════════════
// VALIDATORS - Валидация данных
// ═══════════════════════════════════════════════════════════════

const Validators = {
    // ═══════════════════════════════════════════════════════════
    // ПРОВЕРИТЬ число (не NaN, не Infinity, положительное)
    // ═══════════════════════════════════════════════════════════
    isNumber(value, options = {}) {
        const { allowZero = false, allowNegative = false } = options;
        
        if (typeof value !== 'number') {
            return { valid: false, error: 'Должно быть числом' };
        }
        
        if (isNaN(value)) {
            return { valid: false, error: 'Некорректное число' };
        }
        
        if (!isFinite(value)) {
            return { valid: false, error: 'Слишком большое значение' };
        }
        
        if (!allowNegative && value < 0) {
            return { valid: false, error: 'Не может быть отрицательным' };
        }
        
        if (!allowZero && value === 0) {
            return { valid: false, error: 'Не может быть нулём' };
        }
        
        return { valid: true };
    },
    
    // ═══════════════════════════════════════════════════════════
    // ПРОВЕРИТЬ размеры (ширина, высота)
    // ═══════════════════════════════════════════════════════════
    isDimension(value, fieldName = 'Размер') {
        const result = this.isNumber(value, { allowZero: false, allowNegative: false });
        
        if (!result.valid) {
            return { valid: false, error: `${fieldName}: ${result.error}` };
        }
        
        if (value > 100000) {
            return { valid: false, error: `${fieldName}: слишком большое значение (макс. 100000 мм)` };
        }
        
        if (value < 1) {
            return { valid: false, error: `${fieldName}: слишком маленькое значение (мин. 1 мм)` };
        }
        
        return { valid: true };
    },
    
    // ═══════════════════════════════════════════════════════════
    // ПРОВЕРИТЬ количество (1-9999)
    // ═══════════════════════════════════════════════════════════
    isQuantity(value) {
        const result = this.isNumber(value, { allowZero: false, allowNegative: false });
        
        if (!result.valid) {
            return { valid: false, error: `Количество: ${result.error}` };
        }
        
        if (!Number.isInteger(value)) {
            return { valid: false, error: 'Количество: должно быть целым числом' };
        }
        
        if (value < 1) {
            return { valid: false, error: 'Количество: минимум 1 шт' };
        }
        
        if (value > 9999) {
            return { valid: false, error: 'Количество: максимум 9999 шт' };
        }
        
        return { valid: true };
    },
    
    // ═══════════════════════════════════════════════════════════
    // ПРОВЕРИТЬ деталь (полная проверка)
    // ═══════════════════════════════════════════════════════════
    isPart(part) {
        const errors = [];
        
        // Проверка существования
        if (!part) {
            return { valid: false, errors: ['Деталь не определена'] };
        }
        
        // Проверка ID
        if (part.id === undefined || part.id === null) {
            errors.push('Отсутствует ID детали');
        }
        
        // Проверка bounds
        if (!part.bounds) {
            errors.push('Отсутствуют границы детали (bounds)');
        } else {
            const widthValid = this.isDimension(part.bounds.width, 'Ширина');
            const heightValid = this.isDimension(part.bounds.height, 'Высота');
            
            if (!widthValid.valid) errors.push(widthValid.error);
            if (!heightValid.valid) errors.push(heightValid.error);
        }
        
        // Проверка количества
        if (part.quantity !== undefined) {
            const qtyValid = this.isQuantity(part.quantity);
            if (!qtyValid.valid) errors.push(qtyValid.error);
        }
        
        // Проверка объектов
        if (!part.objects || !Array.isArray(part.objects) || part.objects.length === 0) {
            errors.push('Деталь не содержит объектов');
        }
        
        return {
            valid: errors.length === 0,
            errors: errors
        };
    },
    
    // ═══════════════════════════════════════════════════════════
    // ПРОВЕРИТЬ массив деталей
    // ═══════════════════════════════════════════════════════════
    areParts(parts) {
        if (!Array.isArray(parts)) {
            return { valid: false, errors: ['Должен быть массив деталей'] };
        }
        
        if (parts.length === 0) {
            return { valid: false, errors: ['Массив деталей пуст'] };
        }
        
        const allErrors = [];
        
        parts.forEach((part, index) => {
            const result = this.isPart(part);
            if (!result.valid) {
                allErrors.push(`Деталь #${index + 1}: ${result.errors.join(', ')}`);
            }
        });
        
        return {
            valid: allErrors.length === 0,
            errors: allErrors
        };
    },
    
    // ═══════════════════════════════════════════════════════════
    // ПРОВЕРИТЬ размер листа
    // ═══════════════════════════════════════════════════════════
    isSheetSize(width, height) {
        const errors = [];

        const widthValid = this.isDimension(width, 'Ширина листа');
        const heightValid = this.isDimension(height, 'Высота листа');

        if (!widthValid.valid) errors.push(widthValid.error);
        if (!heightValid.valid) errors.push(heightValid.error);

        if (width > 10000 || height > 10000) {
            errors.push('Максимальный размер листа: 10000×10000 мм');
        }

        // Минимальный размер листа: 500×500 мм (для удобства работы)
        if (width < 500 || height < 500) {
            errors.push('Минимальный размер листа: 500×500 мм');
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    },
    
    // ═══════════════════════════════════════════════════════════
    // ПРОВЕРИТЬ координаты (X, Y)
    // ═══════════════════════════════════════════════════════════
    areCoordinates(x, y) {
        const xValid = this.isNumber(x, { allowZero: true, allowNegative: true });
        const yValid = this.isNumber(y, { allowZero: true, allowNegative: true });
        
        const errors = [];
        if (!xValid.valid) errors.push(`X: ${xValid.error}`);
        if (!yValid.valid) errors.push(`Y: ${yValid.error}`);
        
        return {
            valid: errors.length === 0,
            errors: errors
        };
    },
    
    // ═══════════════════════════════════════════════════════════
    // ПРОВЕРИТЬ объект DXF
    // ═══════════════════════════════════════════════════════════
    isDxfObject(obj) {
        if (!obj || !obj.type) {
            return { valid: false, error: 'Некорректный объект DXF' };
        }
        
        const validTypes = ['line', 'circle', 'rect', 'polygon', 'text'];
        
        if (!validTypes.includes(obj.type)) {
            return { valid: false, error: `Неизвестный тип объекта: ${obj.type}` };
        }
        
        // Проверка в зависимости от типа
        switch (obj.type) {
            case 'line':
                if (obj.x1 === undefined || obj.y1 === undefined || 
                    obj.x2 === undefined || obj.y2 === undefined) {
                    return { valid: false, error: 'Линия должна иметь координаты (x1,y1,x2,y2)' };
                }
                break;
                
            case 'circle':
                if (obj.cx === undefined || obj.cy === undefined || obj.radius === undefined) {
                    return { valid: false, error: 'Круг должен иметь центр и радиус' };
                }
                const radiusValid = this.isDimension(obj.radius, 'Радиус');
                if (!radiusValid.valid) return radiusValid;
                break;
                
            case 'rect':
                if (obj.x === undefined || obj.y === undefined || 
                    obj.width === undefined || obj.height === undefined) {
                    return { valid: false, error: 'Прямоугольник должен иметь позицию и размеры' };
                }
                const wValid = this.isDimension(obj.width, 'Ширина');
                const hValid = this.isDimension(obj.height, 'Высота');
                if (!wValid.valid || !hValid.valid) {
                    const errors = [];
                    if (!wValid.valid) errors.push(wValid.error);
                    if (!hValid.valid) errors.push(hValid.error);
                    return { valid: false, errors };
                }
                break;
        }
        
        return { valid: true };
    },
    
    // ═══════════════════════════════════════════════════════════
    // ПОКАЗАТЬ ошибку пользователю
    // ═══════════════════════════════════════════════════════════
    showError(message, title = 'Ошибка валидации') {
        console.error(`❌ ${title}:`, message);
        
        // Формируем красивое сообщение
        let alertMessage = `⚠️ ${title}\n\n`;
        
        if (Array.isArray(message)) {
            alertMessage += message.join('\n');
        } else {
            alertMessage += message;
        }
        
        alert(alertMessage);
    },
    
    // ═══════════════════════════════════════════════════════════
    // ПРОВЕРИТЬ и показать ошибку
    // ═══════════════════════════════════════════════════════════
    validateAndAlert(validationResult, title = 'Ошибка валидации') {
        if (!validationResult.valid) {
            if (validationResult.errors) {
                this.showError(validationResult.errors, title);
            } else if (validationResult.error) {
                this.showError(validationResult.error, title);
            }
            return false;
        }
        return true;
    }
};

// ═══════════════════════════════════════════════════════════════
// БЫСТРЫЕ ПРОВЕРКИ (для удобства)
// ═══════════════════════════════════════════════════════════════

function validatePart(part) {
    return Validators.isPart(part);
}

function validateParts(parts) {
    return Validators.areParts(parts);
}

function validateSheetSize(width, height) {
    return Validators.isSheetSize(width, height);
}

function validateNumber(value, options = {}) {
    return Validators.isNumber(value, options);
}

// Делаем доступным глобально
window.Validators = Validators;
window.validatePart = validatePart;
window.validateParts = validateParts;
window.validateSheetSize = validateSheetSize;
window.validateNumber = validateNumber;

console.log('✅ Validators загружен');
