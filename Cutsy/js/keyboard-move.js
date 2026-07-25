// ═══════════════════════════════════════════════════════════════
// keyboard-move.js — v1.0 — Перемещение объектов стрелками клавиатуры
// ═══════════════════════════════════════════════════════════════
// Стрелки перемещают ВЫДЕЛЕННЫЕ объекты (selectedObjects):
//   - Краткое нажатие: шаг 1мм
//   - Долгое нажатие (удержание > 500мс): шаг 10мм
//
// Ctrl+стрелки — всегда шаг 10мм (независимо от длительности).
// Стрелки работают только когда:
//   - Нет активного ввода в текстовом поле (input/textarea)
//   - Не активен инструмент рисования (select режим)
//   - Есть выделенные объекты
//
// После перемещения вызывается saveState() (один раз на отпускание)
// и render() для обновления холста.
// ═══════════════════════════════════════════════════════════════

(function() {
'use strict';

const STEP_SMALL = 1.0;   // мм — краткое нажатие (при zoom=1)
const STEP_LARGE = 10.0;  // мм — долгое нажатие / Ctrl (при zoom=1)
const HOLD_THRESHOLD = 500; // мс — порог перехода на большой шаг

/**
 * v4.97: Адаптивный шаг в зависимости от зума.
 * При zoom=1 → STEP_SMALL (1мм), при zoom=5 → 0.2мм, при zoom=10 → 0.1мм.
 * Чем больше зум — тем меньше шаг (тонкая настройка).
 * @param {number} baseStep — базовый шаг (STEP_SMALL или STEP_LARGE)
 * @returns {number} адаптированный шаг в мм
 */
function getAdaptiveStep(baseStep) {
    const z = (typeof zoom !== 'undefined') ? zoom : 1;
    const raw = baseStep / z;
    if (baseStep >= STEP_LARGE) {
        // Крупный шаг — округляем до целых, минимум 1
        return Math.max(1, Math.round(raw));
    }
    // Малый шаг — до 1 знака, минимум 0.1
    return Math.max(0.1, Math.round(raw * 10) / 10);
}

// Состояние удержания клавиш
const keyState = {}; // {ArrowUp: {startTime, fired, lastStep}}

// v1.1: Накопленная дельта перемещения стрелками (для отображения в #coords)
let keyboardMoveDelta = { x: 0, y: 0 };
let keyboardMoveActive = false; // активна ли серия перемещений стрелками

/**
 * Сбрасывает накопленную дельту (вызывается при клике мышью или новом старте).
 */
window.resetKeyboardMoveDelta = function() {
    keyboardMoveDelta = { x: 0, y: 0 };
    keyboardMoveActive = false;
};

// Сброс дельты при клике мышью (начало нового drag)
if (typeof canvas !== 'undefined' && canvas) {
    canvas.addEventListener('mousedown', () => {
        window.resetKeyboardMoveDelta();
    }, true); // capture phase — перехватываем раньше
}

window.addEventListener('keydown', (e) => {
    // Не обрабатываем, если фокус в текстовом поле
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;

    // Только стрелки
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;

    // Проверяем, что есть выделенные объекты
    if (typeof selectedObjects === 'undefined' || !selectedObjects || selectedObjects.length === 0) return;

    // Не обрабатываем в режиме рисования (кроме select)
    if (typeof currentTool !== 'undefined' && currentTool !== 'select' && currentTool !== 'fillet' && currentTool !== 'chamfer' && currentTool !== 'eraser') {
        // Разрешаем только в select-режиме
        if (currentTool !== 'select') return;
    }

    e.preventDefault(); // предотвращаем скролл страницы

    // Если клавиша уже нажата (повтор keydown) — игнорируем, обрабатываем в таймере
    if (keyState[e.key] && keyState[e.key].active) {
        return;
    }

    // Определяем шаг: Ctrl = всегда большой
    const useLargeStep = (typeof isCtrlPressed !== 'undefined' && isCtrlPressed) || e.ctrlKey;
    const step = getAdaptiveStep(useLargeStep ? STEP_LARGE : STEP_SMALL);

    // Выполняем первое перемещение сразу
    moveSelectedByKey(e.key, step);
    if (typeof saveState === 'function') {
        saveState();
    } else if (typeof window.saveState === 'function') {
        window.saveState();
    }

    // Запускаем таймер для долгого нажатия
    keyState[e.key] = {
        active: true,
        startTime: Date.now(),
        fired: true,
        largeStepStarted: false,
        intervalId: null
    };

    // Через HOLD_THRESHOLD мс — переключаемся на большой шаг (если не Ctrl)
    keyState[e.key].timeoutId = setTimeout(() => {
        if (!keyState[e.key] || !keyState[e.key].active) return;
        if (useLargeStep) return; // уже большой шаг
        keyState[e.key].largeStepStarted = true;
        // Повторяем перемещение с большим шагом каждые 80мс
        keyState[e.key].intervalId = setInterval(() => {
            if (!keyState[e.key] || !keyState[e.key].active) return;
            moveSelectedByKey(e.key, getAdaptiveStep(STEP_LARGE));
            if (typeof window.saveState === 'function') window.saveState();
        }, 80);
    }, HOLD_THRESHOLD);
});

window.addEventListener('keyup', (e) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const state = keyState[e.key];
    if (state) {
        state.active = false;
        if (state.timeoutId) clearTimeout(state.timeoutId);
        if (state.intervalId) clearInterval(state.intervalId);
    }
    delete keyState[e.key];
});

// Сброс при потере фокуса
window.addEventListener('blur', () => {
    for (const key of Object.keys(keyState)) {
        const state = keyState[key];
        if (state) {
            state.active = false;
            if (state.timeoutId) clearTimeout(state.timeoutId);
            if (state.intervalId) clearInterval(state.intervalId);
        }
        delete keyState[key];
    }
});

/**
 * Перемещает выделенные объекты в направлении стрелки.
 * @param {string} arrowKey — 'ArrowUp'/'ArrowDown'/'ArrowLeft'/'ArrowRight'
 * @param {number} step — шаг в мм
 */
function moveSelectedByKey(arrowKey, step) {
    let dx = 0, dy = 0;
    switch (arrowKey) {
        case 'ArrowUp':    dy = -step; break; // canvas Y-down: вверх = уменьшение Y
        case 'ArrowDown':  dy =  step; break;
        case 'ArrowLeft':  dx = -step; break;
        case 'ArrowRight': dx =  step; break;
        default: return;
    }

    // v1.1: Накапливаем дельту (для отображения в #coords)
    keyboardMoveActive = true;
    keyboardMoveDelta.x += dx;
    keyboardMoveDelta.y += dy;

    // Обновляем #coords как при мышином drag
    const coordsEl = document.getElementById('coords');
    if (coordsEl) {
        // Инверсия Y для отображения (CAD-style: вверх = +Y)
        // v4.97: Всегда показываем 1 знак после запятой
        const dispDx = keyboardMoveDelta.x.toFixed(1);
        const dispDy = (-keyboardMoveDelta.y).toFixed(1);
        coordsEl.textContent = `ΔX: ${keyboardMoveDelta.x >= 0 ? '+' : ''}${dispDx}, ΔY: ${-keyboardMoveDelta.y >= 0 ? '+' : ''}${dispDy} мм`;
    }

    if (typeof selectedObjects === 'undefined' || !selectedObjects) return;

    for (const obj of selectedObjects) {
        if (!obj) continue;
        if (typeof obj.move === 'function') {
            obj.move(dx, dy);
        } else {
            // Fallback: перемещаем вручную по типу
            moveObjectManual(obj, dx, dy);
        }
    }

    // Если редактируем деталь — обновляем bounds
    if (typeof isEditingPart !== 'undefined' && isEditingPart &&
        typeof editingPartId !== 'undefined' && editingPartId !== null &&
        typeof parts !== 'undefined' && typeof updatePartBounds === 'function') {
        const part = parts.find(p => samePartId(p.id, editingPartId));
        if (part) updatePartBounds(part);
    }

    // Обновляем холст
    if (typeof render === 'function') {
        render();
    } else if (typeof window.render === 'function') {
        window.render();
    }

    // Воспроизводим звук (если доступен)
    if (typeof playMoveSound === 'function') {
        playMoveSound();
    }
}

// ═══════════════════════════════════════════════════════════════
// v4.97: Точное перемещение по X / Y через prompt
// Нажми X → prompt "Переместить по X (мм):"
// Нажми Y → prompt "Переместить по Y (мм):"
// Плюс — вправо/вверх, минус — влево/вниз
// ═══════════════════════════════════════════════════════════════
window.addEventListener('keydown', (e) => {
    // Не обрабатываем, если фокус в текстовом поле
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
    // Только без модификаторов
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    const key = e.key.toLowerCase();

    // X / Ч — переместить по X
    if (key === 'x' || key === 'ч') {
        if (typeof selectedObjects === 'undefined' || !selectedObjects || selectedObjects.length === 0) return;
        if (typeof currentTool !== 'undefined' && currentTool !== 'select') return;
        e.preventDefault();

        const last = localStorage.getItem('lastMoveX') || '0';
        const str = prompt('Переместить по X (мм):\n  плюс — вправо, минус — влево', last);
        if (!str) return;
        const val = parseFloat(str.replace(',', '.'));
        if (isNaN(val)) return;
        localStorage.setItem('lastMoveX', str);

        if (typeof saveState === 'function') saveState();
        else if (typeof window.saveState === 'function') window.saveState();

        for (const obj of selectedObjects) {
            if (!obj) continue;
            if (typeof obj.move === 'function') obj.move(val, 0);
            else moveObjectManual(obj, val, 0);
        }
        updateAfterMove();
        return;
    }

    // Y / Н — переместить по Y
    if (key === 'y' || key === 'н') {
        if (typeof selectedObjects === 'undefined' || !selectedObjects || selectedObjects.length === 0) return;
        if (typeof currentTool !== 'undefined' && currentTool !== 'select') return;
        e.preventDefault();

        const last = localStorage.getItem('lastMoveY') || '0';
        const str = prompt('Переместить по Y (мм):\n  плюс — вверх, минус — вниз', last);
        if (!str) return;
        const val = parseFloat(str.replace(',', '.'));
        if (isNaN(val)) return;
        localStorage.setItem('lastMoveY', str);

        if (typeof saveState === 'function') saveState();
        else if (typeof window.saveState === 'function') window.saveState();

        // Canvas Y-down: плюс = вверх = отрицательная дельта по Y
        const dy = -val;
        for (const obj of selectedObjects) {
            if (!obj) continue;
            if (typeof obj.move === 'function') obj.move(0, dy);
            else moveObjectManual(obj, 0, dy);
        }
        updateAfterMove();
        return;
    }
});

/**
 * Обновляет bounds детали и холст после перемещения.
 */
function updateAfterMove() {
    if (typeof isEditingPart !== 'undefined' && isEditingPart &&
        typeof editingPartId !== 'undefined' && editingPartId !== null &&
        typeof parts !== 'undefined' && typeof updatePartBounds === 'function') {
        const part = parts.find(p => samePartId(p.id, editingPartId));
        if (part) updatePartBounds(part);
    }
    if (typeof render === 'function') render();
    else if (typeof window.render === 'function') window.render();
    if (typeof showProperties === 'function' && typeof selectedObjects !== 'undefined' && selectedObjects.length > 0) {
        showProperties(selectedObjects[0]);
    }
}

/**
 * Ручное перемещение объекта (fallback если нет метода move).
 */
function moveObjectManual(obj, dx, dy) {
    if (obj.type === 'line') {
        obj.x1 += dx; obj.y1 += dy;
        obj.x2 += dx; obj.y2 += dy;
    } else if (obj.type === 'circle' || obj.type === 'arc') {
        obj.cx += dx; obj.cy += dy;
    } else if (obj.type === 'rect') {
        obj.x += dx; obj.y += dy;
    } else if (obj.type === 'polygon') {
        if (obj.cx !== undefined) { obj.cx += dx; obj.cy += dy; }
        if (obj.points) obj.points.forEach(p => { p.x += dx; p.y += dy; });
    } else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
        if (obj.points) obj.points.forEach(p => { p.x += dx; p.y += dy; });
        if (obj.vertices) obj.vertices.forEach(p => { p.x += dx; p.y += dy; });
    } else if (obj.type === 'text') {
        if (obj.x !== undefined) { obj.x += dx; obj.y += dy; }
        else if (obj.center) { obj.center.x += dx; obj.center.y += dy; }
    }
}

console.log('✅ keyboard-move.js загружен (v1.3) — стрелки: перемещение (1мм, удержание 10мм) | X/Y: точное перемещение по оси');

})();
