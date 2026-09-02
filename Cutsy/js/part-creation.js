// ═══════════════════════════════════════════════════════════
// part-creation.js — ИСПРАВЛЕННАЯ ВЕРСИЯ v2
// Устранены баги: Infinity в safeParse, преждевременный ++currentPartId,
// undoState без saveState, null-доступ к DOM в handlePartKeyDown
// ═══════════════════════════════════════════════════════════

// markupRectCancel — обработчик в js/markup-rect-ui.js (дубль удалён)

// ─── Защита от двойного вызова ───────────────────────────
let _creatingPart = false;

// ─── Утилита: безопасный парсинг числа с дефолтом ─────────
// [FIX #2] Решает баг: parseFloat('0') || 0.8 → 0.8 (ноль терялся)
// [FIX v2] Отфильтровываем Infinity / -Infinity
function safeParseFloat(value, defaultValue) {
    const parsed = parseFloat(value);
    return (Number.isNaN(parsed) || !Number.isFinite(parsed)) ? defaultValue : parsed;
}

function safeParseInt(value, defaultValue) {
    const num = Number(value);
    if (!Number.isFinite(num)) return defaultValue;
    if (!Number.isInteger(num)) {
        console.warn(`safeParseInt: нецелое значение "${value}" округлено до ${Math.round(num)}`);
    }
    return Math.round(num);
}

// ─── Общий обработчик Enter/Escape (устраняет дублирование) ──
// [FIX #4] Один обработчик вместо двух дублирующихся
// [FIX v2] Null-проверки DOM-элементов
function handlePartKeyDown(e) {
    if (e.key === 'Enter') {
        e.preventDefault();   // [FIX #15] Предотвращаем сабмит формы
        e.stopPropagation();  // [FIX #7] Не даём событию всплыть

        const quantityEl = contextPartQuantity;
        const nameEl = contextPartName;
        const thicknessEl = document.getElementById('contextPartThickness');
        const spacingEl = document.getElementById('contextPartSpacing');

        createPartFromSelection(
            quantityEl ? safeParseInt(quantityEl.value, 1) : 1,
            nameEl ? nameEl.value.trim() : '',
            thicknessEl ? safeParseFloat(thicknessEl.value, 0.8) : 0.8,
            spacingEl ? safeParseFloat(spacingEl.value, undefined) : undefined
        );
        if (contextMenu) contextMenu.style.display = 'none';
    }
    if (e.key === 'Escape') {
        e.stopPropagation(); // [FIX #7]
        if (contextMenu) contextMenu.style.display = 'none';
    }
}

if (contextPartQuantity) contextPartQuantity.addEventListener('keydown', handlePartKeyDown);
if (contextPartName) contextPartName.addEventListener('keydown', handlePartKeyDown);

function createPartFromSelection(quantity, name = '', thickness = 0.8, spacing = undefined) {
    // [FIX v2] logPrefix без преждевременного инкремента — используем вызов-счётчик
    const _callNum = (createPartFromSelection._counter = (createPartFromSelection._counter || 0) + 1);
    const logPrefix = `[createPart call#${_callNum}]`;
    console.log(`${logPrefix} ▶ Начало создания детали`, {
        quantity, name, thickness, spacing,
        selectedCount: selectedObjects ? selectedObjects.length : 0
    });

    // ─── [FIX #10] Защита от двойного вызова ──────────────
    if (_creatingPart) {
        console.warn(`${logPrefix} ⚠ Повторный вызов заблокирован (создание уже в процессе)`);
        return;
    }
    _creatingPart = true;

    // [FIX v2] Флаг: был ли вызван saveState — чтобы не делать undoState без сохранения
    let stateSaved = false;

    try {
        // ─── Валидация количества (объединённая) ──────────
        // [FIX #5] Убрана избыточная двойная проверка
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) {
            const msg = `Количество должно быть целым числом от 1 до 9999 (получено: ${quantity})`;
            console.error(`${logPrefix} ❌ Ошибка валидации количества:`, msg);
            alert(`⚠️ Некорректное количество\n\n${msg}`);
            return;
        }
        console.log(`${logPrefix} ✓ Количество: ${quantity}`);

        // ─── Валидация толщины ────────────────────────────
        if (typeof thickness !== 'number' || Number.isNaN(thickness) || !Number.isFinite(thickness) || thickness < 0.1 || thickness > 100) {
            const msg = `Толщина должна быть от 0.1 до 100 мм (получено: ${thickness})`;
            console.error(`${logPrefix} ❌ Ошибка валидации толщины:`, msg);
            alert(`⚠️ Некорректная толщина\n\n${msg}`);
            return;
        }
        console.log(`${logPrefix} ✓ Толщина: ${thickness} мм`);

        // ─── [FIX #6] Валидация зазора ────────────────────
        // spacing может быть undefined — это нормально, значит «использовать UI-поле»
        if (spacing !== undefined && (typeof spacing !== 'number' || Number.isNaN(spacing) || !Number.isFinite(spacing) || spacing < -50 || spacing > 100)) {
            const msg = `Зазор должен быть от -50 до 100 мм (получено: ${spacing})`;
            console.error(`${logPrefix} ❌ Ошибка валидации зазора:`, msg);
            alert(`⚠️ Некорректный зазор\n\n${msg}`);
            return;
        }
        console.log(`${logPrefix} ✓ Зазор: ${spacing !== undefined ? spacing + ' мм' : 'из UI-поля'}`);

        // ─── Проверка выделения ───────────────────────────
        if (!selectedObjects || selectedObjects.length === 0) {
            console.warn(`${logPrefix} ⚠ Нет выделенных объектов`);
            alert('Сначала выделите объекты');
            return;
        }

        // ─── Сохранение состояния (до мутаций) ────────────
        saveState();
        stateSaved = true;
        console.log(`${logPrefix} ✓ Состояние сохранено (saveState)`);

        // ─── Расчёт границ группы ─────────────────────────
        const tempBounds = getGroupBounds(selectedObjects);
        console.log(`${logPrefix} Границы группы:`, {
            width: tempBounds.width,
            height: tempBounds.height,
            minX: tempBounds.minX,
            minY: tempBounds.minY
        });

        // ─── Генерация имени из размеров ──────────────────
        // [FIX #11] Более информативное имя по умолчанию
        if (!name || name.trim() === '') {
            const maxSize = Math.max(tempBounds.width, tempBounds.height);
            name = `Деталь ${Math.round(maxSize)}`;
            console.log(`${logPrefix} Имя сгенерировано автоматически: "${name}"`);
        }

        // ─── Валидация границ ─────────────────────────────
        const widthValid = validateNumber(tempBounds.width, { allowZero: false, allowNegative: false });
        const heightValid = validateNumber(tempBounds.height, { allowZero: false, allowNegative: false });

        if (!widthValid.valid || !heightValid.valid) {
            const errors = [];
            if (!widthValid.valid) errors.push(`Ширина: ${widthValid.error}`);
            if (!heightValid.valid) errors.push(`Высота: ${heightValid.error}`);
            console.error(`${logPrefix} ❌ Некорректные размеры:`, errors);
            alert(`⚠️ Некорректные размеры объектов\n\n${errors.join('\n')}`);
            return;
        }

        if (tempBounds.width > 10000 || tempBounds.height > 10000) {
            console.error(`${logPrefix} ❌ Слишком большие размеры:`, {
                width: tempBounds.width, height: tempBounds.height
            });
            alert('⚠️ Слишком большие размеры объектов\n\nМаксимальный размер: 10000×10000 мм');
            return;
        }
        console.log(`${logPrefix} ✓ Границы валидны: ${tempBounds.width}×${tempBounds.height}`);

        // ─── Глубокое копирование с нормализацией координат ──
        const copyObjects = selectedObjects.map((obj, index) => {
            if (obj.type === 'line') {
                const line = new Line(
                    obj.x1 - tempBounds.minX,
                    obj.y1 - tempBounds.minY,
                    obj.x2 - tempBounds.minX,
                    obj.y2 - tempBounds.minY
                );
                if (obj.color) line.color = obj.color;
                return line;
            } else if (obj.type === 'circle') {
                const circle = new Circle(
                    obj.cx - tempBounds.minX,
                    obj.cy - tempBounds.minY,
                    obj.radius
                );
                if (obj.color) circle.color = obj.color;
                return circle;
            } else if (obj.type === 'rect') {
                const rect = new Rect(
                    obj.x - tempBounds.minX,
                    obj.y - tempBounds.minY,
                    obj.width,
                    obj.height
                );
                if (obj.color) rect.color = obj.color;
                return rect;
            } else if (obj.type === 'polygon') {
                // v4.68: Если polygon имеет points (CustomPolygon из rotate/mirror) —
                // копируем точки напрямую. Иначе — правильный Polygon (cx/cy/radius/sides).
                if (obj.points && obj.points.length >= 3) {
                    const newPoints = obj.points.map(p => ({
                        x: p.x - tempBounds.minX,
                        y: p.y - tempBounds.minY
                    }));
                    let pl = {
                        type: 'polygon',
                        points: newPoints,
                        closed: true,
                        id: Date.now() + Math.random() + index
                    };
                    if (obj.color) pl.color = obj.color;
                    pl.getVertices = function() { return this.points; };
                    pl.getPoints = function() { return this.points; };
                    pl.draw = function(ctx) {
                        if (!this.points || this.points.length < 2) return;
                        ctx.strokeStyle = this.color || '#00aadd';
                        ctx.beginPath();
                        ctx.moveTo(this.points[0].x, this.points[0].y);
                        for (let i = 1; i < this.points.length; i++) {
                            ctx.lineTo(this.points[i].x, this.points[i].y);
                        }
                        ctx.closePath();
                        ctx.stroke();
                    };
                    pl.contains = function(x, y) {
                        if (!this.points || this.points.length < 3) return false;
                        let inside = false;
                        for (let i = 0, j = this.points.length - 1; i < this.points.length; j = i++) {
                            if (((this.points[i].y > y) !== (this.points[j].y > y)) &&
                                (x < (this.points[j].x - this.points[i].x) * (y - this.points[i].y) / (this.points[j].y - this.points[i].y) + this.points[i].x)) {
                                inside = !inside;
                            }
                        }
                        return inside;
                    };
                    pl.move = function(dx, dy) {
                        this.points.forEach(p => { p.x += dx; p.y += dy; });
                    };
                    pl.clone = function() {
                        const copy = { ...this };
                        copy.points = this.points.map(p => ({ x: p.x, y: p.y }));
                        copy.id = Date.now() + Math.random();
                        return copy;
                    };
                    return pl;
                }
                const polygon = new Polygon(
                    obj.cx - tempBounds.minX,
                    obj.cy - tempBounds.minY,
                    obj.radius,
                    obj.sides
                );
                if (obj.color) polygon.color = obj.color;
                return polygon;
            } else if (obj.type === 'text') {
                const text = new Text(
                    obj.x - tempBounds.minX,
                    obj.y - tempBounds.minY,
                    obj.text,
                    obj.fontSize
                );
                if (obj.color) text.color = obj.color;
                return text;
            } else if (obj.type === 'arc') {
                // v4.60: Копирование дуги с нормализацией координат
                const arc = new Arc(
                    obj.cx - tempBounds.minX,
                    obj.cy - tempBounds.minY,
                    obj.radius,
                    obj.startAngle,
                    obj.endAngle,
                    obj.direction
                );
                arc.id = Date.now() + Math.random() + index;
                if (obj.color) arc.color = obj.color;
                if (obj._isContinuous !== undefined) arc._isContinuous = obj._isContinuous;
                if (obj._effectiveLineType) arc._effectiveLineType = obj._effectiveLineType;
                if (obj._layerIsAuxiliary !== undefined) arc._layerIsAuxiliary = obj._layerIsAuxiliary;
                if (obj.layer) arc.layer = obj.layer;
                return arc;
            } else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
                // v4.60: Копирование полилинии с нормализацией
                const newPoints = (obj.points || obj.vertices || []).map(p => ({
                    x: p.x - tempBounds.minX,
                    y: p.y - tempBounds.minY
                }));
                let pl = {
                    type: obj.type,
                    points: newPoints,
                    closed: obj.closed === true,
                    id: Date.now() + Math.random() + index
                };
                if (obj.color) pl.color = obj.color;
                if (obj._isContinuous !== undefined) pl._isContinuous = obj._isContinuous;
                if (obj._effectiveLineType) pl._effectiveLineType = obj._effectiveLineType;
                if (obj._layerIsAuxiliary !== undefined) pl._layerIsAuxiliary = obj._layerIsAuxiliary;
                if (obj.layer) pl.layer = obj.layer;
                // Добавляем методы
                if (typeof addPolylineMethods === 'function') {
                    pl = addPolylineMethods(pl);
                } else {
                    pl.draw = function(ctx) {
                        if (!this.points || this.points.length < 2) return;
                        ctx.beginPath();
                        ctx.moveTo(this.points[0].x, this.points[0].y);
                        for (let i = 1; i < this.points.length; i++) ctx.lineTo(this.points[i].x, this.points[i].y);
                        if (this.closed) ctx.closePath();
                        ctx.stroke();
                    };
                    pl.contains = function(x, y) {
                        if (!this.points || this.points.length < 2) return false;
                        const segCount = this.closed ? this.points.length : this.points.length - 1;
                        for (let i = 0; i < segCount; i++) {
                            const p1 = this.points[i];
                            const p2 = this.points[(i + 1) % this.points.length];
                            const dx = p2.x - p1.x, dy = p2.y - p1.y;
                            const len = Math.sqrt(dx * dx + dy * dy);
                            if (len < 0.001) continue;
                            const t = Math.max(0, Math.min(1, ((x - p1.x) * dx + (y - p1.y) * dy) / (len * len)));
                            const px = p1.x + t * dx, py = p1.y + t * dy;
                            if (Math.sqrt((x - px) ** 2 + (y - py) ** 2) < 3) return true;
                        }
                        return false;
                    };
                    pl.getPoints = function() { return this.points; };
                    pl.getVertices = function() { return this.points; };
                }
                return pl;
            } else if (obj.type === 'spline') {
                // v4.60: Копирование сплайна
                const newPts = (obj.fitPoints || obj.controlPoints || obj.points || obj.vertices || []).map(p => ({
                    x: p.x - tempBounds.minX,
                    y: p.y - tempBounds.minY
                }));
                const sp = {
                    type: 'spline',
                    fitPoints: newPts,
                    controlPoints: [...newPts],
                    points: [...newPts],
                    vertices: [...newPts],
                    closed: obj.closed === true,
                    isClosed: obj.isClosed === true,
                    id: Date.now() + Math.random() + index
                };
                if (obj.color) sp.color = obj.color;
                if (obj.layer) sp.layer = obj.layer;
                sp.draw = function(ctx) {
                    const pts = this.fitPoints || this.points || [];
                    if (pts.length < 2) return;
                    ctx.beginPath();
                    ctx.moveTo(pts[0].x, pts[0].y);
                    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
                    if (this.closed || this.isClosed) ctx.closePath();
                    ctx.stroke();
                };
                sp.getPoints = function() { return this.fitPoints || this.points || []; };
                sp.contains = function(x, y) {
                    const pts = this.fitPoints || this.points || [];
                    if (pts.length < 2) return false;
                    for (let i = 0; i < pts.length - 1; i++) {
                        const dx = pts[i+1].x - pts[i].x, dy = pts[i+1].y - pts[i].y;
                        const len = Math.sqrt(dx * dx + dy * dy);
                        if (len < 0.001) continue;
                        const t = Math.max(0, Math.min(1, ((x - pts[i].x) * dx + (y - pts[i].y) * dy) / (len * len)));
                        const px = pts[i].x + t * dx, py = pts[i].y + t * dy;
                        if (Math.sqrt((x - px) ** 2 + (y - py) ** 2) < 3) return true;
                    }
                    return false;
                };
                return sp;
            } else if (obj.type === 'ellipse') {
                // v4.60: Копирование эллипса
                const el = {
                    type: 'ellipse',
                    cx: obj.cx - tempBounds.minX,
                    cy: obj.cy - tempBounds.minY,
                    rx: obj.rx,
                    ry: obj.ry,
                    id: Date.now() + Math.random() + index
                };
                if (obj.color) el.color = obj.color;
                if (obj.layer) el.layer = obj.layer;
                el.draw = function(ctx) {
                    ctx.save();
                    ctx.translate(this.cx, this.cy);
                    ctx.scale(this.rx, this.ry);
                    ctx.beginPath();
                    ctx.arc(0, 0, 1, 0, Math.PI * 2);
                    ctx.restore();
                    ctx.stroke();
                };
                el.getPoints = function() {
                    const pts = [];
                    for (let i = 0; i < 36; i++) {
                        const a = (2 * Math.PI * i) / 36;
                        pts.push({ x: this.cx + Math.cos(a) * this.rx, y: this.cy + Math.sin(a) * this.ry });
                    }
                    return pts;
                };
                el.contains = function(x, y) {
                    const dx = (x - this.cx) / this.rx;
                    const dy = (y - this.cy) / this.ry;
                    return Math.sqrt(dx * dx + dy * dy) < 1.1;
                };
                return el;
            }
            // [FIX #3] Не возвращаем ссылку на оригинал!
            console.warn(`${logPrefix} ⚠ Неизвестный тип объекта "${obj.type}" (индекс ${index}), пропускаем`);
            return null;
        }).filter(Boolean); // Убираем null-записи

        console.log(`${logPrefix} ✓ Скопировано объектов: ${copyObjects.length} из ${selectedObjects.length}`);

        if (copyObjects.length === 0) {
            console.error(`${logPrefix} ❌ Нет валидных объектов после копирования`);
            alert('⚠️ Не удалось скопировать объекты — неизвестные типы');
            return;
        }

        // ─── Пересчёт границ после нормализации ───────────
        // [FIX #9] Используем ту же getGroupBounds для единообразия
        const normalizedBounds = getGroupBounds(copyObjects);
        console.log(`${logPrefix} Нормализованные границы:`, {
            width: normalizedBounds.width,
            height: normalizedBounds.height
        });

        // ─── Создание объекта детали ──────────────────────
        // [FIX v2] Отложенная генерация ID — только после ВСЕХ проверок
        const candidateId = currentPartId + 1;
        const part = {
            id: candidateId,
            objects: copyObjects,
            quantity: quantity,
            name: name || `Деталь #${candidateId}`,
            thickness: thickness,
            bounds: {
                minX: 0,
                minY: 0,
                maxX: normalizedBounds.width,
                maxY: normalizedBounds.height,
                width: normalizedBounds.width,
                height: normalizedBounds.height
            },
            nestingEnabled: true,
            visible: false,
            rotationMode: 'auto',
            oneCutEnabled: false,
            noRotate: false,
            allowedAngles: [],
            spacing: spacing
        };

        console.log(`${logPrefix} Деталь собрана:`, {
            id: part.id,
            name: part.name,
            quantity: part.quantity,
            thickness: part.thickness,
            spacing: part.spacing,
            bounds: `${part.bounds.width}×${part.bounds.height}`,
            objectsCount: part.objects.length
        });

        // ─── [FIX #1] Проверка дубликатов ID с реальной защитой ──
        const duplicate = parts.find(p => p.id === part.id);
        if (duplicate) {
            console.error(`${logPrefix} ❌ Дубликат ID ${part.id}! Уже существует: "${duplicate.name}"`);
            const maxId = parts.reduce((max, p) => Math.max(max, p.id), 0);
            part.id = maxId + 1;
            console.warn(`${logPrefix} ⚠ Новый ID назначен: ${part.id}`);
        }

        // ─── Валидация созданной детали ───────────────────
        const partValid = validatePart(part);
        if (!partValid.valid) {
            console.error(`${logPrefix} ❌ Ошибка валидации детали:`, partValid.errors);
            alert(`⚠️ Ошибка создания детали\n\n${partValid.errors.join('\n')}`);
            return;
        }
        console.log(`${logPrefix} ✓ Валидация детали пройдена`);

        // ─── Фиксируем ID только после всех проверок ──────
        // [FIX v2] currentPartId мутируется только если деталь точно будет добавлена
        currentPartId = part.id;

        // ─── Добавление в массив ──────────────────────────
        // v4.68: Новая деталь — в НАЧАЛО списка (а не в конец)
        parts.unshift(part);
        if (typeof syncGlobalsToStore === 'function') {
            syncGlobalsToStore();
            console.log(`${logPrefix} ✓ syncGlobalsToStore выполнен`);
        }

        // ─── Удаление исходных объектов с холста ──────────
        // v4.72: ИСПРАВЛЕНО — сначала фильтруем, потом заменяем.
        // Раньше objects.length = 0 очищал массив, потом filter работал с пустым.
        const beforeCount = objects.length;
        const remaining = objects.filter(obj => !selectedObjects.includes(obj));
        objects.length = 0;
        objects.push(...remaining);
        const removedCount = beforeCount - objects.length;
        console.log(`${logPrefix} ✓ Удалено объектов с холста: ${removedCount} (было ${beforeCount}, стало ${objects.length})`);

        // ─── Обновление UI ────────────────────────────────
        updatePartsList();
        selectedObjects.length = 0;
        showProperties(null);
        render();

        // ─── АВТОРАСКЛАДКА — если включена ───────────────
        const autoNestingCheckbox = document.getElementById('autoNestingCheckbox');
        if (autoNestingCheckbox && autoNestingCheckbox.checked) {
            console.log('🚀 Авторасскладка: запуск раскладки...');
            // Небольшая задержка для обновления UI
            setTimeout(async () => {
                try {
                    // Имитируем клик по кнопке раскладки
                    const nestBtn = document.getElementById('nestMultiParts');
                    if (nestBtn && typeof nestBtn.onclick === 'function') {
                        nestBtn.onclick();
                    } else if (nestBtn) {
                        // Фолбэк: прямой вызов через event
                        nestBtn.dispatchEvent(new MouseEvent('click'));
                    }
                } catch (err) {
                    console.error('❌ Ошибка авторасскладки:', err);
                }
            }, 300);
        }

        // [FIX #13] Один итоговый лог вместо двух
        console.log(`${logPrefix} ✅ Деталь #${part.id} "${part.name}" успешно создана`, {
            размер: `${part.bounds.width}×${part.bounds.height}`,
            количество: part.quantity,
            толщина: `${part.thickness} мм`,
            зазор: part.spacing !== undefined ? `${part.spacing} мм` : 'из UI-поля',
            объектов: part.objects.length
        });

    } catch (err) {
        // [FIX #8] Откат состояния при ошибке
        // [FIX v2] Откатываем только если saveState реально был вызван
        console.error(`${logPrefix} 💥 НЕПРЕДВИДЕННАЯ ОШИБКА:`, err);

        if (stateSaved && typeof undoState === 'function') {
            try {
                undoState();
                console.log(`${logPrefix} ↩ Состояние откачено (undoState)`);
            } catch (undoErr) {
                console.error(`${logPrefix} ❌ Ошибка отката состояния:`, undoErr);
            }
        }

        alert(`⚠️ Ошибка при создании детали\n\n${err.message}`);

    } finally {
        // [FIX #10] Снимаем блокировку в любом случае
        _creatingPart = false;
    }
}
