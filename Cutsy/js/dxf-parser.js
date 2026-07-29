// ═══════════════════════════════════════════════════════════
// dxf-parser.js — исправленная версия
// Возвращает сущности в формате, совместимом с dxf-import.js
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// ЧТЕНИЕ ЗАГОЛОВКА (HEADER) — для $ANGDIR, $ANGBASE
// ═══════════════════════════════════════════════════════════════
function parseHeader(tokens) {
    let angdir = 0;   // 0 = против часовой, 1 = по часовой
    let angbase = 0;  // базовый угол (обычно 0)
    let i = 0;
    let inHeader = false;

    while (i < tokens.length) {
        const t = tokens[i];
        if (!inHeader && t.code === 0 && t.value === "SECTION") {
            if (i + 1 < tokens.length && tokens[i+1].code === 2 && tokens[i+1].value === "HEADER") {
                inHeader = true;
                i += 2;
                continue;
            }
        }
        if (inHeader && t.code === 0 && t.value === "ENDSEC") break;
        if (inHeader) {
            if (t.code === 9 && t.value === "$ANGDIR") {
                if (i + 1 < tokens.length && tokens[i+1].code === 70) {
                    angdir = parseInt(tokens[i+1].value);
                }
            }
            if (t.code === 9 && t.value === "$ANGBASE") {
                if (i + 1 < tokens.length && tokens[i+1].code === 50) {
                    angbase = parseFloat(tokens[i+1].value);
                }
            }
        }
        i++;
    }

    return { angdir, angbase };
}

// ═══════════════════════════════════════════════════════════════
// ПАРСЕР DXF (ТОКЕНОВЫЙ ПОДХОД)
// Возвращает объект { entities: [...] } для совместимости с dxf-import.js
// ═══════════════════════════════════════════════════════════════
function parseDXF(dxfContent) {
    console.log('=== НАЧАЛО ПАРСИНГА DXF (кастомный парсер) ===');

    // Разбиваем на токены: пары (код, значение)
    const lines = dxfContent.split(/\r?\n/);
    const tokens = [];
    for (let i = 0; i < lines.length; i++) {
        let code = lines[i].trim();
        if (code === "") continue;
        let val = lines[i+1] !== undefined ? lines[i+1].trim() : "";
        tokens.push({ code: parseInt(code), value: val });
        i++; // пропускаем строку значения
    }

    console.log(`Всего токенов: ${tokens.length}`);

    // Читаем заголовок для настроек углов
    const header = parseHeader(tokens);
    console.log(`АНГDIR=${header.angdir}, АНГBASE=${header.angbase}`);

    // ═══════════════════════════════════════════════════════════════
    // 1. Читаем секцию BLOCKS
    // ═══════════════════════════════════════════════════════════════
    const blocks = {};
    let i = 0;
    let inBlocks = false;
    let currentBlockName = null;
    let currentBlockEntities = [];

    while (i < tokens.length) {
        const t = tokens[i];

        // Начало секции BLOCKS
        if (!inBlocks && t.code === 0 && t.value === "SECTION") {
            if (i+1 < tokens.length && tokens[i+1].code === 2 && tokens[i+1].value === "BLOCKS") {
                inBlocks = true;
                console.log('Найдена секция BLOCKS');
                i += 2;
                continue;
            }
        }

        // Конец секции BLOCKS
        if (inBlocks && t.code === 0 && t.value === "ENDSEC") {
            console.log('Конец секции BLOCKS');
            break;
        }

        if (inBlocks) {
            // Начало блока
            if (t.code === 0 && t.value === "BLOCK") {
                currentBlockName = null;
                currentBlockEntities = [];
                i++;
                continue;
            }

            // Имя блока (код 2)
            if (t.code === 2 && !currentBlockName) {
                currentBlockName = t.value;
                console.log('Найден блок:', currentBlockName);
            }

            // Конец блока
            if (t.code === 0 && t.value === "ENDBLK") {
                if (currentBlockName) {
                    blocks[currentBlockName] = currentBlockEntities;
                    console.log(`Блок ${currentBlockName}: ${currentBlockEntities.length} объектов`);
                }
                i++;
                continue;
            }

            // Объекты внутри блока
            if (t.code === 0 && ['LINE', 'CIRCLE', 'ARC', 'LWPOLYLINE', 'POLYLINE', 'SPLINE', 'ELLIPSE'].includes(t.value)) {
                const type = t.value;
                i++;
                const entity = parseEntity(tokens, i, type, header);
                if (entity) {
                    currentBlockEntities.push(entity);
                    console.log(`  -> ${type} в блоке`);
                }
                continue;
            }
        }

        i++;
    }

    // ═══════════════════════════════════════════════════════════════
    // 2. Читаем секцию ENTITIES
    // ═══════════════════════════════════════════════════════════════
    i = 0;
    let inEntities = false;
    const entities = [];

    while (i < tokens.length) {
        const t = tokens[i];

        // Начало секции ENTITIES
        if (!inEntities && t.code === 0 && t.value === "SECTION") {
            if (i+1 < tokens.length && tokens[i+1].code === 2 && tokens[i+1].value === "ENTITIES") {
                inEntities = true;
                console.log('Найдена секция ENTITIES');
                i += 2;
                continue;
            }
        }

        // Конец секции ENTITIES
        if (inEntities && t.code === 0 && t.value === "ENDSEC") {
            console.log('Конец секции ENTITIES');
            break;
        }

        if (inEntities && t.code === 0) {
            // Начало сущности
            const type = t.value;
            i++;

            if (['LINE', 'CIRCLE', 'ARC', 'LWPOLYLINE', 'POLYLINE', 'SPLINE', 'ELLIPSE'].includes(type)) {
                const entity = parseEntity(tokens, i, type, header);
                if (entity) {
                    entities.push(entity);
                    console.log(`Добавлено: ${type}`);
                }
            }
            // INSERT (блоки)
            else if (type === 'INSERT') {
                const insert = { blockName: '', x: 0, y: 0 };
                while (i < tokens.length && tokens[i].code !== 0) {
                    const { code, value } = tokens[i];
                    if (code === 2) insert.blockName = value;
                    if (code === 10) insert.x = parseFloat(value);
                    if (code === 20) insert.y = parseFloat(value);
                    i++;
                }

                // Добавляем объекты из блока со смещением
                if (insert.blockName && blocks[insert.blockName]) {
                    console.log(`Вставка блока ${insert.blockName} в (${insert.x}, ${insert.y})`);
                    blocks[insert.blockName].forEach(ent => {
                        const cloned = JSON.parse(JSON.stringify(ent)); // глубокое клонирование

                        // Применяем смещение INSERT к координатам
                        if (cloned.type === 'LINE') {
                            if (cloned.start) { cloned.start.x += insert.x; cloned.start.y += insert.y; }
                            if (cloned.end) { cloned.end.x += insert.x; cloned.end.y += insert.y; }
                        } else if (cloned.type === 'CIRCLE') {
                            if (cloned.center) { cloned.center.x += insert.x; cloned.center.y += insert.y; }
                        } else if (cloned.type === 'ARC') {
                            if (cloned.center) { cloned.center.x += insert.x; cloned.center.y += insert.y; }
                        } else if (cloned.type === 'SPLINE') {
                            if (cloned.controlPoints) cloned.controlPoints.forEach(p => { p.x += insert.x; p.y += insert.y; });
                            if (cloned.fitPoints) cloned.fitPoints.forEach(p => { p.x += insert.x; p.y += insert.y; });
                        } else if (cloned.type === 'ELLIPSE') {
                            // v5.01: majorAxisEndPoint — ВЕКТОР, не сдвигается, только центр
                            if (cloned.center) { cloned.center.x += insert.x; cloned.center.y += insert.y; }
                        } else if (cloned.type === 'LWPOLYLINE' || cloned.type === 'POLYLINE') {
                            if (cloned.vertices) cloned.vertices.forEach(v => { v.x += insert.x; v.y += insert.y; });
                        }

                        entities.push(cloned);
                    });
                }
                continue;
            }
            // Пропускаем остальные сущности
            else {
                while (i < tokens.length && tokens[i].code !== 0) i++;
                continue;
            }
            // i уже сдвинут внутри parseEntity
            continue;
        }

        i++;
    }

    console.log(`=== ВСЕГО ОБЪЕКТОВ: ${entities.length} ===`);

    // Возвращаем в формате, совместимом с DxfParser (npm-библиотека)
    return { entities: entities };
}

// ═══════════════════════════════════════════════════════════════
// Парсинг отдельной сущности
// Возвращает объекты в формате dxf-import.js:
//   LINE:      { type: 'LINE', start: {x,y}, end: {x,y} }
//   CIRCLE:    { type: 'CIRCLE', center: {x,y}, radius }
//   ARC:       { type: 'ARC', center: {x,y}, radius, startAngle, endAngle }
//   SPLINE:    { type: 'SPLINE', controlPoints: [{x,y}], knotValues: [num], degreeOfSplineCurve, closed, fitPoints: [{x,y}] }
//   LWPOLYLINE:{ type: 'LWPOLYLINE', vertices: [{x,y,bulge}], closed }
//   POLYLINE:  { type: 'POLYLINE', vertices: [{x,y,bulge}], closed }
//   ELLIPSE:   { type: 'ELLIPSE', center: {x,y}, majorAxisEndPoint: {x,y}, axisRatio, startAngle, endAngle }
// ═══════════════════════════════════════════════════════════════
function parseEntity(tokens, startIdx, type, header) {
    let idx = startIdx;

    if (type === "LINE") {
        let x1, y1, x2, y2;
        while (idx < tokens.length && tokens[idx].code !== 0) {
            const { code, value } = tokens[idx];
            if (code === 10) x1 = parseFloat(value);
            if (code === 20) y1 = parseFloat(value);
            if (code === 11) x2 = parseFloat(value);
            if (code === 21) y2 = parseFloat(value);
            idx++;
        }
        if (x1 !== undefined && y1 !== undefined && x2 !== undefined && y2 !== undefined) {
            return { type: 'LINE', start: { x: x1, y: y1 }, end: { x: x2, y: y2 } };
        }
    }
    else if (type === "CIRCLE") {
        let cx, cy, r;
        while (idx < tokens.length && tokens[idx].code !== 0) {
            const { code, value } = tokens[idx];
            if (code === 10) cx = parseFloat(value);
            if (code === 20) cy = parseFloat(value);
            if (code === 40) r = parseFloat(value);
            idx++;
        }
        if (cx !== undefined && cy !== undefined && r && r > 0) {
            return { type: 'CIRCLE', center: { x: cx, y: cy }, radius: r };
        }
    }
    else if (type === "ARC") {
        let cx, cy, r, startAngle, endAngle;
        while (idx < tokens.length && tokens[idx].code !== 0) {
            const { code, value } = tokens[idx];
            if (code === 10) cx = parseFloat(value);
            if (code === 20) cy = parseFloat(value);
            if (code === 40) r = parseFloat(value);
            if (code === 50) startAngle = parseFloat(value);
            if (code === 51) endAngle = parseFloat(value);
            idx++;
        }
        if (cx !== undefined && cy !== undefined && r > 0 && startAngle !== undefined && endAngle !== undefined) {
            // v5.01: Возвращаем углы в ГРАДУСАХ (как в DXF-файле),
            // для совместимости с npm dxf-parser.
            // approximateArc() в dxf-import.js сама конвертирует в радианы.
            return {
                type: 'ARC',
                center: { x: cx, y: cy },
                radius: r,
                startAngle: startAngle,
                endAngle: endAngle
            };
        }
    }
    else if (type === "ELLIPSE") {
        let cx, cy;
        let majorX, majorY;
        let ratio;
        let startParam = 0, endParam = 2 * Math.PI;
        while (idx < tokens.length && tokens[idx].code !== 0) {
            const { code, value } = tokens[idx];
            if (code === 10) cx = parseFloat(value);
            if (code === 20) cy = parseFloat(value);
            if (code === 11) majorX = parseFloat(value);
            if (code === 21) majorY = parseFloat(value);
            if (code === 40) ratio = parseFloat(value);
            if (code === 41) startParam = parseFloat(value);
            if (code === 42) endParam = parseFloat(value);
            idx++;
        }
        if (cx !== undefined && cy !== undefined && majorX !== undefined && majorY !== undefined) {
            // v5.01: majorAxisEndPoint — ВЕКТОР от центра (как в DXF spec),
            // НЕ абсолютная точка. approximateEllipse() вычисляет длину вектора.
            return {
                type: 'ELLIPSE',
                center: { x: cx, y: cy },
                majorAxisEndPoint: { x: majorX, y: majorY },
                axisRatio: ratio || 1,
                startAngle: startParam,
                endAngle: endParam
            };
        }
    }
    else if (type === "SPLINE") {
        let degree = 3;
        let flag = 0;
        let knots = [];
        let controlPoints = [];
        let fitPoints = [];

        while (idx < tokens.length && tokens[idx].code !== 0) {
            const { code, value } = tokens[idx];

            if (code === 70) flag = parseInt(value);
            if (code === 71) degree = parseInt(value);

            // Узлы (код 40)
            if (code === 40) knots.push(parseFloat(value));

            // Контрольные точки (код 10/20)
            if (code === 10) {
                let x = parseFloat(value);
                let y = 0;
                if (idx + 1 < tokens.length && tokens[idx+1].code === 20) {
                    y = parseFloat(tokens[idx+1].value);
                    idx++;
                }
                controlPoints.push({ x, y });
            }

            // Точки подгонки (код 11/21)
            if (code === 11) {
                let x = parseFloat(value);
                let y = 0;
                if (idx + 1 < tokens.length && tokens[idx+1].code === 21) {
                    y = parseFloat(tokens[idx+1].value);
                    idx++;
                }
                fitPoints.push({ x, y });
            }

            idx++;
        }

        const closed = (flag & 1) === 1;

        // Возвращаем "сырые" данные сплайна — dxf-import.js сам обработает
        // (вызовет splineToPolyline с алгоритмом Де Бора или approximateSpline)
        const result = {
            type: 'SPLINE',
            degreeOfSplineCurve: degree,
            closed: closed
        };

        if (controlPoints.length > 0) {
            result.controlPoints = controlPoints;
        }
        if (knots.length > 0) {
            result.knotValues = knots;
        }
        if (fitPoints.length > 0) {
            result.fitPoints = fitPoints;
        }

        console.log(`  SPLINE: degree=${degree}, ${controlPoints.length} ctrl pts, ${knots.length} knots, ${fitPoints.length} fit pts, closed=${closed}`);

        if (controlPoints.length > 0 || fitPoints.length > 0) {
            return result;
        }
    }
    else if (type === "LWPOLYLINE") {
        let vertices = [];
        let closed = false;
        let lastVertex = null;
        while (idx < tokens.length && tokens[idx].code !== 0) {
            const { code, value } = tokens[idx];
            if (code === 70) closed = (parseInt(value) & 1) === 1;
            if (code === 10) {
                let x = parseFloat(value);
                let y = 0;
                if (idx+1 < tokens.length && tokens[idx+1].code === 20) {
                    y = parseFloat(tokens[idx+1].value);
                    idx++;
                }
                lastVertex = { x, y, bulge: 0 };
                vertices.push(lastVertex);
            }
            if (code === 42 && lastVertex) {
                lastVertex.bulge = parseFloat(value);
            }
            idx++;
        }
        if (vertices.length > 0) {
            return { type: 'LWPOLYLINE', vertices, closed };
        }
    }
    else if (type === "POLYLINE") {
        let vertices = [];
        let closed = false;
        while (idx < tokens.length && !(tokens[idx].code === 0 && tokens[idx].value === "SEQEND")) {
            const { code, value } = tokens[idx];
            if (code === 70 && (parseInt(value) & 1)) closed = true;
            if (code === 0 && value === "VERTEX") {
                let vx, vy, bulge = 0;
                let subIdx = idx+1;
                while (subIdx < tokens.length && tokens[subIdx].code !== 0) {
                    if (tokens[subIdx].code === 10) vx = parseFloat(tokens[subIdx].value);
                    if (tokens[subIdx].code === 20) vy = parseFloat(tokens[subIdx].value);
                    if (tokens[subIdx].code === 42) bulge = parseFloat(tokens[subIdx].value);
                    subIdx++;
                }
                if (vx !== undefined && vy !== undefined) vertices.push({ x: vx, y: vy, bulge });
                idx = subIdx;
                continue;
            }
            idx++;
        }
        // Перемотать до SEQEND
        while (idx < tokens.length && !(tokens[idx].code === 0 && tokens[idx].value === "SEQEND")) idx++;
        if (idx < tokens.length) idx++; // пропускаем сам SEQEND

        if (vertices.length > 0) {
            return { type: 'POLYLINE', vertices, closed };
        }
    }

    // Пропускаем остальные токены до следующей сущности
    while (idx < tokens.length && tokens[idx].code !== 0) idx++;
    return null;
}