// ═══════════════════════════════════════════════════════════════
// MICROJOINT TOOL — Микростык (перемычки в контуре детали)
// v3.0 — Поддержка polyline/arc/circle
//   • Разрыв ВДОЛЬ ребра контура
//   • Обработка ТОЛЬКО выделенной детали или детали под курсором
//   • Полная поддержка полилиний (SPLINE/LWPOLYLINE) — разрыв с сохранением структуры
//   • Полная поддержка дуг — корректное пересечение линия-дуга, разбиение на под-дуги
//   • Полное логирование
// ═══════════════════════════════════════════════════════════════

const _MJ_LOG = true;
function _mjLog(...args) { if (_MJ_LOG) void 0; }

_mjLog('Загрузка модуля микростыка v3.0');

// ═══════════════════════════════════════════════════════════════
// ИНИЦИАЛИЗАЦИЯ UI
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    const microjointBtn = document.getElementById('microjointTool');
    const microjointDialog = document.getElementById('microjointDialog');
    const microjointOk = document.getElementById('microjointOk');
    const microjointCancel = document.getElementById('microjointCancel');
    const microjointGapInput = document.getElementById('microjointGapInput');

    _mjLog('Инициализация UI');

    if (microjointBtn) {
        microjointBtn.addEventListener('click', (e) => {
            e.stopImmediatePropagation();
            _mjLog('Клик по кнопке — открытие диалога настроек');
            microjointDialog.style.display = 'block';
            microjointGapInput.focus();
        });
    }

    if (microjointOk) {
        microjointOk.addEventListener('click', () => {
            const gap = parseFloat(microjointGapInput.value);
            _mjLog('Нажатие OK, введённый промежуток:', gap);

            if (isNaN(gap) || gap < 0.1 || gap > 5.0) {
                alert('⚠️ Введите корректное значение промежутка (0.1 - 5.0 мм)');
                _mjLog('ОШИБКА: некорректный промежуток', gap);
                return;
            }

            window.microjointEnabled = true;
            window.microjointGap = gap;
            window.microjointLineStart = null;
            window.microjointLineEnd = null;
            window.microjointIsDrawing = false;

            microjointDialog.style.display = 'none';
            currentTool = 'microjoint';
            window.currentTool = 'microjoint';
            
            // Скрываем input размеров при переключении на микростык
            if (typeof lineDimensionInput !== 'undefined' && lineDimensionInput) {
                lineDimensionInput.style.display = 'none';
                lineDimensionInput.value = '';
            }
            if (typeof shapeInputStage !== 'undefined') shapeInputStage = 0;
            if (typeof isDrawing !== 'undefined') isDrawing = false;
            if (typeof currentShape !== 'undefined') currentShape = null;
            
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            microjointBtn.classList.add('active');

            _mjLog(`Режим активирован: промежуток = ${gap} мм`);
            _mjLog('Инструкция: проведите линию через контур детали или свободные объекты');
        });
    }

    if (microjointCancel) {
        microjointCancel.addEventListener('click', () => {
            microjointDialog.style.display = 'none';
            _mjLog('Отмена настройки пользователем');
        });
    }

    // v1.0: Enter в поле ввода = нажатие OK
    if (microjointGapInput) {
        microjointGapInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (microjointOk) microjointOk.click();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                microjointDialog.style.display = 'none';
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && microjointDialog.style.display !== 'none') {
            microjointDialog.style.display = 'none';
            _mjLog('Отмена по ESC');
        }
    });
});

// ═══════════════════════════════════════════════════════════════
// ВСПОМОГАТЕЛЬНЫЕ ГЕОМЕТРИЧЕСКИЕ ФУНКЦИИ
// ═══════════════════════════════════════════════════════════════

function getObjectEdges(obj) {
    if (!obj) return [];
    if (obj.type === 'line') {
        return [{ p1: { x: obj.x1, y: obj.y1 }, p2: { x: obj.x2, y: obj.y2 } }];
    }
    if (obj.type === 'rect') {
        const x1 = obj.x, y1 = obj.y;
        const x2 = obj.x + obj.width, y2 = obj.y + obj.height;
        return [
            { p1: { x: x1, y: y1 }, p2: { x: x2, y: y1 } },
            { p1: { x: x2, y: y1 }, p2: { x: x2, y: y2 } },
            { p1: { x: x2, y: y2 }, p2: { x: x1, y: y2 } },
            { p1: { x: x1, y: y2 }, p2: { x: x1, y: y1 } }
        ];
    }
    // Круг обрабатывается отдельно — не через рёбра
    if (obj.type === 'circle') {
        return [];
    }
    // Дуга обрабатывается отдельно — не через рёбра
    if (obj.type === 'arc') {
        return [];
    }
    // Полилиния обрабатывается отдельно — сохраняем структуру, не разбиваем на линии
    if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
        return [];
    }
    if (obj.type === 'polygon' && typeof obj.getVertices === 'function') {
        const v = obj.getVertices();
        const edges = [];
        for (let i = 0; i < v.length; i++) {
            const next = (i + 1) % v.length;
            edges.push({ p1: v[i], p2: v[next] });
        }
        return edges;
    }
    return [];
}

function findSegmentIntersection(seg1, seg2) {
    const x1 = seg1.p1.x, y1 = seg1.p1.y, x2 = seg1.p2.x, y2 = seg1.p2.y;
    const x3 = seg2.p1.x, y3 = seg2.p1.y, x4 = seg2.p2.x, y4 = seg2.p2.y;
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 0.001) return null;
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
    if (t >= -0.01 && t <= 1.01 && u >= -0.01 && u <= 1.01) {
        return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1), t: t, u: u };
    }
    return null;
}

function pointOnSegment(pt, seg, tolerance = 1.0) {
    const d = pointToLineDistance(pt.x, pt.y, seg.p1.x, seg.p1.y, seg.p2.x, seg.p2.y);
    if (d > tolerance) return false;
    const minX = Math.min(seg.p1.x, seg.p2.x) - tolerance;
    const maxX = Math.max(seg.p1.x, seg.p2.x) + tolerance;
    const minY = Math.min(seg.p1.y, seg.p2.y) - tolerance;
    const maxY = Math.max(seg.p1.y, seg.p2.y) + tolerance;
    return pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY;
}

// ═══════════════════════════════════════════════════════════════
// ПЕРЕСЕЧЕНИЕ ЛИНИИ С ОКРУЖНОСТЬЮ
// ═══════════════════════════════════════════════════════════════
function findLineCircleIntersections(line, circle) {
    const x1 = line.p1.x, y1 = line.p1.y;
    const x2 = line.p2.x, y2 = line.p2.y;
    const cx = circle.cx, cy = circle.cy, r = circle.radius;
    
    const dx = x2 - x1;
    const dy = y2 - y1;
    const fx = x1 - cx;
    const fy = y1 - cy;
    
    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r * r;
    
    const discriminant = b * b - 4 * a * c;
    if (discriminant < -0.001) return []; // Нет пересечений
    
    const intersections = [];
    
    if (Math.abs(discriminant) < 0.001) {
        // Одно касание
        const t = -b / (2 * a);
        if (t >= 0 && t <= 1) {
            intersections.push({
                x: x1 + t * dx,
                y: y1 + t * dy,
                angle: Math.atan2(y1 + t * dy - cy, x1 + t * dx - cx)
            });
        }
    } else {
        // Два пересечения
        const sqrtDisc = Math.sqrt(discriminant);
        const t1 = (-b + sqrtDisc) / (2 * a);
        const t2 = (-b - sqrtDisc) / (2 * a);
        
        if (t1 >= 0 && t1 <= 1) {
            intersections.push({
                x: x1 + t1 * dx,
                y: y1 + t1 * dy,
                angle: Math.atan2(y1 + t1 * dy - cy, x1 + t1 * dx - cx)
            });
        }
        if (t2 >= 0 && t2 <= 1) {
            intersections.push({
                x: x1 + t2 * dx,
                y: y1 + t2 * dy,
                angle: Math.atan2(y1 + t2 * dy - cy, x1 + t2 * dx - cx)
            });
        }
    }

    return intersections;
}

// ═══════════════════════════════════════════════════════════════
// ПЕРЕСЕЧЕНИЕ ЛИНИИ С ДУГОЙ (arc)
// ═══════════════════════════════════════════════════════════════
function findLineArcIntersections(line, arc) {
    // Находим пересечения линии с полной окружностью дуги
    const circleProxy = { cx: arc.cx, cy: arc.cy, radius: arc.radius };
    const circleHits = findLineCircleIntersections(line, circleProxy);

    // Фильтруем: оставляем только точки, которые лежат на дуге
    const result = [];
    for (const hit of circleHits) {
        if (isAngleInArcRange(hit.angle, arc.startAngle, arc.endAngle, arc.direction)) {
            result.push(hit);
        }
    }
    return result;
}

// Проверка: находится ли угол в диапазоне дуги
function isAngleInArcRange(angle, startAngle, endAngle, direction) {
    // Нормализуем все углы в [0, 2π)
    const TWO_PI = 2 * Math.PI;
    let a = ((angle % TWO_PI) + TWO_PI) % TWO_PI;
    let sa = ((startAngle % TWO_PI) + TWO_PI) % TWO_PI;
    let ea = ((endAngle % TWO_PI) + TWO_PI) % TWO_PI;

    const tolerance = 0.001; // ~0.06° допуск

    if (direction === 'CCW') {
        // CCW: от startAngle к endAngle по возрастанию угла
        if (sa <= ea + tolerance) {
            return a >= sa - tolerance && a <= ea + tolerance;
        } else {
            // Через 0: sa → 2π, 0 → ea
            return a >= sa - tolerance || a <= ea + tolerance;
        }
    } else {
        // CW: от startAngle к endAngle по убыванию угла
        if (sa >= ea - tolerance) {
            return a <= sa + tolerance && a >= ea - tolerance;
        } else {
            // Через 0: sa → 0, 2π → ea
            return a <= sa + tolerance || a >= ea - tolerance;
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// СОЗДАНИЕ ДУГИ (arc) ИЗ ОКРУЖНОСТИ
// ═══════════════════════════════════════════════════════════════
function createArcFromCircle(circle, startAngle, endAngle, direction) {
    direction = direction || 'CCW';
    // Нормализуем углы в [0, 2π)
    let sa = ((startAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    let ea = ((endAngle   % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

    // Вычисляем разницу CCW (по возрастанию угла)
    let diff = ea - sa;
    if (diff < 0) diff += 2 * Math.PI;

    _mjLog(`    createArc: sa=${sa.toFixed(3)} (${(sa*180/Math.PI).toFixed(0)}°) ea=${ea.toFixed(3)} (${(ea*180/Math.PI).toFixed(0)}°) diff=${diff.toFixed(3)} (${(diff*180/Math.PI).toFixed(0)}°) dir=${direction}`);

    if (typeof Arc !== 'undefined') {
        return new Arc(circle.cx, circle.cy, circle.radius, sa, ea, direction);
    }
    
    return {
        type: 'arc',
        cx: circle.cx,
        cy: circle.cy,
        radius: circle.radius,
        startAngle: sa,
        endAngle: ea,
        direction: direction
    };
}

function createLineWithGap(line, gapStart, gapEnd) {
    const newLines = [];
    const len = Math.sqrt(Math.pow(line.x2 - line.x1, 2) + Math.pow(line.y2 - line.y1, 2));
    if (len < 0.001) {
        _mjLog('    Предупреждение: линия слишком короткая для разрыва');
        return [];
    }
    const dx = line.x2 - line.x1;
    const dy = line.y2 - line.y1;
    const proj = (px, py) => ((px - line.x1) * dx + (py - line.y1) * dy) / (len * len);
    const t1 = proj(gapStart.x, gapStart.y);
    const t2 = proj(gapEnd.x, gapEnd.y);
    const firstT = Math.max(0, Math.min(1, Math.min(t1, t2)));
    const secondT = Math.max(0, Math.min(1, Math.max(t1, t2)));
    _mjLog(`    Параметры разрыва: ${firstT.toFixed(4)} … ${secondT.toFixed(4)}`);
    if (firstT > 0.001) {
        const x1 = line.x1 + dx * firstT;
        const y1 = line.y1 + dy * firstT;
        newLines.push(new Line(line.x1, line.y1, x1, y1));
    }
    if (secondT < 0.999) {
        const x2 = line.x1 + dx * secondT;
        const y2 = line.y1 + dy * secondT;
        newLines.push(new Line(x2, y2, line.x2, line.y2));
    }
    if (newLines.length === 0) {
        _mjLog('    Линия полностью удалена');
    } else {
        _mjLog('    Создано отрезков:', newLines.length);
    }
    return newLines;
}

// ═══════════════════════════════════════════════════════════════
// ПРОВЕРКА: находится ли точка внутри bounding box детали
// ═══════════════════════════════════════════════════════════════
function pointInPartBounds(px, py, part) {
    if (!part || !part.bounds) return false;
    const b = part.bounds;
    // Увеличенный допуск для границ
    const tolerance = 5.0;
    return px >= b.minX - tolerance && px <= b.maxX + tolerance &&
           py >= b.minY - tolerance && py <= b.maxY + tolerance;
}

// ═══════════════════════════════════════════════════════════════
// ПРОВЕРКА: пересекает ли линия bounding box детали
// ═══════════════════════════════════════════════════════════════
function lineIntersectsPartBounds(p1, p2, part) {
    if (!part || !part.bounds) return false;
    const b = part.bounds;
    const tolerance = 5.0;

    const minX = b.minX - tolerance;
    const maxX = b.maxX + tolerance;
    const minY = b.minY - tolerance;
    const maxY = b.maxY + tolerance;
    
    // Если оба конца линии снаружи одной границы — нет пересечения
    if ((p1.x < minX && p2.x < minX) || (p1.x > maxX && p2.x > maxX) ||
        (p1.y < minY && p2.y < minY) || (p1.y > maxY && p2.y > maxY)) {
        return false;
    }
    
    return true;
}

// ═══════════════════════════════════════════════════════════════
// ОБРАБОТКА ПОЛИЛИНИИ — разрыв с сохранением структуры
// ═══════════════════════════════════════════════════════════════
// Полилиния (из SPLINE, LWPOLYLINE) обрабатывается как единый объект:
//   1. Находим пересечения линии микростыка с сегментами полилинии
//   2. В точках пересечения создаём зазор (gap) вдоль сегмента
//   3. Полилиния разбивается на под-полилинии в местах зазоров
//   4. Структура типа сохраняется (polyline/lwpolyline)

function processPolylineMicrojoint(polyline, microjointLine, halfGap) {
    const points = polyline.points;
    if (!points || points.length < 2) {
        return { results: [polyline], modified: false, microjoints: 0 };
    }

    // Определяем, замкнута ли полилиния:
    // - по флагу closed, либо
    // - первая и последняя точки совпадают
    const first = points[0];
    const last = points[points.length - 1];
    const isClosed = polyline.closed ||
        (Math.abs(first.x - last.x) < 0.01 && Math.abs(first.y - last.y) < 0.01);

    // Находим все пересечения линии микростыка с сегментами полилинии
    const hits = [];
    const segCount = isClosed ? points.length : points.length - 1;

    for (let i = 0; i < segCount; i++) {
        const nextI = (i + 1) % points.length;
        const seg = { p1: points[i], p2: points[nextI] };
        const pt = findSegmentIntersection(microjointLine, seg);

        if (pt && pointOnSegment(pt, seg, 1.0)) {
            // Вычисляем зазор вдоль сегмента
            const segLen = Math.sqrt(
                Math.pow(seg.p2.x - seg.p1.x, 2) + Math.pow(seg.p2.y - seg.p1.y, 2)
            );
            if (segLen < 0.001) continue;
            const dx = (seg.p2.x - seg.p1.x) / segLen;
            const dy = (seg.p2.y - seg.p1.y) / segLen;

            hits.push({
                segmentIndex: i,
                point: pt,
                gapStart: { x: pt.x - dx * halfGap, y: pt.y - dy * halfGap },
                gapEnd: { x: pt.x + dx * halfGap, y: pt.y + dy * halfGap }
            });

            _mjLog(`    Полилиния сегм #${i}: пересечение (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}), ` +
                `зазор [${(pt.x - dx * halfGap).toFixed(2)},${(pt.y - dy * halfGap).toFixed(2)}] → ` +
                `[${(pt.x + dx * halfGap).toFixed(2)},${(pt.y + dy * halfGap).toFixed(2)}]`);
        }
    }

    if (hits.length === 0) {
        return { results: [polyline], modified: false, microjoints: 0 };
    }

    // Строим «прогоны» — последовательности точек между зазорами
    // Алгоритм: идём по точкам полилинии, на каждом сегменте с пересечением
    // вставляем gapStart (конец прогона до зазора) и gapEnd (начало нового прогона)
    // v4.38 FIX M2: используем segCount вместо points.length - 1, чтобы обработать
    // замыкающий сегмент (points[N-1] → points[0]) для замкнутых полилиний.
    // Раньше detection-loop итерировал segCount, но run-building-loop использовал
    // points.length - 1 → замыкающий сегмент НИКОГДА не обрабатывался, hit терялся,
    // а modified=true уже стояло → silent failure (микростык не создавался).
    const runs = [];
    let currentRun = [points[0]];

    for (let i = 0; i < segCount; i++) {
        const nextI = (i + 1) % points.length;  // v4.38: wrap-around для замкнутой
        const hit = hits.find(h => h.segmentIndex === i);

        if (hit) {
            // Добавляем точку начала сегмента (если ещё не добавлена)
            const lastInRun = currentRun[currentRun.length - 1];
            if (!lastInRun || Math.abs(lastInRun.x - points[i].x) > 0.001 || Math.abs(lastInRun.y - points[i].y) > 0.001) {
                currentRun.push(points[i]);
            }
            // Добавляем gapStart — конец прогона перед зазором
            currentRun.push(hit.gapStart);
            // Завершаем текущий прогон
            if (currentRun.length >= 2) {
                runs.push(currentRun);
            }
            // Начинаем новый прогон с gapEnd
            currentRun = [hit.gapEnd];
        } else {
            // Обычный сегмент — добавляем следующую точку
            // v4.38: используем nextI вместо points[i + 1] для wrap-around
            currentRun.push(points[nextI]);
        }
    }

    // v4.38 FIX M2: для замкнутой полилинии последний прогон должен замкнуться
    // обратно на points[0] (если между последним gap и points[0] есть material).
    // Если currentRun заканчивается не на points[0], добавляем её.
    if (isClosed && currentRun.length >= 2) {
        const lastInRun = currentRun[currentRun.length - 1];
        if (Math.abs(lastInRun.x - points[0].x) > 0.001 || Math.abs(lastInRun.y - points[0].y) > 0.001) {
            currentRun.push(points[0]);
        }
    }

    // Завершаем последний прогон
    if (currentRun.length >= 2) {
        runs.push(currentRun);
    } else if (currentRun.length === 1 && runs.length > 0) {
        // Одинокую точку сливаем с предыдущим прогоном
        const lastRun = runs[runs.length - 1];
        const lastPt = lastRun[lastRun.length - 1];
        const singlePt = currentRun[0];
        if (Math.abs(lastPt.x - singlePt.x) > 0.001 || Math.abs(lastPt.y - singlePt.y) > 0.001) {
            lastRun.push(singlePt);
        }
    }

    // Для замкнутой полилинии: последний прогон может примыкать к первому
    // (если зазор(ы) разомкнули контур, первый и последний прогоны — это одна линия)
    if (isClosed && runs.length >= 2) {
        const lastRun = runs[runs.length - 1];
        const firstRun = runs[0];
        const lastPt = lastRun[lastRun.length - 1];
        const firstPt = firstRun[0];
        // Если последняя точка последнего прогона и первая точка первого прогона
        // находятся близко (или совпадают), сливаем прогоны
        if (Math.abs(lastPt.x - firstPt.x) < 0.1 && Math.abs(lastPt.y - firstPt.y) < 0.1) {
            // Сливаем: последний прогон + первый прогон (без дублирования общей точки)
            runs[0] = [...lastRun, ...firstRun.slice(1)];
            runs.pop();
        }
    }

    // Конвертируем прогоны в объекты полилиний
    const results = [];
    for (const run of runs) {
        if (run.length < 2) continue;

        // Проверяем, не является ли прогон по сути одной короткой линией
        // (2 точки близко друг к другу) — пропускаем
        if (run.length === 2) {
            const dx = run[1].x - run[0].x;
            const dy = run[1].y - run[0].y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len < 0.1) continue; // Слишком короткий сегмент
        }

        const pl = {
            type: polyline.type, // сохраняем 'polyline' или 'lwpolyline'
            points: run,
            id: Date.now() + Math.random(),
            closed: false // После разрыва полилиния разомкнута
        };

        // Добавляем методы draw/contains
        if (typeof addPolylineMethods === 'function') {
            addPolylineMethods(pl);
        } else {
            pl.draw = function(ctx) {
                if (!this.points || this.points.length < 2) return;
                ctx.beginPath();
                ctx.moveTo(this.points[0].x, this.points[0].y);
                for (let i = 1; i < this.points.length; i++) {
                    ctx.lineTo(this.points[i].x, this.points[i].y);
                }
                ctx.stroke();
            };
            pl.contains = function(x, y) {
                if (!this.points || this.points.length < 2) return false;
                for (let i = 0; i < this.points.length - 1; i++) {
                    const p1 = this.points[i], p2 = this.points[i + 1];
                    const dx = p2.x - p1.x, dy = p2.y - p1.y;
                    const len = Math.sqrt(dx * dx + dy * dy);
                    if (len < 0.001) continue;
                    const t = Math.max(0, Math.min(1, ((x - p1.x) * dx + (y - p1.y) * dy) / (len * len)));
                    const px = p1.x + t * dx, py = p1.y + t * dy;
                    if (Math.sqrt((x - px) * (x - px) + (y - py) * (y - py)) < 3) return true;
                }
                return false;
            };
        }

        results.push(pl);
    }

    _mjLog(`    Полилиния: ${points.length} точек → ${results.length} под-полилиний ` +
        `(зазоров: ${hits.length}, замкнута: ${isClosed})`);

    return { results, modified: true, microjoints: hits.length };
}

// ═══════════════════════════════════════════════════════════════
// ОБРАБОТКА ГРУППЫ ОБЪЕКТОВ (деталь или свободные)
// ═══════════════════════════════════════════════════════════════

function processMicrojointForObjects(targetObjects, microjointLine, gap, label) {
    const halfGap = gap / 2;
    let intersections = 0;
    let microjoints = 0;
    let modified = false;

    // Разделяем объекты по категориям:
    // - line/rect/polygon — обрабатываются через рёбра (разбиваются на Line)
    // - circle — обрабатываются отдельно (разбиваются на Arc)
    // - arc — обрабатываются отдельно (разбиваются на под-дуги)
    // - polyline/lwpolyline — обрабатываются отдельно (разбиваются на под-полилинии)
    // - остальное — передаётся без изменений
    const edgeObjects = targetObjects.filter(o => 
        o.type === 'line' || o.type === 'rect' || o.type === 'polygon' || 
        (o.type === 'CustomPolygon' && o.points)
    );
    const circleObjects = targetObjects.filter(o => o.type === 'circle');
    const arcObjects = targetObjects.filter(o => o.type === 'arc');
    const polylineObjects = targetObjects.filter(o => o.type === 'polyline' || o.type === 'lwpolyline');
    const nonGeomObjects = targetObjects.filter(o => 
        !edgeObjects.includes(o) && !circleObjects.includes(o) && 
        !arcObjects.includes(o) && !polylineObjects.includes(o)
    );

    _mjLog(`  ${label}: линий/полигонов ${edgeObjects.length}, кругов ${circleObjects.length}, ` +
        `дуг ${arcObjects.length}, полилиний ${polylineObjects.length}, не-геометрии ${nonGeomObjects.length}`);

    // ═══════════════════════════════════════════════════════════
    // ЭТАП 1: Обработка линий/прямоугольников/полигонов через рёбра
    // ═══════════════════════════════════════════════════════════
    let edgeFinalLines = [];
    let allEdgeLines = []; // Объявляем здесь для доступа в конце функции
    const edgeGeomObjects = edgeObjects.filter(o => getObjectEdges(o).length > 0);
    
    if (edgeGeomObjects.length > 0) {
        for (const obj of edgeGeomObjects) {
            const edges = getObjectEdges(obj);
            for (let i = 0; i < edges.length; i++) {
                const e = edges[i];
                allEdgeLines.push({
                    line: new Line(e.p1.x, e.p1.y, e.p2.x, e.p2.y),
                    originalObj: obj,
                    edgeIndex: i
                });
            }
        }

        _mjLog(`  ${label}: всего рёбер ${allEdgeLines.length}`);

        for (const item of allEdgeLines) {
            const line = item.line;
            const seg = { p1: { x: line.x1, y: line.y1 }, p2: { x: line.x2, y: line.y2 } };
            const pt = findSegmentIntersection(microjointLine, seg);

            if (pt && pointOnSegment(pt, seg, 1.0)) {
                // v4.38 FIX: защита от дублирования микростыков.
                // После первого микростыка отрезок разделился на 2 коротких.
                // Их концы — это границы существующего микростыка (gapStart/gapEnd).
                // Если новый микростык попадает близко (< 2*halfGap) к концу отрезка,
                // это значит, что мы пытаемся создать микростык на уже разорванном месте.
                // Пропускаем такое пересечение.
                const distToStart = Math.hypot(pt.x - line.x1, pt.y - line.y1);
                const distToEnd = Math.hypot(pt.x - line.x2, pt.y - line.y2);
                const minDistToEnd = Math.min(distToStart, distToEnd);
                if (minDistToEnd < halfGap * 2) {
                    _mjLog(`    Ребро #${item.edgeIndex} (${item.originalObj.type}): пересечение (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}) пропущено — слишком близко к концу отрезка (dist=${minDistToEnd.toFixed(2)}мм < ${halfGap*2}мм), возможно существующий микростык`);
                    edgeFinalLines.push(line);  // сохраняем отрезок без изменений
                    continue;
                }

                intersections++;
                const edgeLen = line.length;
                const edx = (line.x2 - line.x1) / edgeLen;
                const edy = (line.y2 - line.y1) / edgeLen;
                const jointStart = { x: pt.x - edx * halfGap, y: pt.y - edy * halfGap };
                const jointEnd = { x: pt.x + edx * halfGap, y: pt.y + edy * halfGap };

                _mjLog(`    Ребро #${item.edgeIndex} (${item.originalObj.type}): пересечение (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}), разрыв [${jointStart.x.toFixed(2)},${jointStart.y.toFixed(2)}] → [${jointEnd.x.toFixed(2)},${jointEnd.y.toFixed(2)}]`);

                const broken = createLineWithGap(line, jointStart, jointEnd);
                if (broken.length > 0) {
                    edgeFinalLines.push(...broken);
                    microjoints++;
                    modified = true;
                } else {
                    microjoints++;
                    modified = true;
                    _mjLog(`    Ребро #${item.edgeIndex} полностью удалено`);
                }
            } else {
                edgeFinalLines.push(line);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // ЭТАП 2: Обработка КРУГОВ — разбиение на дуги
    // ═══════════════════════════════════════════════════════════
    let circleResults = [];
    const circlesToRemove = new Set();
    
    for (const circle of circleObjects) {
        const pts = findLineCircleIntersections(microjointLine, circle);
        
        if (pts.length >= 2) {
            // Две точки пересечения — разбиваем на 2 дуги с зазором
            intersections += 2;
            microjoints++;
            modified = true;
            circlesToRemove.add(circle);
            
            // Сортируем точки по углу
            pts.sort((a, b) => a.angle - b.angle);
            
            _mjLog(`    Круг: пересечения [${pts[0].angle.toFixed(3)} (${(pts[0].angle*180/Math.PI).toFixed(0)}°), ${pts[1].angle.toFixed(3)} (${(pts[1].angle*180/Math.PI).toFixed(0)}°)]`);
            
            // Создаём зазор — смещаем точки по окружности
            const gapAngle = halfGap / circle.radius;
            _mjLog(`    gapAngle = ${gapAngle.toFixed(4)} рад (${(gapAngle*180/Math.PI).toFixed(1)}°)`);
            
            const angle1 = pts[0].angle + gapAngle;
            const angle2 = pts[1].angle - gapAngle;
            const angle3 = pts[1].angle + gapAngle;
            const angle4 = pts[0].angle - gapAngle + 2 * Math.PI;
            
            _mjLog(`    Дуга 1: [${angle1.toFixed(3)} → ${angle2.toFixed(3)}] = ${(angle2-angle1).toFixed(3)} рад`);
            _mjLog(`    Дуга 2: [${angle3.toFixed(3)} → ${angle4.toFixed(3)}] = ${(angle4-angle3).toFixed(3)} рад`);
            
            // Дуга 1: от angle1 до angle2
            if (angle2 - angle1 > 0.01) {
                circleResults.push(createArcFromCircle(circle, angle1, angle2, 'CCW'));
            }
            // Дуга 2: от angle3 до angle4
            if (angle4 - angle3 > 0.01) {
                circleResults.push(createArcFromCircle(circle, angle3, angle4, 'CCW'));
            }
            
            _mjLog(`    Круг: 2 пересечения, создано дуг: ${circleResults.length}`);
        } else if (pts.length === 1) {
            // Одна точка — касание, удаляем небольшую дугу
            intersections++;
            microjoints++;
            modified = true;
            circlesToRemove.add(circle);
            
            const gapAngle = halfGap / circle.radius;
            const a1 = pts[0].angle - gapAngle;
            const a2 = pts[0].angle + gapAngle;
            
            // Две дуги по обе стороны от точки касания
            circleResults.push(createArcFromCircle(circle, a2, a1 + 2 * Math.PI, 'CCW'));
            
            _mjLog(`    Круг: 1 пересечение (касание), создано дуг: 1`);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // ЭТАП 3: Обработка ДУГ (arc) — корректное пересечение линия-дуга
    // ═══════════════════════════════════════════════════════════
    let arcResults = [];
    const arcsToRemove = new Set();
    
    for (const arc of arcObjects) {
        // Используем точное пересечение линии с дугой (через окружность + фильтр по углу)
        const arcHits = findLineArcIntersections(microjointLine, arc);
        
        if (arcHits.length > 0) {
            modified = true;
            arcsToRemove.add(arc);
            
            // Сортируем попадания по углу
            arcHits.sort((a, b) => a.angle - b.angle);
            
            const gapAngle = halfGap / arc.radius;
            
            if (arcHits.length === 1) {
                // Одно пересечение — разбиваем дугу на 2 под-дуги с зазором
                intersections++;
                microjoints++;
                
                const hitAngle = arcHits[0].angle;
                
                // Дуга 1: от startAngle до (hitAngle - gapAngle)
                // Дуга 2: от (hitAngle + gapAngle) до endAngle
                // Направление сохраняется
                
                if (arc.direction === 'CCW') {
                    // CCW: от startAngle к endAngle по возрастанию
                    const arc1End = hitAngle - gapAngle;
                    const arc2Start = hitAngle + gapAngle;
                    
                    if (arc1End - arc.startAngle > 0.01) {
                        arcResults.push(createArcFromCircle(arc, arc.startAngle, arc1End, 'CCW'));
                    }
                    if (arc.endAngle - arc2Start > 0.01) {
                        arcResults.push(createArcFromCircle(arc, arc2Start, arc.endAngle, 'CCW'));
                    }
                } else {
                    // CW: от startAngle к endAngle по убыванию
                    const arc1End = hitAngle + gapAngle;
                    const arc2Start = hitAngle - gapAngle;
                    
                    // Для CW: дуга от startAngle убывает к endAngle
                    // Под-дуга 1: от startAngle до arc1End (убывание)
                    // Под-дуга 2: от arc2Start до endAngle (убывание)
                    if (arc.startAngle - arc1End > 0.01) {
                        arcResults.push(createArcFromCircle(arc, arc.startAngle, arc1End, 'CW'));
                    }
                    if (arc2Start - arc.endAngle > 0.01) {
                        arcResults.push(createArcFromCircle(arc, arc2Start, arc.endAngle, 'CW'));
                    }
                }
                
                _mjLog(`    Дуга: 1 пересечение, разбита на ${arcResults.length} под-дуг`);
                
            } else if (arcHits.length >= 2) {
                // Два пересечения — разбиваем дугу на 2 под-дуги (с зазорами у каждого пересечения)
                intersections += arcHits.length;
                microjoints++;
                
                // Для простоты: разбиваем дугу на под-дуги между зазорами
                // Работаем в CCW-пространстве для единообразия
                let sa, ea;
                if (arc.direction === 'CCW') {
                    sa = arc.startAngle;
                    ea = arc.endAngle;
                } else {
                    // CW: инвертируем для обработки как CCW
                    sa = arc.endAngle;
                    ea = arc.startAngle;
                }
                
                // Нормализуем углы попаданий и добавляем зазоры
                // v4.38 FIX M1: семантика gap.start/gap.end была перепутана.
                // gap-регион для точки hit: [hit.angle - gapAngle, hit.angle + gapAngle].
                // Раньше start = +gap, end = -gap → под-дуги строились THROUGH gap-регионы
                // (включали зазор в материал), реальный разрыв не создавался.
                // Эталон — circle-case (строки 641-656): angle1 = +gap, angle2 = -gap,
                // но там под-дуги берутся МЕЖДУ angle1 и angle2 (т.е. между +gap0 и -gap1).
                // Здесь используем правильную семантику: start = -gap (начало gap),
                // end = +gap (конец gap), под-дуги строятся ВНЕ gap-регионов.
                const gapPoints = [];
                for (const hit of arcHits) {
                    gapPoints.push({
                        start: hit.angle - gapAngle,   // НАЧАЛО gap-региона
                        end: hit.angle + gapAngle      // КОНЕЦ gap-региона
                    });
                }

                // Сортируем gap-точки по начальному углу (началу gap-региона)
                gapPoints.sort((a, b) => a.start - b.start);

                // Создаём под-дуги: material ВНЕ gap-регионов
                // - от sa до начала первого gap
                // - между концом gap[i] и началом gap[i+1]
                // - от конца последнего gap до ea
                const subArcs = [];

                // Первая под-дуга: от sa до первого gap.start (начала gap)
                if (gapPoints[0].start - sa > 0.01) {
                    subArcs.push({ start: sa, end: gapPoints[0].start });
                }

                // Промежуточные под-дуги: между gap[i].end (концом gap) и gap[i+1].start (началом следующего gap)
                for (let i = 0; i < gapPoints.length - 1; i++) {
                    const segStart = gapPoints[i].end;        // конец текущего gap
                    const segEnd = gapPoints[i + 1].start;    // начало следующего gap
                    if (segEnd - segStart > 0.01) {
                        subArcs.push({ start: segStart, end: segEnd });
                    }
                }

                // Последняя под-дуга: от последнего gap.end (конца gap) до ea
                if (ea - gapPoints[gapPoints.length - 1].end > 0.01) {
                    subArcs.push({ start: gapPoints[gapPoints.length - 1].end, end: ea });
                }
                
                for (const sub of subArcs) {
                    if (arc.direction === 'CCW') {
                        arcResults.push(createArcFromCircle(arc, sub.start, sub.end));
                    } else {
                        // Возвращаем к CW-направлению
                        if (typeof Arc !== 'undefined') {
                            arcResults.push(new Arc(arc.cx, arc.cy, arc.radius, sub.end, sub.start, 'CW'));
                        } else {
                            arcResults.push({ type: 'arc', cx: arc.cx, cy: arc.cy, radius: arc.radius, startAngle: sub.end, endAngle: sub.start, direction: 'CW' });
                        }
                    }
                }
                
                _mjLog(`    Дуга: ${arcHits.length} пересечений, создано ${arcResults.length} под-дуг`);
            }
        } else {
            arcResults.push(arc);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // ЭТАП 4: Обработка ПОЛИЛИНИЙ (polyline/lwpolyline)
    // ═══════════════════════════════════════════════════════════
    let polylineResults = [];
    const polylinesToRemove = new Set();
    
    for (const pl of polylineObjects) {
        const result = processPolylineMicrojoint(pl, microjointLine, halfGap);
        
        if (result.modified) {
            polylinesToRemove.add(pl);
            polylineResults.push(...result.results);
            intersections += result.microjoints;
            microjoints += result.microjoints;
            modified = true; // Флаг модификации для полилиний
        } else {
            polylineResults.push(pl);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // СБОРКА РЕЗУЛЬТАТА
    // ═══════════════════════════════════════════════════════════
    if (modified) {
        // Собираем оставшиеся edge-объекты (неразрезанные)
        const edgeObjectsToRemove = new Set();
        for (const item of allEdgeLines) {
            const line = item.line;
            const seg = { p1: { x: line.x1, y: line.y1 }, p2: { x: line.x2, y: line.y2 } };
            const pt = findSegmentIntersection(microjointLine, seg);
            if (pt && pointOnSegment(pt, seg, 1.0)) {
                edgeObjectsToRemove.add(item.originalObj);
            }
        }
        const remainingEdges = edgeObjects.filter(o => !edgeObjectsToRemove.has(o));
        
        // Оставшиеся круги (неразрезанные)
        const remainingCircles = circleObjects.filter(o => !circlesToRemove.has(o));
        
        // Оставшиеся дуги (неразрезанные)
        const remainingArcs = arcObjects.filter(o => !arcsToRemove.has(o));
        
        const newObjects = [
            ...nonGeomObjects,
            ...remainingEdges,
            ...remainingCircles,
            ...remainingArcs,
            ...arcResults,
            ...polylineResults,
            ...edgeFinalLines,
            ...circleResults
        ];
        
        _mjLog(`  ${label}: итого объектов: ${newObjects.length} ` +
            `(линий: ${edgeFinalLines.length}, дуг из кругов: ${circleResults.length}, ` +
            `под-дуг: ${arcResults.length}, под-полилиний: ${polylineResults.length})`);
        return { intersections, microjoints, modified: true, finalObjects: newObjects };
    }

    return { intersections, microjoints, modified: false, finalObjects: targetObjects };
}

// ═══════════════════════════════════════════════════════════════
// ОСНОВНАЯ ФУНКЦИЯ: ЗАВЕРШЕНИЕ ЛИНИИ МИКРОСТЫКА
// ═══════════════════════════════════════════════════════════════

window.completeMicrojointLine = function completeMicrojointLine(startPoint, endPoint) {
    if (!window.microjointEnabled || !window.microjointGap) {
        _mjLog('ОШИБКА: режим микростыка не активен');
        return;
    }

    _mjLog('═══════════════════════════════════════════════════════');
    _mjLog('НАЧАЛО ОБРАБОТКИ МИКРОСТЫКА (режим непрерывной резки)');
    _mjLog(`Линия: (${startPoint.x.toFixed(1)}, ${startPoint.y.toFixed(1)}) → (${endPoint.x.toFixed(1)}, ${endPoint.y.toFixed(1)})`);

    if (typeof saveState === 'function') {
        saveState();
        _mjLog('Состояние сохранено для undo');
    }

    const gap = window.microjointGap;
    const microjointLine = {
        p1: { x: startPoint.x, y: startPoint.y },
        p2: { x: endPoint.x, y: endPoint.y }
    };

    let totalIntersections = 0;
    let totalMicrojoints = 0;
    let anyModified = false;

    // ═══════════════════════════════════════════════════════════
    // ОПРЕДЕЛЯЕМ ЦЕЛЕВУЮ ДЕТАЛЬ (приоритет: editingPartId > selected > line_intersects > cursor)
    // ═══════════════════════════════════════════════════════════
    let targetPart = null;
    let targetMode = 'free';

    // 1. Режим редактирования — ВЫСШИЙ приоритет
    if (!targetPart && typeof editingPartId !== 'undefined' && editingPartId !== null) {
        for (const part of parts || []) {
            if (part.id === editingPartId) {
                targetPart = part;
                targetMode = 'editing';
                _mjLog(`Целевая деталь (режим редактирования): "${part.name || 'без имени'}" (id=${part.id})`);
                break;
            }
        }
    }

    // 2. По выделенным объектам
    if (!targetPart && selectedObjects && selectedObjects.length > 0) {
        for (const part of parts || []) {
            if (part && part.objects) {
                for (const selObj of selectedObjects) {
                    if (part.objects.includes(selObj)) {
                        targetPart = part;
                        targetMode = 'selected';
                        _mjLog(`Целевая деталь (по выделению): "${part.name || 'без имени'}" (id=${part.id})`);
                        break;
                    }
                }
                if (targetPart) break;
            }
        }
    }

    // 3. По пересечению линии с bounds детали
    if (!targetPart) {
        for (const part of parts || []) {
            if (lineIntersectsPartBounds(startPoint, endPoint, part)) {
                targetPart = part;
                targetMode = 'line_intersects';
                _mjLog(`Целевая деталь (по пересечению линии): "${part.name || 'без имени'}" (id=${part.id})`);
                break;
            }
        }
    }

    // 4. По позиции курсора
    if (!targetPart) {
        for (const part of parts || []) {
            if (pointInPartBounds(startPoint.x, startPoint.y, part)) {
                targetPart = part;
                targetMode = 'under_cursor';
                _mjLog(`Целевая деталь (по позиции курсора): "${part.name || 'без имени'}" (id=${part.id})`);
                break;
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // ЭТАП 1: Обработка объектов В ДЕТАЛЯХ
    // ═══════════════════════════════════════════════════════════
    if (targetPart) {
        _mjLog(`--- Обработка ТОЛЬКО целевой детали (режим: ${targetMode}) ---`);
        _mjLog(`Деталь "${targetPart.name || 'без имени'}" (id=${targetPart.id}), объектов: ${targetPart.objects.length}`);

        // Сохраняем старые объекты для удаления с холста
        const oldPartObjects = [...targetPart.objects];

        const result = processMicrojointForObjects(targetPart.objects, microjointLine, gap, 'Целевая деталь');
        targetPart.objects = result.finalObjects;
        totalIntersections += result.intersections;
        totalMicrojoints += result.microjoints;
        
        if (result.modified) {
            anyModified = true;
            if (typeof updatePartBounds === 'function') {
                updatePartBounds(targetPart);
                _mjLog('  Границы детали обновлены');
            }

            // v4.38 FIX M4: инвалидировать кеши движка раскладки после микростыка.
            // После разрыва контура геометрия детали изменилась — hull, holes,
            // occupancy grid, positionedPolygons — всё устарело. Если не
            // инвалидировать, следующая раскладка будет использовать STALE данные
            // → коллизии могут быть ложными, плотность некорректной.
            // Аналог багов N2/N3 (AUDIT-5) — drag не обновлял outline.
            if (typeof window !== 'undefined' && typeof window.clearNestingCaches === 'function') {
                window.clearNestingCaches();
                _mjLog('  Кеши движка раскладки инвалидированы (clearNestingCaches)');
            } else if (typeof Nesting !== 'undefined' && typeof Nesting.clearAllCaches === 'function') {
                Nesting.clearAllCaches();
                _mjLog('  Кеши движка раскладки инвалидированы (Nesting.clearAllCaches)');
            }

            // Также инвалидируем nestedParts для этой детали — positionedHull
            // и outline устарели. Пользователь должен сделать re-nest.
            if (typeof appState !== 'undefined' && appState.allSheets) {
                let invalidated = 0;
                for (const sheet of appState.allSheets) {
                    if (sheet && sheet.nestedParts) {
                        for (const np of sheet.nestedParts) {
                            if (np.partId === targetPart.id) {
                                // Помечаем как устаревший — render.js покажет предупреждение
                                np._geometryStale = true;
                                invalidated++;
                            }
                        }
                    }
                }
                if (invalidated > 0) {
                    _mjLog(`  Помечено ${invalidated} nested parts как _geometryStale — требуется re-nest`);
                    // Предупреждение пользователю
                    if (typeof alert !== 'undefined') {
                        void 0;
                    }
                }
            }

            // Синхронизация с холстом ТОЛЬКО если деталь в режиме редактирования
            // (её объекты физически находятся на холсте в objects[])
            // Если деталь размещена (nested) — не трогаем objects[],
            // она отрисовывается через nestedParts
            const isEditing = (typeof editingPartId !== 'undefined' && editingPartId === targetPart.id);
            
            if (isEditing) {
                // Удаляем старые объекты целевой детали из холста
                for (const obj of oldPartObjects) {
                    const idx = objects.indexOf(obj);
                    if (idx >= 0) objects.splice(idx, 1);
                }
                // Добавляем новые объекты целевой детали на холст
                objects.push(...targetPart.objects);
                _mjLog(`  Холст синхронизирован (режим редактирования): ${objects.length} объектов (в детали: ${targetPart.objects.length})`);
            } else {
                _mjLog(`  Деталь не в режиме редактирования — холст не синхронизирован (размещённая деталь)`);
            }
        }
    } else {
        _mjLog('--- Целевая деталь не определена, обработка деталей пропущена ---');
    }

    // ═══════════════════════════════════════════════════════════
    // ЭТАП 2: Обработка СВОБОДНЫХ объектов на холсте
    // ═══════════════════════════════════════════════════════════
    if (!targetPart) {
        const objectsInParts = new Set();
        for (const part of parts || []) {
            if (part && part.objects) {
                for (const obj of part.objects) objectsInParts.add(obj);
            }
        }

        const freeObjects = objects.filter(obj => !objectsInParts.has(obj));
        _mjLog(`--- Свободных объектов на холсте: ${freeObjects.length} ---`);

        if (freeObjects.length > 0) {
            const result = processMicrojointForObjects(freeObjects, microjointLine, gap, 'Свободные');
            
            // Удаляем старые свободные объекты из холста
            for (const obj of freeObjects) {
                const idx = objects.indexOf(obj);
                if (idx >= 0) objects.splice(idx, 1);
            }
            // Добавляем новые
            objects.push(...result.finalObjects);
            
            totalIntersections += result.intersections;
            totalMicrojoints += result.microjoints;
            if (result.modified) anyModified = true;
        }
    } else {
        _mjLog('--- Свободные объекты пропущены (есть целевая деталь) ---');
    }

    _mjLog('═══════════════════════════════════════════════════════');
    _mjLog(`ИТОГО: пересечений найдено: ${totalIntersections}, микростыков создано: ${totalMicrojoints}`);
    _mjLog(`Было модификаций: ${anyModified}`);

    // Сбрасываем только состояние рисования, но НЕ отключаем инструмент
    window.microjointLineStart = null;
    window.microjointLineEnd = null;
    window.microjointIsDrawing = false;

    _mjLog('Разрез выполнен. Инструмент микростыка остаётся активным для следующего разреза.');

    if (typeof render === 'function') render();
    if (typeof updatePartsList === 'function') updatePartsList();
};

// ═══════════════════════════════════════════════════════════════
// СБРОС ПРИ ПЕРЕКЛЮЧЕНИИ ИНСТРУМЕНТА
// ═══════════════════════════════════════════════════════════════

window.resetMicrojoint = function resetMicrojoint() {
    _mjLog('Сброс микростыка (вызван извне)');
    window.microjointEnabled = false;
    window.microjointLineStart = null;
    window.microjointLineEnd = null;
    window.microjointIsDrawing = false;
    const microjointBtn = document.getElementById('microjointTool');
    if (microjointBtn) microjointBtn.classList.remove('active');
};

_mjLog('Модуль микростыка v3.0 успешно загружен');