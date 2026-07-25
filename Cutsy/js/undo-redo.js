// ═══════════════════════════════════════════════════════════════
// undo-redo.js — система отмены/повтора действий
// v3.36 — исправлены баги:
//   #1  Потеря arc/polyline/lwpolyline при сериализации
//   #2  Добавление/удаление деталей не отменялось
//   #6  Кэш не обновлялся после undo/redo
//   #9  Дублирование objects = restoredObjects
//   #14 MAX_UNDO без fallback
//   +   Сохранение объектов невидимых деталей
// ═══════════════════════════════════════════════════════════════

// undo-redo.js v3.36 загружен

// Стек состояний для undo/redo
// ✅ Используем уже объявленные в globals.js: undoStack, redoStack, MAX_UNDO
// Не объявляем здесь, чтобы избежать конфликта "already declared"
// ✅ БАГФИКС #14: Добавлен fallback если MAX_UNDO не определён
const MAX_UNDO_STEPS = (typeof MAX_UNDO !== 'undefined') ? MAX_UNDO : 50;

// ✅ Флаг: блокируем saveState() во время undo/redo
let isUndoRedoInProgress = false;

// ═══════════════════════════════════════════════════════════════
// БАГФИКС #1: Сериализация/десериализация объектов ВСЕХ типов
// ═══════════════════════════════════════════════════════════════

/**
 * Сериализация одного объекта для сохранения в стек undo/redo
 * @param {Object} o - Объект геометрии
 * @returns {Object|null} Сериализованный объект или null
 */
function serializeObject(o) {
    if (!o || !o.type) return null;
    const base = { type: o.type, id: o.id };
    // Сохраняем цвет и метаданные пунктирных/вспомогательных линий
    if (o.color) base.color = o.color;
    if (o._isContinuous !== undefined) base._isContinuous = o._isContinuous;
    if (o._effectiveLineType) base._effectiveLineType = o._effectiveLineType;
    if (o._layerIsAuxiliary !== undefined) base._layerIsAuxiliary = o._layerIsAuxiliary;
    if (o.layer) base.layer = o.layer;
    switch (o.type) {
        case 'line':
            return { ...base, x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2 };
        case 'circle':
            return { ...base, cx: o.cx, cy: o.cy, radius: o.radius };
        case 'rect':
            return { ...base, x: o.x, y: o.y, width: o.width, height: o.height };
        case 'polygon':
            return { ...base, cx: o.cx, cy: o.cy, radius: o.radius, sides: o.sides,
                     points: o.points ? o.points.map(p => ({x: p.x, y: p.y})) : undefined,
                     vertices: o.vertices ? o.vertices.map(p => ({x: p.x, y: p.y})) : undefined };
        case 'arc':
            return { ...base,
                     cx: o.cx, cy: o.cy,
                     center: o.center ? {x: o.center.x, y: o.center.y} : undefined,
                     radius: o.radius,
                     startAngle: o.startAngle, endAngle: o.endAngle,
                     direction: o.direction };
        case 'polyline':
            return { ...base, points: o.points ? o.points.map(p => ({x: p.x, y: p.y})) : undefined,
                     vertices: o.vertices ? o.vertices.map(p => ({x: p.x, y: p.y})) : undefined,
                     closed: o.closed === true };
        case 'lwpolyline':
            return { ...base, points: o.points ? o.points.map(p => ({x: p.x, y: p.y})) : undefined,
                     vertices: o.vertices ? o.vertices.map(p => ({x: p.x, y: p.y})) : undefined,
                     closed: o.closed === true };
        case 'text':
            return { ...base, x: o.x, y: o.y, text: o.text, fontSize: o.fontSize };
        default:
            // Неизвестный тип — сохраняем все собственные перечислимые свойства
            for (const key of Object.keys(o)) {
                const val = o[key];
                if (typeof val === 'function') continue;
                if (val && typeof val === 'object' && !Array.isArray(val)) {
                    base[key] = {...val};
                } else if (Array.isArray(val)) {
                    base[key] = val.map(p => (p && typeof p === 'object') ? {...p} : p);
                } else {
                    base[key] = val;
                }
            }
            return base;
    }
}

/**
 * Десериализация одного объекта из стека undo/redo
 * Пытается создать экземпляр через конструктор, при ошибке — возвращает plain object
 * @param {Object} obj - Сериализованный объект
 * @returns {Object|null} Восстановленный объект или null
 */
function deserializeObject(obj) {
    if (!obj || !obj.type) return null;
    try {
        let instance = null;
        switch (obj.type) {
            case 'line':
                instance = new Line(obj.x1, obj.y1, obj.x2, obj.y2);
                break;
            case 'circle':
                instance = new Circle(obj.cx, obj.cy, obj.radius);
                break;
            case 'rect':
                instance = new Rect(obj.x, obj.y, obj.width, obj.height);
                break;
            case 'polygon':
                instance = new Polygon(obj.cx, obj.cy, obj.radius, obj.sides);
                break;
            case 'arc':
                if (typeof Arc === 'function') {
                    const arcCx = obj.cx || (obj.center ? obj.center.x : 0);
                    const arcCy = obj.cy || (obj.center ? obj.center.y : 0);
                    instance = new Arc(arcCx, arcCy, obj.radius, obj.startAngle, obj.endAngle, obj.direction);
                    // Принудительно перезаписываем критичные свойства,
                    // т.к. конструктор может установить direction/angles по умолчанию
                    instance.startAngle = obj.startAngle;
                    instance.endAngle = obj.endAngle;
                    instance.direction = obj.direction;
                    instance.radius = obj.radius;
                    if (obj.center) instance.center = {x: obj.center.x, y: obj.center.y};
                }
                break;
            case 'polyline':
            case 'lwpolyline':
                if (typeof createPolyline === 'function') {
                    instance = createPolyline({
                        type: obj.type,
                        points: obj.points || obj.vertices || [],
                        closed: obj.closed === true,
                        id: obj.id
                    });
                } else if (typeof Polyline === 'function') {
                    instance = new Polyline(obj.points || obj.vertices);
                    // Восстанавливаем closed, т.к. конструктор его не принимает
                    if (obj.closed === true) instance.closed = true;
                }
                break;
            case 'text':
                if (typeof Text === 'function') {
                    instance = new Text(obj.x, obj.y, obj.text, obj.fontSize);
                }
                break;
            default:
                break;
        }

        if (instance) {
            if (obj.id !== undefined) instance.id = obj.id;
            // Копируем свойства, которые конструктор мог не установить
            Object.keys(obj).forEach(key => {
                if (!(key in instance)) {
                    instance[key] = obj[key];
                }
            });
            // Перезаписываем цвет и метаданные поверх дефолтных значений конструктора
            // (конструкторы Line/Circle/Rect всегда ставят color='#00aadd')
            if (obj.color !== undefined) instance.color = obj.color;
            if (obj._isContinuous !== undefined) instance._isContinuous = obj._isContinuous;
            if (obj._effectiveLineType !== undefined) instance._effectiveLineType = obj._effectiveLineType;
            if (obj._layerIsAuxiliary !== undefined) instance._layerIsAuxiliary = obj._layerIsAuxiliary;
            if (obj.layer !== undefined) instance.layer = obj.layer;
            return instance;
        }

        // Fallback: конструктор недоступен — создаём объект с методами отрисовки
        // v3.55: Без методов draw/getPoints арки не отрисовываются после undo/redo
        const fallback = {...obj};
        if (obj.type === 'arc') {
            // Добавляем методы Arc.prototype как instance-методы
            fallback.getPoints = function(segments) {
                segments = segments || 36;
                const pts = [];
                let sweep;
                if (this.direction === 'CW') {
                    sweep = this.startAngle - this.endAngle;
                    if (sweep < 0) sweep += Math.PI * 2;
                } else {
                    sweep = this.endAngle - this.startAngle;
                    if (sweep < 0) sweep += Math.PI * 2;
                }
                const step = sweep / segments;
                const dir = this.direction === 'CW' ? -1 : 1;
                for (let i = 0; i <= segments; i++) {
                    const angle = this.startAngle + dir * step * i;
                    pts.push({
                        x: this.cx + Math.cos(angle) * this.radius,
                        y: this.cy + Math.sin(angle) * this.radius
                    });
                }
                return pts;
            };
            fallback.getStartPoint = function() {
                return { x: this.cx + Math.cos(this.startAngle) * this.radius, y: this.cy + Math.sin(this.startAngle) * this.radius };
            };
            fallback.getEndPoint = function() {
                return { x: this.cx + Math.cos(this.endAngle) * this.radius, y: this.cy + Math.sin(this.endAngle) * this.radius };
            };
        } else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
            // Пробуем использовать createPolyline для получения прототипных методов
            if (typeof createPolyline === 'function') {
                return createPolyline({
                    type: obj.type,
                    points: obj.points || obj.vertices || [],
                    closed: obj.closed === true,
                    id: obj.id
                });
            }
            // Fallback: создаём объект с методами отрисовки
            fallback.closed = obj.closed === true;
            fallback.getPoints = function() { return this.points || this.vertices || []; };
            fallback.contains = function(px, py) {
                // Ray-casting algorithm для проверки точки внутри замкнутого контура
                if (!this.closed) return false;
                const pts = this.points || this.vertices;
                if (!pts || pts.length < 3) return false;
                let inside = false;
                for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
                    const xi = pts[i].x, yi = pts[i].y;
                    const xj = pts[j].x, yj = pts[j].y;
                    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
                        inside = !inside;
                    }
                }
                return inside;
            };
            fallback.draw = function(ctx) {
                const pts = this.points || this.vertices;
                if (!pts || pts.length < 2) return;
                ctx.beginPath();
                ctx.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
                if (this.closed) ctx.closePath();
                ctx.stroke();
            };
        }
        return fallback;
    } catch (e) {
        console.warn('↩️ [deserializeObject] Ошибка восстановления объекта:', obj.type, e.message);
        return {...obj};
    }
}

// ═══════════════════════════════════════════════════════════════
// Сохранить текущее состояние в стек
// ═══════════════════════════════════════════════════════════════
function saveState() {
    // ✅ Блокируем сохранение во время undo/redo
    if (isUndoRedoInProgress) {
        return;
    }

    try {
        // Синхронизируем allSheets с window.allSheets перед сохранением
        if (window.allSheets && window.allSheets.length > 0) {
            allSheets = window.allSheets;
        } else if (allSheets && allSheets.length > 0) {
            window.allSheets = allSheets;
        }
        if (window.currentSheetIndex !== undefined) {
            currentSheetIndex = window.currentSheetIndex;
        } else {
            window.currentSheetIndex = currentSheetIndex;
        }

        // Собираем ВСЕ объекты (с холста + из невидимых деталей)
        const allObjectsMap = new Map();
        const ensureId = (o) => {
            if (!o) return;
            if (o.id === undefined || o.id === null) {
                o.id = Date.now() + Math.random();
            }
            allObjectsMap.set(o.id, o);
        };
        objects.forEach(ensureId);
        parts.forEach(p => {
            if (p.objects) {
                p.objects.forEach(ensureId);
            }
        });

        // ID объектов, которые должны быть на холсте (видимые)
        const canvasObjectIds = objects.filter(o => o && o.id !== undefined).map(o => o.id);

        // Сериализуем все уникальные объекты
        const serializedAllObjects = Array.from(allObjectsMap.values())
            .map(o => serializeObject(o))
            .filter(Boolean);

        const state = {
            allObjects: serializedAllObjects,
            canvasObjectIds: canvasObjectIds,

            parts: parts.map(p => ({
                id: p.id, name: p.name, quantity: p.quantity,
                thickness: p.thickness, spacing: p.spacing,
                nestingEnabled: p.nestingEnabled,
                allowedAngles: p.allowedAngles ? [...p.allowedAngles] : [],
                noRotate: p.noRotate,
                oneCutEnabled: p.oneCutEnabled,
                rotationMode: p.rotationMode,
                visible: p.visible,
                bounds: p.bounds ? {...p.bounds} : null,
                contour: p.contour ? p.contour.map(pt => ({x: pt.x, y: pt.y})) : null,
                objectIds: (p.objects || []).map(o => o.id)
            })),

            // СОХРАНЕНИЕ ЛИСТА РАСКЛАДКИ (nestedParts, allSheets)
            nestedParts: nestedParts.map(n => ({ ...n })),
            allSheets: allSheets.map(s => ({
                ...s,
                nestedParts: s.nestedParts.map(n => ({ ...n })),
                partDefinitions: s.partDefinitions ? { ...s.partDefinitions } : undefined
            })),
            currentSheetIndex: currentSheetIndex,
            showSheetView: showSheetView
        };

        undoStack.push(JSON.stringify(state));
        if (undoStack.length > MAX_UNDO_STEPS) {
            undoStack.shift();
        }
        
        // Очищаем redoStack при новом действии
        redoStack = [];  // Очищаем redo при новом действии
        
        // Обновляем индикатор в статус-баре
        const undoEl = document.getElementById('undoStack');
        if (undoEl) undoEl.textContent = `История: ${undoStack.length}`;
    } catch (e) {
        console.warn('↩️ [saveState] Ошибка сохранения состояния:', e.message);
    }
}

// ═══════════════════════════════════════════════════════════════
// Вспомогательная функция: восстановить состояние из строки
// ═══════════════════════════════════════════════════════════════
function restoreState(stateStr, source) {
    const state = JSON.parse(stateStr);
    console.log(`↩️ [restoreState:${source}] restoreState вызван. undoStack: ${undoStack.length}, redoStack: ${redoStack.length}`);
    
    // Восстанавливаем состояние

    // ═════════════════════════════════════════════════════════
    // БАГФИКС #1 + невидимые детали:
    // Десериализуем ВСЕ объекты (canvas + скрытые в деталях)
    // ═════════════════════════════════════════════════════════
    let allRestoredObjects;

    // Поддержка старого формата (где objects — массив на холсте)
    if (state.allObjects && Array.isArray(state.allObjects)) {
        // Новый формат: allObjects содержит все объекты, canvasObjectIds — ID для холста
        allRestoredObjects = state.allObjects.map(obj => deserializeObject(obj)).filter(Boolean);
        const canvasIdSet = new Set(state.canvasObjectIds || []);
        objects = allRestoredObjects.filter(o => canvasIdSet.has(o.id));
    } else if (state.objects && Array.isArray(state.objects)) {
        // Старый формат (обратная совместимость)
        allRestoredObjects = state.objects.map(obj => deserializeObject(obj)).filter(Boolean);
        objects = allRestoredObjects;
    } else {
        allRestoredObjects = [];
        objects = [];
    }

    // ═════════════════════════════════════════════════════════
    // БАГФИКС #2: Полная замена массива parts (включая добавление/удаление)
    // ═════════════════════════════════════════════════════════
    const objectById = new Map(allRestoredObjects.map(o => [o.id, o]));

    parts = state.parts.map(savedPart => {
        const part = {
            id: savedPart.id,
            name: savedPart.name,
            quantity: savedPart.quantity,
            thickness: savedPart.thickness,
            spacing: savedPart.spacing,
            nestingEnabled: savedPart.nestingEnabled,
            allowedAngles: savedPart.allowedAngles ? [...savedPart.allowedAngles] : [],
            noRotate: savedPart.noRotate,
            oneCutEnabled: savedPart.oneCutEnabled,
            rotationMode: savedPart.rotationMode,
            visible: savedPart.visible || false,
            bounds: savedPart.bounds ? {...savedPart.bounds} : null,
            contour: savedPart.contour ? savedPart.contour.map(pt => ({x: pt.x, y: pt.y})) : null,
            objects: []
        };

        // Восстанавливаем ссылки part.objects по ID
        if (savedPart.objectIds && Array.isArray(savedPart.objectIds)) {
            part.objects = savedPart.objectIds
                .map(id => objectById.get(id))
                .filter(o => o !== undefined);
        }

        // Обновляем границы детали
        if (typeof updatePartBounds === 'function' && part.objects.length > 0) {
            try {
                updatePartBounds(part);
            } catch(e) {
                // calculateBounds может не существовать — используем сохранённые bounds
                console.warn(`↩️ [${source}] Не удалось обновить границы детали "${part.name}":`, e.message);
            }
        }

        return part;
    });

    // Состояние восстановлено

    // Восстанавливаем лист раскладки
    if (state.nestedParts) {
        nestedParts = state.nestedParts.map(n => ({ ...n }));
    }
    if (state.allSheets) {
        allSheets = state.allSheets.map(s => ({
            ...s,
            nestedParts: (s.nestedParts || []).map(n => ({ ...n })),
            partDefinitions: s.partDefinitions ? { ...s.partDefinitions } : undefined
        }));
        window.allSheets = allSheets;
    }
    if (typeof state.currentSheetIndex === 'number') {
        currentSheetIndex = state.currentSheetIndex;
        window.currentSheetIndex = currentSheetIndex;
    }
    if (typeof state.showSheetView === 'boolean') {
        showSheetView = state.showSheetView;
    }

    selectedObjects = [];
    selectedNestedParts = [];
    window.selectedNestedParts = selectedNestedParts;

    const undoEl = document.getElementById('undoStack');
    if (undoEl) undoEl.textContent = `История: ${undoStack.length}`;

    render();
    if (typeof updatePartsList === 'function') updatePartsList();

    // ✅ БАГФИКС #6: Обновляем кэш после undo/redo
    if (typeof saveToCache === 'function') saveToCache();
}

// Отменить последнее действие
function undo() {
    // undo
    if (undoStack.length === 0) {
        // Стек пуст
        console.warn('↩️ [undo] Стек пуст, нечего отменять');
        return;
    }

    // ✅ Блокируем saveState() во время undo
    isUndoRedoInProgress = true;

    const stateStr = undoStack.pop();
    try {
        restoreState(stateStr, 'undo');
        redoStack.push(stateStr);
        // Действие отменено
    } catch (e) {
        console.warn('↩️ [undo] Ошибка восстановления:', e.message);
    }

    // Снимаем блокировку
    isUndoRedoInProgress = false;
}

// Повторить последнее отменённое действие
function redo() {
    console.log(`▶️ [redo] ВХОД. redoStack.length=${redoStack.length}, undoStack.length=${undoStack.length}`);
    if (redoStack.length === 0) {
        console.warn('▶️ [redo] Стек redo пуст, нечего повторять');
        return;
    }

    // ✅ Блокируем saveState() во время redo
    isUndoRedoInProgress = true;

    const stateStr = redoStack.pop();
    try {
        restoreState(stateStr, 'redo');
        undoStack.push(stateStr);
        // Действие повторено
    } catch (e) {
        console.warn('▶️ [redo] Ошибка восстановления:', e.message);
    }

    // Снимаем блокировку
    isUndoRedoInProgress = false;
}

// Делаем функции глобально доступными
window.undo = undo;
window.redo = redo;
window.saveState = saveState;

// undo-redo.js v3.36 готов