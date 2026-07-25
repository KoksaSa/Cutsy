// ═══════════════════════════════════════════════════════════════
// ИНСТРУМЕНТ ФАСКА (CHAMFER) — v1.0
// ═══════════════════════════════════════════════════════════════
// Аналог инструмента Скругление (fillet), но вместо дуги создаёт
// прямую линию (фаску) между двумя точками обрезки.
//
// Применение:
//   1. Выбрать инструмент "Фаска" из выпадающего списка кнопки Скругление
//   2. Кликнуть на угол детали (пересечение двух линий / угол прямоугольника)
//   3. Ввести длину фаски (мм) — расстояние от угла вдоль каждой стороны
//   4. Обе линии обрезаются на эту длину, между точками обрезки создаётся Line
//
// Алгоритм идентичен fillet (mouse-events.js currentTool === 'fillet'),
// отличается только:
//   - prompt: "Длина фаски" вместо "Радиус скругления"
//   - вместо Arc создаётся Line между tanAX/tanAY и tanBX/tanBY
//   - расстояние обрезки = chamferLen (вдоль стороны), а не tanLen = r/tan(angle/2)
// ═══════════════════════════════════════════════════════════════

(function () {
    'use strict';

    const CHAMFER_TOL = 8; // мм — допуск поиска угла (как FILLET_TOL)

    window.handleChamferClick = function handleChamferClick(x, y) {
        // ═══════════════════════════════════════════════════════════
        // ФАЗА 1: Поиск rect рядом с кликом (БЕЗ модификации)
        // ═══════════════════════════════════════════════════════════
        let rectToBreak = null;
        for (const obj of objects) {
            if (obj.type !== 'rect') continue;
            const corners = [
                { x: obj.x, y: obj.y },
                { x: obj.x + obj.width, y: obj.y },
                { x: obj.x + obj.width, y: obj.y + obj.height },
                { x: obj.x, y: obj.y + obj.height }
            ];
            for (const c of corners) {
                if (Math.hypot(c.x - x, c.y - y) < CHAMFER_TOL) {
                    rectToBreak = obj;
                    break;
                }
            }
            if (rectToBreak) break;
        }

        // ═══════════════════════════════════════════════════════════
        // ФАЗА 1b: Если нашли rect — saveState + разбиваем на 4 линии
        // ═══════════════════════════════════════════════════════════
        let savedStateForRect = false;
        if (rectToBreak) {
            if (typeof saveState === 'function') saveState();
            savedStateForRect = true;
            const obj = rectToBreak;
            const rectIdx = objects.indexOf(obj);
            if (rectIdx >= 0) objects.splice(rectIdx, 1);

            const lines = [
                new Line(obj.x, obj.y, obj.x + obj.width, obj.y),                     // верх
                new Line(obj.x + obj.width, obj.y, obj.x + obj.width, obj.y + obj.height), // право
                new Line(obj.x + obj.width, obj.y + obj.height, obj.x, obj.y + obj.height), // низ
                new Line(obj.x, obj.y + obj.height, obj.x, obj.y)                      // лево
            ];
            for (const l of lines) {
                l.color = obj.color || '#00aadd';
                objects.push(l);
            }

            // Если редактируем деталь — заменяем rect на линии в part.objects
            if (typeof isEditingPart !== 'undefined' && isEditingPart &&
                typeof editingPartId !== 'undefined' && editingPartId !== null) {
                const part = parts.find(p => samePartId(p.id, editingPartId));
                if (part) {
                    const pIdx = part.objects.indexOf(obj);
                    if (pIdx >= 0) part.objects.splice(pIdx, 1);
                    part.objects.push(...lines);
                    if (typeof updatePartBounds === 'function') updatePartBounds(part);
                }
            }
        }

        // ═══════════════════════════════════════════════════════════
        // ФАЗА 2: Поиск всех линий рядом с кликом
        // ═══════════════════════════════════════════════════════════
        const nearbyLines = [];
        for (const obj of objects) {
            if (obj.type !== 'line') continue;
            const d1 = Math.hypot(obj.x1 - x, obj.y1 - y);
            const d2 = Math.hypot(obj.x2 - x, obj.y2 - y);
            if (d1 < CHAMFER_TOL || d2 < CHAMFER_TOL) {
                nearbyLines.push({ line: obj, d1, d2 });
            }
        }

        if (nearbyLines.length < 2) {
            alert('⚠️ Кликните на угол — точку пересечения двух линий или угол прямоугольника');
            return;
        }

        // ═══════════════════════════════════════════════════════════
        // ФАЗА 3: Поиск пары линий с ближайшими концами к клику
        // ═══════════════════════════════════════════════════════════
        let bestPair = null;
        let bestScore = Infinity;
        for (let i = 0; i < nearbyLines.length; i++) {
            for (let j = i + 1; j < nearbyLines.length; j++) {
                const a = nearbyLines[i], b = nearbyLines[j];
                const tests = [
                    { p1: 'x1', p2: 'x1', d: Math.hypot(a.line.x1 - b.line.x1, a.line.y1 - b.line.y1), sx: a.line.x1, sy: a.line.y1 },
                    { p1: 'x1', p2: 'x2', d: Math.hypot(a.line.x1 - b.line.x2, a.line.y1 - b.line.y2), sx: a.line.x1, sy: a.line.y1 },
                    { p1: 'x2', p2: 'x1', d: Math.hypot(a.line.x2 - b.line.x1, a.line.y2 - b.line.y1), sx: a.line.x2, sy: a.line.y2 },
                    { p1: 'x2', p2: 'x2', d: Math.hypot(a.line.x2 - b.line.x2, a.line.y2 - b.line.y2), sx: a.line.x2, sy: a.line.y2 },
                ];
                for (const t of tests) {
                    if (t.d > CHAMFER_TOL * 2) continue;
                    const clickDist = Math.hypot(t.sx - x, t.sy - y);
                    const score = t.d * 10000 + clickDist;
                    if (score < bestScore) {
                        bestScore = score;
                        bestPair = { lineA: a.line, lineB: b.line, endA: t.p1, endB: t.p2 };
                    }
                }
            }
        }

        if (!bestPair) {
            alert('⚠️ Не найден угол рядом с кликом');
            return;
        }

        // ═══════════════════════════════════════════════════════════
        // ФАЗА 4: Вычисление угла и направления сторон
        // ═══════════════════════════════════════════════════════════
        const cornerX = bestPair.endA === 'x1' ? bestPair.lineA.x1 : bestPair.lineA.x2;
        const cornerY = bestPair.endA === 'x1' ? bestPair.lineA.y1 : bestPair.lineA.y2;

        const aOtherX = bestPair.endA === 'x1' ? bestPair.lineA.x2 : bestPair.lineA.x1;
        const aOtherY = bestPair.endA === 'x1' ? bestPair.lineA.y2 : bestPair.lineA.y1;
        const bOtherX = bestPair.endB === 'x1' ? bestPair.lineB.x2 : bestPair.lineB.x1;
        const bOtherY = bestPair.endB === 'x1' ? bestPair.lineB.y2 : bestPair.lineB.y1;

        const dirAX = aOtherX - cornerX, dirAY = aOtherY - cornerY;
        const dirBX = bOtherX - cornerX, dirBY = bOtherY - cornerY;
        const lenA = Math.hypot(dirAX, dirAY);
        const lenB = Math.hypot(dirBX, dirBY);
        if (lenA < 0.001 || lenB < 0.001) return;
        const uaX = dirAX / lenA, uaY = dirAY / lenA;
        const ubX = dirBX / lenB, ubY = dirBY / lenB;

        // Проверка параллельности (до prompt и до saveState)
        const dot = uaX * ubX + uaY * ubY;
        const angleBetween = Math.acos(Math.max(-1, Math.min(1, dot)));
        if (angleBetween < 0.01 || Math.abs(angleBetween - Math.PI) < 0.01) {
            alert('⚠️ Линии параллельны — фаска невозможна');
            return;
        }

        // ═══════════════════════════════════════════════════════════
        // ФАЗА 5: Запрос длины фаски
        // ═══════════════════════════════════════════════════════════
        // chamferLen — расстояние от угла вдоль КАЖДОЙ стороны до точки обрезки.
        // Это НЕ длина фаски (гипотенуза), а катет вдоль стороны.
        // Максимальное значение = min(lenA, lenB) / 2 (чтобы стороны не обрезались до 0).
        const lastChamferLen = localStorage.getItem('lastChamferLen') || '5';
        const chamferStr = prompt('Длина фаски (мм) — вдоль каждой стороны:', lastChamferLen);
        if (!chamferStr) return;  // отмена
        const chamferLen = parseFloat(chamferStr);
        if (!chamferLen || chamferLen <= 0) {
            alert('⚠️ Длина фаски должна быть положительной');
            return;
        }
        if (chamferLen > lenA / 2 || chamferLen > lenB / 2) {
            const maxL = Math.min(lenA, lenB) / 2;
            alert(`⚠️ Длина фаски слишком большая (макс ${maxL.toFixed(1)}мм)`);
            return;
        }
        localStorage.setItem('lastChamferLen', String(chamferLen));

        // ═══════════════════════════════════════════════════════════
        // ФАЗА 6: saveState (если ещё не сохраняли для rect)
        // ═══════════════════════════════════════════════════════════
        if (!savedStateForRect) {
            if (typeof saveState === 'function') saveState();
        }

        // ═══════════════════════════════════════════════════════════
        // ФАЗА 7: Обрезка линий и создание фаски
        // ═══════════════════════════════════════════════════════════
        // Точка обрезки на линии A = угол + unitA * chamferLen
        // Точка обрезки на линии B = угол + unitB * chamferLen
        // Фаска = Line(точка A, точка B)
        const cutAX = cornerX + uaX * chamferLen;
        const cutAY = cornerY + uaY * chamferLen;
        const cutBX = cornerX + ubX * chamferLen;
        const cutBY = cornerY + ubY * chamferLen;

        // Обрезаем линию A: конец (endA) переносим в точку cutA
        if (bestPair.endA === 'x1') {
            bestPair.lineA.x1 = cutAX;
            bestPair.lineA.y1 = cutAY;
        } else {
            bestPair.lineA.x2 = cutAX;
            bestPair.lineA.y2 = cutAY;
        }
        // Обрезаем линию B: конец (endB) переносим в точку cutB
        if (bestPair.endB === 'x1') {
            bestPair.lineB.x1 = cutBX;
            bestPair.lineB.y1 = cutBY;
        } else {
            bestPair.lineB.x2 = cutBX;
            bestPair.lineB.y2 = cutBY;
        }

        // Создаём линию фаски
        const chamferLine = new Line(cutAX, cutAY, cutBX, cutBY);
        chamferLine.id = Date.now() + Math.random();
        chamferLine.color = bestPair.lineA.color || '#00aadd';
        objects.push(chamferLine);

        // Если редактируем деталь — добавляем фаску в part.objects
        if (typeof isEditingPart !== 'undefined' && isEditingPart &&
            typeof editingPartId !== 'undefined' && editingPartId !== null) {
            const part = parts.find(p => samePartId(p.id, editingPartId));
            if (part) {
                part.objects.push(chamferLine);
                if (typeof updatePartBounds === 'function') updatePartBounds(part);
            }
        }

        if (typeof render === 'function') render();
        console.log(`🔺 Фаска: угол=(${cornerX.toFixed(1)},${cornerY.toFixed(1)}), длина=${chamferLen}мм, угол между сторонами=${(angleBetween * 180 / Math.PI).toFixed(1)}°`);
    };

    console.log('[chamfer-tool.js] v1.0 loaded — window.handleChamferClick(x, y)');
})();
