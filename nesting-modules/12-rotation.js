// ════════════════════════════════════════════════════════════════




(function(N) {
    'use strict';
    
N.findPositionWithCommonEdge = function findPositionWithCommonEdge(placedParts, newPart, sheetWidth, sheetHeight, minGap, edgeGap) {
    const newW = newPart.bounds.width;
    const newH = newPart.bounds.height;

    for (let i = 0; i < placedParts.length; i++) {
        const p = placedParts[i];
        const pw = Math.round((p.width || p.bboxWidth || 0) * 100) / 100;
        const ph = Math.round((p.height || p.bboxHeight || 0) * 100) / 100;
        const minOverlap = 0.01;

        const tests = [
            { x: p.x + pw + minGap, y: p.y },           // right
            { x: p.x - newW - minGap, y: p.y },          // left
            { x: p.x, y: p.y + ph + minGap },           // bottom
            { x: p.x, y: p.y - newH - minGap }          // top
        ];

        for (const t of tests) {
            if (t.x < edgeGap || t.y < edgeGap) continue;
            if (t.x + newW > sheetWidth - edgeGap || t.y + newH > sheetHeight - edgeGap) continue;

            const overlapX = Math.min(p.x + pw, t.x + newW) - Math.max(p.x, t.x);
            const overlapY = Math.min(p.y + ph, t.y + newH) - Math.max(p.y, t.y);
            // FIX #2: используем epsilon-сравнение вместо строгого ===
            // Числа с плавающей точкой могут отличаться на 1e-12 после вычислений
            const eps = 0.01;
            if ((Math.abs(t.x - p.x) < eps && overlapX > minOverlap) || (Math.abs(t.y - p.y) < eps && overlapY > minOverlap)) {
                if (!N.isPositionOccupied(t.x, t.y, newW, newH, placedParts, i, minGap)) {
                    const hull = [
                        { x: 0, y: 0 }, { x: newW, y: 0 },
                        { x: newW, y: newH }, { x: 0, y: newH }
                    ].map(pt => ({ x: pt.x + t.x, y: pt.y + t.y }));
                    return { x: t.x, y: t.y, angle: 0, rotation: 0, bboxWidth: newW, bboxHeight: newH, positionedHull: hull };
                }
            }
        }
    }
    return null;
}

N.isPositionOccupied = function isPositionOccupied(x, y, width, height, placedParts, excludeIndex, minGap = 0) {
    for (let i = 0; i < placedParts.length; i++) {
        if (i === excludeIndex) continue;
        const p = placedParts[i];
        const pw = p.width || p.bboxWidth || 0;
        const ph = p.height || p.bboxHeight || 0;
        if (x < p.x + pw + minGap && x + width + minGap > p.x &&
            y < p.y + ph + minGap && y + height + minGap > p.y) {
            return true;
        }
    }
    return false;
}

N.getReferencePoint = function getReferencePoint(polygon) {
    return polygon.reduce((ref, p) =>
        (p.y < ref.y || (p.y === ref.y && p.x < ref.x)) ? p : ref, polygon[0]);
}

N.getRotationAngles = function getRotationAngles(part, isFirstPart) {
    const noRotate = part.noRotate === true;
    if (noRotate) return [0];

    // v3.31: Если пользователь выбрал углы через чекбоксы — используем их
    

    //   180° → +0° (Г-образные детали: 0° и 180° взаимодополняют)
    

    

    if (part.allowedAngles && part.allowedAngles.length > 0) {
        const angles = [...part.allowedAngles];
        // v3.31: Добавляем комплементарные углы для лучшей раскладки
        

        if (angles.includes(180) && !angles.includes(0)) {
            angles.push(0);
            // Добавлен комплементарный 0° к 180°
        }
        // 135° комплементарен 45° (для диагональных раскладок)
        if (angles.includes(135) && !angles.includes(45)) {
            angles.push(45);
            // Добавлен комплементарный 45° к 135°
        }
        // FIX #1 & #6: Убираем дубликаты (Set + EPS_ANGLE) и сортируем
        let deduped = [...new Set(angles)];
        // FIX #6: Дедупликация «почти одинаковых» углов (89.999° vs 90.000° vs 90.001°)
        const EPS_ANGLE = 0.5; // градусы
        for (let i = deduped.length - 1; i >= 0; i--) {
            for (let j = 0; j < i; j++) {
                if (Math.abs(deduped[i] - deduped[j]) < EPS_ANGLE) {
                    deduped[i] = deduped[j]; // приравниваем к ближайшему
                    break;
                }
            }
        }
        const unique = [...new Set(deduped)].sort((a, b) => a - b);
        part._rotationReason = `ручной:[${unique.join('°, ')}°]`;
        // РУЧНОЙ режим: углы=[${unique.join('°, ')}°]
        if (isFirstPart) {
            return [...unique].sort((a, b) => a - b);
        }
        return unique;
    }

    const mode = part.rotationMode || 'auto';
    let angles;
    let reason;
    if (mode === 'fast') {
        angles = [0, 90];
        reason = 'fast';
    } else if (mode === 'full') {
        angles = [0, 20, 40, 60, 80, 90, 100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300, 320, 340];
        reason = 'full';
    } else {
        // auto: умный режим — анализируем геометрию детали
        const objects = part.objects || [];
        // v3.65: Используем N.getShapeType() вместо o.type — классы из shapes.js
        

        

        

        

        const hasCircles = objects.some(o => N.getShapeType(o) === 'circle');
        const hasPolygon = objects.some(o => N.getShapeType(o) === 'polygon' && (o.sides || 6) < 12);
        // Строгая проверка: все объекты — rect или text
        

        const isStrictRect = objects.length > 0 && objects.every(o => { const t = N.getShapeType(o); return t === 'rect' || t === 'text'; });
        // Мягкая проверка: dominant shape = rect (площадь rect'ов покрывает >70% bbox)
        const isRectDominant = (() => {
            if (objects.length === 0) return false;
            const bboxArea = part.bounds ? part.bounds.width * part.bounds.height : 0;
            if (bboxArea <= 0) return false;
            let rectArea = 0;
            for (const o of objects) {
                if (N.getShapeType(o) === 'rect') rectArea += (o.width || 0) * (o.height || 0);
            }
            return rectArea / bboxArea > 0.7;
        })();
        const isRectLike = isStrictRect || isRectDominant;
        const aspectRatio = part.bounds ? (Math.max(part.bounds.width, part.bounds.height) /
            Math.max(1, Math.min(part.bounds.width, part.bounds.height))) : 1;

        if (N.isCircularPart(part)) {
            // Истинно круглая деталь — вращение бессмысленно
            angles = [0];
            reason = 'auto:круг';
        } else if (hasCircles && hasPolygon && !isRectDominant) {
            // Смешанная: есть круги И многоугольники — пробуем несколько углов
            angles = [0, 30, 60, 90, 120, 150, 180];
            reason = 'auto:круг+многоуг.';
        } else if (hasCircles && isRectLike && aspectRatio > 1.3) {
            // Есть круги, но bbox — прямоугольник (доминирующий) — пробуем 0° и 90°
            angles = [0, 90];
            reason = `auto:с-кругом,прямоуг.(aspect=${aspectRatio.toFixed(1)})`;
        } else if (hasCircles && !isRectDominant) {
            // Есть круги, но деталь не чисто круглая и не прямоугольная
            angles = [0, 45, 90, 135, 180];
            reason = 'auto:с-кругом';
        } else if (hasPolygon && !isRectDominant) {
            // Многоугольная деталь (без доминирующего прямоугольника)
            angles = [0, 30, 60, 90, 120, 150, 180];
            reason = 'auto:многоугольник';
        } else if (isRectLike && aspectRatio > 1.3) {
            angles = [0, 90];
            reason = `auto:прямоугольник${isStrictRect ? '' : '(домин.)'}(aspect=${aspectRatio.toFixed(1)})`;
        } else if (isRectLike) {
            angles = [0];
            reason = `auto:квадрат${isStrictRect ? '' : '(домин.)'}(aspect=${aspectRatio.toFixed(1)})`;
        } else if (objects.length === 0) {
            // Нет объектов — только по аспекту
            if (aspectRatio > 1.3) {
                angles = [0, 90];
                reason = `auto:нет-объектов(aspect=${aspectRatio.toFixed(1)})`;
            } else {
                angles = [0];
                reason = `auto:нет-объектов,квадрат`;
            }
        } else {
            angles = [0, 45, 90, 135, 180];
            reason = 'auto:смешанная';
        }
    }
    // FIX #6: Дедупликация «почти одинаковых» углов
    const EPS_ANGLE = 0.5;
    for (let i = angles.length - 1; i >= 0; i--) {
        for (let j = 0; j < i; j++) {
            if (Math.abs(angles[i] - angles[j]) < EPS_ANGLE) {
                angles[i] = angles[j];
                break;
            }
        }
    }
    angles = [...new Set(angles)];

    if (isFirstPart) angles = [...angles].sort((a, b) => (a === 0 ? -1 : b === 0 ? 1 : a - b));
    // Сохраняем reason для логирования
    part._rotationReason = reason;
    return angles;
}

N.prepareRotatedHull = function prepareRotatedHull(hull, angle, centerX, centerY) {
    const rotated = N.rotatePolygon(hull, angle, centerX, centerY);
    const ref = N.getReferencePoint(rotated);
    const shifted = rotated.map(p => ({ x: p.x - ref.x, y: p.y - ref.y }));
    const temp = N.getBoundingBox(shifted);
    const normalized = shifted.map(p => ({ x: p.x - temp.minX, y: p.y - temp.minY }));
    return {
        normalizedHull: normalized,
        refPoint: { x: ref.x + temp.minX, y: ref.y + temp.minY },
        bbox: { width: temp.width, height: temp.height }
    };
}
})(window.Nesting = window.Nesting || {});
