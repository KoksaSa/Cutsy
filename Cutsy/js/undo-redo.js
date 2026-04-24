// ═══════════════════════════════════════════════════════════════
// UNDO / REDO - Система отмены и повтора действий
// ═══════════════════════════════════════════════════════════════

/**
 * Сохранить текущее состояние в стек отмены
 */
function saveState() {
    const state = {
        objects: JSON.parse(JSON.stringify(objects.map(obj => {
            if (obj.type === 'line') {
                return { type: 'line', x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2, id: obj.id };
            } else if (obj.type === 'circle') {
                return { type: 'circle', cx: obj.cx, cy: obj.cy, radius: obj.radius, id: obj.id };
            } else if (obj.type === 'rect') {
                return { type: 'rect', x: obj.x, y: obj.y, width: obj.width, height: obj.height, id: obj.id };
            } else if (obj.type === 'polygon') {
                return { type: 'polygon', cx: obj.cx, cy: obj.cy, radius: obj.radius, sides: obj.sides, id: obj.id };
            } else if (obj.type === 'text') {
                return { type: 'text', x: obj.x, y: obj.y, text: obj.text, fontSize: obj.fontSize, id: obj.id };
            }
            return obj;
        }))),
        dimensionLines: JSON.parse(JSON.stringify(dimensionLines)),
        parts: JSON.parse(JSON.stringify(parts)),
        nestedParts: JSON.parse(JSON.stringify(nestedParts)),
        selectedObjects: [],
        selectedNestedParts: [],
        selectedDimension: null,
        selectedEdge: null
    };

    undoStack.push(state);

    // Ограничиваем размер стека
    if (undoStack.length > MAX_UNDO) {
        undoStack.shift();
    }

    // Очищаем стек повтора при новом действии
    redoStack = [];

    // Обновляем UI
    if (typeof updateStatusBar === 'function') {
        updateStatusBar();
    }
}

/**
 * Отменить последнее действие (Undo)
 */
function undo() {
    if (undoStack.length === 0) {
        console.log('↩️ Нет действий для отмены');
        return;
    }

    // Сохраняем текущее состояние в redo
    const currentState = {
        objects: JSON.parse(JSON.stringify(objects.map(obj => {
            if (obj.type === 'line') {
                return { type: 'line', x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2, id: obj.id };
            } else if (obj.type === 'circle') {
                return { type: 'circle', cx: obj.cx, cy: obj.cy, radius: obj.radius, id: obj.id };
            } else if (obj.type === 'rect') {
                return { type: 'rect', x: obj.x, y: obj.y, width: obj.width, height: obj.height, id: obj.id };
            } else if (obj.type === 'polygon') {
                return { type: 'polygon', cx: obj.cx, cy: obj.cy, radius: obj.radius, sides: obj.sides, id: obj.id };
            } else if (obj.type === 'text') {
                return { type: 'text', x: obj.x, y: obj.y, text: obj.text, fontSize: obj.fontSize, id: obj.id };
            }
            return obj;
        }))),
        dimensionLines: JSON.parse(JSON.stringify(dimensionLines)),
        parts: JSON.parse(JSON.stringify(parts)),
        nestedParts: JSON.parse(JSON.stringify(nestedParts))
    };
    redoStack.push(currentState);

    // Восстанавливаем предыдущее состояние
    const state = undoStack.pop();
    restoreState(state);

    console.log(`↩️ Отменено. Осталось в истории: ${undoStack.length}`);
}

/**
 * Повторить отменённое действие (Redo)
 */
function redo() {
    if (redoStack.length === 0) {
        console.log('↪️ Нет действий для повтора');
        return;
    }

    // Сохраняем текущее состояние в undo
    const currentState = {
        objects: JSON.parse(JSON.stringify(objects.map(obj => {
            if (obj.type === 'line') {
                return { type: 'line', x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2, id: obj.id };
            } else if (obj.type === 'circle') {
                return { type: 'circle', cx: obj.cx, cy: obj.cy, radius: obj.radius, id: obj.id };
            } else if (obj.type === 'rect') {
                return { type: 'rect', x: obj.x, y: obj.y, width: obj.width, height: obj.height, id: obj.id };
            } else if (obj.type === 'polygon') {
                return { type: 'polygon', cx: obj.cx, cy: obj.cy, radius: obj.radius, sides: obj.sides, id: obj.id };
            } else if (obj.type === 'text') {
                return { type: 'text', x: obj.x, y: obj.y, text: obj.text, fontSize: obj.fontSize, id: obj.id };
            }
            return obj;
        }))),
        dimensionLines: JSON.parse(JSON.stringify(dimensionLines)),
        parts: JSON.parse(JSON.stringify(parts)),
        nestedParts: JSON.parse(JSON.stringify(nestedParts))
    };
    undoStack.push(currentState);

    // Восстанавливаем состояние из redo
    const state = redoStack.pop();
    restoreState(state);

    console.log(`↪️ Повторено. Осталось для повтора: ${redoStack.length}`);
}

/**
 * Восстановить состояние из объекта
 */
function restoreState(state) {
    if (!state) return;

    // Восстанавливаем объекты
    if (state.objects) {
        objects = state.objects.map(objData => {
            if (objData.type === 'line') {
                return new Line(objData.x1, objData.y1, objData.x2, objData.y2);
            } else if (objData.type === 'circle') {
                return new Circle(objData.cx, objData.cy, objData.radius);
            } else if (objData.type === 'rect') {
                return new Rect(objData.x, objData.y, objData.width, objData.height);
            } else if (objData.type === 'polygon') {
                return new Polygon(objData.cx, objData.cy, objData.radius, objData.sides);
            } else if (objData.type === 'text') {
                return new Text(objData.x, objData.y, objData.text, objData.fontSize);
            }
            return objData;
        });
    }

    // Восстанавливаем размерные линии
    if (state.dimensionLines) {
        dimensionLines = state.dimensionLines.map(d => ({
            ...d,
            type: d.type || 'custom'
        }));
    }

    // Восстанавливаем детали
    if (state.parts) {
        parts = state.parts;
    }

    // Восстанавливаем размещённые детали
    if (state.nestedParts) {
        nestedParts = state.nestedParts;
    }

    // Сбрасываем выделение
    selectedObjects = [];
    selectedNestedParts = [];
    selectedDimension = null;
    selectedEdge = null;

    // Обновляем UI
    if (typeof render === 'function') render();
    if (typeof updatePartsList === 'function') updatePartsList();
    if (typeof updateStatusBar === 'function') updateStatusBar();
    if (typeof showProperties === 'function') showProperties(null);
}

// ═══════════════════════════════════════════════════════════════
// ГЛОБАЛЬНЫЙ ДОСТУП
// ═══════════════════════════════════════════════════════════════
window.saveState = saveState;
window.undo = undo;
window.redo = redo;

console.log('✅ Undo/Redo система загружена');
