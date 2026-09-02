// ═══════════════════════════════════════════════════════════════
// ruler-tool.js — v4.56 — Линейка для листа раскладки
// ═══════════════════════════════════════════════════════════════
// Инструмент измерения расстояний НА ЛИСТЕ раскладки:
//   - между деталями
//   - от края листа до детали
//   - между любыми двумя точками на листе
//
// Работает ТОЛЬКО когда showSheetView = true (лист показан)
// и активирован режим линейки (кнопка в панели свойств).
//
// Координаты: sheet-local (мм), Y-down (как на листе).
// ═══════════════════════════════════════════════════════════════

(function() {
'use strict';

// ── Состояние линейки ──
let rulerState = {
    active: false,        // режим линейки включён
    start: null,          // { x, y } — стартовая точка (sheet coords)
    preview: null,        // { x1, y1, x2, y2 } — live preview
    last: null,           // { x1, y1, x2, y2, dist, angleDeg } — последнее измерение
    measurements: [],     // массив завершённых измерений [{x1,y1,x2,y2,dist,angleDeg}]
};

// ── Максимальное количество сохраняемых измерений ──
const MAX_MEASUREMENTS = 20;

// ═══════════════════════════════════════════════════════════════
// ПЕРЕКЛЮЧЕНИЕ РЕЖИМА ЛИНЕЙКИ
// ═══════════════════════════════════════════════════════════════

function toggleRulerMode() {
    // Проверяем что лист показан
    if (typeof showSheetView === 'undefined' || !showSheetView) {
        alert('⚠️ Сначала покажите лист (кнопка "Показать лист").');
        return;
    }

    rulerState.active = !rulerState.active;

    const btn = document.getElementById('toggleRulerMode');
    if (btn) {
        if (rulerState.active) {
            btn.textContent = '📏 Линейка: ВКЛ';
            btn.style.background = '#00d4aa';
            btn.style.color = '#000';
            // Меняем курсор canvas на crosshair
            const canvas = document.getElementById('canvas');
            if (canvas) canvas.style.cursor = 'crosshair';
        } else {
            btn.textContent = '📏 Линейка: ВЫКЛ';
            btn.style.background = '#2d5a7a';
            btn.style.color = '';
            const canvas = document.getElementById('canvas');
            if (canvas) canvas.style.cursor = 'default';
            // Сбрасываем незавершённое измерение
            rulerState.start = null;
            rulerState.preview = null;
        }
    }

    console.log(`📏 [RULER] Режим линейки: ${rulerState.active ? 'ВКЛ' : 'ВЫКЛ'}`);
    if (typeof render === 'function') render();
}

// ═══════════════════════════════════════════════════════════════
// ОБРАБОТКА КЛИКОВ НА ЛИСТЕ
// ═══════════════════════════════════════════════════════════════

/**
 * Вызывается из mouse-events.js при клике на canvas.
 * Возвращает true если событие обработано линейкой (чтобы mousedown
 * в mouse-events.js не продолжал обработку).
 */
function handleRulerClick(canvasMouseX, canvasMouseY, e) {
    if (!rulerState.active) return false;
    if (typeof showSheetView === 'undefined' || !showSheetView) return false;

    // Получаем геометрию листа
    if (typeof getSheetGeometry !== 'function') return false;
    const geom = getSheetGeometry();
    const rect = document.getElementById('canvas').getBoundingClientRect();

    // Проверяем что клик в пределах листа
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    if (clickX < geom.x || clickX > geom.x + geom.w ||
        clickY < geom.y || clickY > geom.y + geom.h) {
        // Клик вне листа — сбрасываем стартовую точку
        if (rulerState.start) {
            rulerState.start = null;
            rulerState.preview = null;
            updateRulerResult(null);
            if (typeof render === 'function') render();
        }
        return true; // всё равно перехватываем, чтобы не запускать другие действия
    }

    // Преобразуем в sheet-координаты (мм)
    const sheetX = (clickX - geom.x) / geom.scaleX;
    const sheetY = (clickY - geom.y) / geom.scaleY;

    if (!rulerState.start) {
        // 1-й клик — фиксируем старт
        rulerState.start = { x: sheetX, y: sheetY };
        updateRulerResult({
            stage: 'start',
            x: sheetX, y: sheetY,
            msg: `P1: (${sheetX.toFixed(1)}, ${sheetY.toFixed(1)}) — кликните 2-ю точку`
        });
    } else {
        // 2-й клик — фиксируем конец, показываем результат
        const start = rulerState.start;
        const dx = sheetX - start.x;
        const dy = sheetY - start.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // Угол от +X по часовой (sheet Y-down)
        let angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
        if (angleDeg < 0) angleDeg += 360;

        const measurement = {
            x1: start.x, y1: start.y,
            x2: sheetX, y2: sheetY,
            dist, angleDeg
        };

        rulerState.last = measurement;
        rulerState.measurements.push(measurement);
        if (rulerState.measurements.length > MAX_MEASUREMENTS) {
            rulerState.measurements.shift();
        }

        updateRulerResult({
            stage: 'complete',
            dist, dx, dy, angleDeg,
            x1: start.x, y1: start.y,
            x2: sheetX, y2: sheetY
        });

        rulerState.start = null;
        rulerState.preview = null;
    }

    if (typeof render === 'function') render();
    return true;
}

/**
 * Вызывается из mouse-events.js при движении мыши по canvas.
 * Обновляет live preview.
 */
function handleRulerMove(canvasMouseX, canvasMouseY, e) {
    if (!rulerState.active || !rulerState.start) return;
    if (typeof showSheetView === 'undefined' || !showSheetView) return;
    if (typeof getSheetGeometry !== 'function') return;

    const geom = getSheetGeometry();
    const rect = document.getElementById('canvas').getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Если курсор вне листа — не обновляем preview
    if (clickX < geom.x || clickX > geom.x + geom.w ||
        clickY < geom.y || clickY > geom.y + geom.h) {
        return;
    }

    const sheetX = (clickX - geom.x) / geom.scaleX;
    const sheetY = (clickY - geom.y) / geom.scaleY;

    rulerState.preview = {
        x1: rulerState.start.x, y1: rulerState.start.y,
        x2: sheetX, y2: sheetY
    };

    // Throttled render
    if (!window._rulerRafPending) {
        window._rulerRafPending = true;
        requestAnimationFrame(() => {
            window._rulerRafPending = false;
            if (typeof render === 'function') render();
        });
    }
}

// ═══════════════════════════════════════════════════════════════
// ОТРИСОВКА (вызывается из render.js после drawSheet)
// ═══════════════════════════════════════════════════════════════

function drawRulerOverlay(ctx) {
    if (!rulerState.active && rulerState.measurements.length === 0) return;
    if (typeof showSheetView === 'undefined' || !showSheetView) return;
    if (typeof getSheetGeometry !== 'function') return;

    const geom = getSheetGeometry();
    const scaleX = geom.scaleX;
    const scaleY = geom.scaleY;
    const sheetX = geom.x;
    const sheetY = geom.y;

    // Сохраняем состояние контекста и сбрасываем трансформацию в identity
    // (drawSheet уже сделал restore → активна трансформация render с pan/zoom)
    // Мы рисуем в пиксельных координатах canvas → нужна identity трансформация
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // ── Отрисовка всех сохранённых измерений (полупрозрачно) ──
    for (let i = 0; i < rulerState.measurements.length - 1; i++) {
        const m = rulerState.measurements[i];
        const isLast = (i === rulerState.measurements.length - 1);
        const alpha = isLast ? 1.0 : 0.35;
        drawMeasurement(ctx, m, sheetX, sheetY, scaleX, scaleY, alpha, false);
    }

    // ── Последнее измерение (ярко) ──
    if (rulerState.last && !rulerState.start) {
        drawMeasurement(ctx, rulerState.last, sheetX, sheetY, scaleX, scaleY, 1.0, true);
    }

    // ── Live preview (после 1-го клика, до 2-го) ──
    if (rulerState.preview && rulerState.start) {
        const p = rulerState.preview;
        const dx = p.x2 - p.x1;
        const dy = p.y2 - p.y1;
        const dist = Math.sqrt(dx * dx + dy * dy);
        let angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
        if (angleDeg < 0) angleDeg += 360;

        // Пунктирная линия
        ctx.strokeStyle = '#00d4aa';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(sheetX + p.x1 * scaleX, sheetY + p.y1 * scaleY);
        ctx.lineTo(sheetX + p.x2 * scaleX, sheetY + p.y2 * scaleY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Стартовая точка (залитая)
        ctx.fillStyle = '#00d4aa';
        ctx.beginPath();
        ctx.arc(sheetX + p.x1 * scaleX, sheetY + p.y1 * scaleY, 4, 0, Math.PI * 2);
        ctx.fill();

        // Текущая точка (контур)
        ctx.strokeStyle = '#00d4aa';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sheetX + p.x2 * scaleX, sheetY + p.y2 * scaleY, 4, 0, Math.PI * 2);
        ctx.stroke();

        // Подпись расстояния над курсором
        const midScreenX = sheetX + ((p.x1 + p.x2) / 2) * scaleX;
        const midScreenY = sheetY + ((p.y1 + p.y2) / 2) * scaleY;
        const label = `📏 ${dist.toFixed(1)}мм ∠${angleDeg.toFixed(1)}°`;
        ctx.font = 'bold 12px Segoe UI';
        const metrics = ctx.measureText(label);
        const labelW = metrics.width + 12;
        const labelH = 20;
        ctx.fillStyle = 'rgba(15,15,30,0.95)';
        ctx.fillRect(midScreenX - labelW / 2, midScreenY - labelH - 8, labelW, labelH);
        ctx.strokeStyle = '#00d4aa';
        ctx.lineWidth = 1;
        ctx.strokeRect(midScreenX - labelW / 2, midScreenY - labelH - 8, labelW, labelH);
        ctx.fillStyle = '#00d4aa';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, midScreenX, midScreenY - labelH / 2 - 8);
        ctx.textBaseline = 'alphabetic';
    }

    ctx.restore();
}

function drawMeasurement(ctx, m, sheetX, sheetY, scaleX, scaleY, alpha, showLabel) {
    ctx.save();
    ctx.globalAlpha = alpha;

    // Линия
    ctx.strokeStyle = '#00d4aa';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(sheetX + m.x1 * scaleX, sheetY + m.y1 * scaleY);
    ctx.lineTo(sheetX + m.x2 * scaleX, sheetY + m.y2 * scaleY);
    ctx.stroke();

    // Маркеры endpoints
    ctx.fillStyle = '#00d4aa';
    ctx.strokeStyle = '#0f0f1e';
    ctx.lineWidth = 1;
    for (const p of [{x: m.x1, y: m.y1}, {x: m.x2, y: m.y2}]) {
        ctx.beginPath();
        ctx.arc(sheetX + p.x * scaleX, sheetY + p.y * scaleY, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }

    // Подпись расстояния (только для последнего)
    if (showLabel) {
        const midScreenX = sheetX + ((m.x1 + m.x2) / 2) * scaleX;
        const midScreenY = sheetY + ((m.y1 + m.y2) / 2) * scaleY;
        const label = `📏 ${m.dist.toFixed(2)}мм`;
        ctx.font = 'bold 13px Segoe UI';
        const metrics = ctx.measureText(label);
        const labelW = metrics.width + 12;
        const labelH = 22;
        ctx.fillStyle = 'rgba(15,15,30,0.95)';
        ctx.fillRect(midScreenX - labelW / 2, midScreenY - labelH - 10, labelW, labelH);
        ctx.strokeStyle = '#00d4aa';
        ctx.lineWidth = 1;
        ctx.strokeRect(midScreenX - labelW / 2, midScreenY - labelH - 10, labelW, labelH);
        ctx.fillStyle = '#00d4aa';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, midScreenX, midScreenY - labelH / 2 - 10);
        ctx.textBaseline = 'alphabetic';
    }

    ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
// ОБНОВЛЕНИЕ ПАНЕЛИ РЕЗУЛЬТАТА
// ═══════════════════════════════════════════════════════════════

function updateRulerResult(data) {
    const resultEl = document.getElementById('rulerResult');
    const textEl = document.getElementById('rulerResultText');
    const clearBtn = document.getElementById('clearRulerMeasurements');
    if (!resultEl || !textEl) return;

    // Показываем кнопку очистки если есть измерения
    if (clearBtn) {
        clearBtn.style.display = rulerState.measurements.length > 0 ? 'block' : 'none';
    }

    if (!data) {
        resultEl.style.display = 'none';
        return;
    }

    resultEl.style.display = 'block';

    if (data.stage === 'start') {
        textEl.innerHTML = `<strong>📍 P1:</strong> (${data.x.toFixed(1)}, ${data.y.toFixed(1)})<br>` +
            `<span style="color:#888;font-size:10px;">${data.msg}</span>`;
    } else if (data.stage === 'complete') {
        textEl.innerHTML =
            `<div style="font-size:16px;font-weight:bold;margin-bottom:4px;">📏 ${data.dist.toFixed(2)} мм</div>` +
            `<div style="color:#aaa;font-size:10px;">` +
            `ΔX: ${data.dx.toFixed(1)} · ΔY: ${data.dy.toFixed(1)} · ∠: ${data.angleDeg.toFixed(1)}°` +
            `</div>` +
            `<div style="color:#666;font-size:9px;margin-top:4px;">` +
            `P1 (${data.x1.toFixed(1)}, ${data.y1.toFixed(1)}) → P2 (${data.x2.toFixed(1)}, ${data.y2.toFixed(1)})` +
            `</div>`;
    }
}

// ═══════════════════════════════════════════════════════════════
// ОЧИСТКА ВСЕХ ИЗМЕРЕНИЙ
// ═══════════════════════════════════════════════════════════════

function clearRulerMeasurements() {
    rulerState.measurements = [];
    rulerState.last = null;
    rulerState.start = null;
    rulerState.preview = null;
    updateRulerResult(null);
    if (typeof render === 'function') render();
    console.log('📏 [RULER] Все измерения очищены');
}

// ═══════════════════════════════════════════════════════════════
// ПРИВЯЗКА КНОПКИ
// ═══════════════════════════════════════════════════════════════

function bindRulerButton() {
    const btn = document.getElementById('toggleRulerMode');
    if (btn) {
        btn.addEventListener('click', toggleRulerMode);
        console.log('✅ [RULER] Кнопка линейки привязана');
    }
    // v4.56: Кнопка очистки замеров
    const clearBtn = document.getElementById('clearRulerMeasurements');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearRulerMeasurements);
        console.log('✅ [RULER] Кнопка очистки замеров привязана');
    }
    return !!btn;
}

// Авто-привязка
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindRulerButton);
    } else {
        bindRulerButton();
    }
    setTimeout(bindRulerButton, 500);
}

// ═══════════════════════════════════════════════════════════════
// ГЛОБАЛЬНЫЙ ЭКСПОРТ (для вызова из mouse-events.js и render.js)
// ═══════════════════════════════════════════════════════════════

window.RulerTool = {
    isActive: () => rulerState.active,
    handleClick: handleRulerClick,
    handleMove: handleRulerMove,
    drawOverlay: drawRulerOverlay,
    clear: clearRulerMeasurements,
    getState: () => ({ ...rulerState, measurements: [...rulerState.measurements] })
};

})();