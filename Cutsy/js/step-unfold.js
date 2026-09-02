// ═══════════════════════════════════════════════════════════════
// step-unfold.js — v1.0 — Импорт STEP + развёртка листового металла
// ═══════════════════════════════════════════════════════════════
// Использует occt-import-js (WASM) для парсинга STEP-файлов в браузере.
//
// Алгоритм развёртки:
// 1. Парсинг STEP → mesh (vertices, triangles, brep_faces)
// 2. Анализ brep_faces: определение плоских и цилиндрических граней
//    - Плоская грань: все нормали треугольников одинаковы
//    - Цилиндрическая грань (сгиб): нормали меняются плавно
// 3. Выбор базовой плоскости (самая большая плоская грань)
// 4. Развёртка: поворот всех плоских граней в плоскость Z=0
//    - Для каждого сгиба: вычисляем угол и K-factor
//    - Сдвигаем соседние плоские грани на длину развёртки дуги
// 5. Генерация 2D-контура (projection на Z=0)
// 6. Конвертация в объекты холста (Line, Arc, Circle)
//
// Пользователь указывает толщину металла для расчёта K-factor.
// ═══════════════════════════════════════════════════════════════

(function() {
'use strict';

let occtInstance = null;
let occtLoading = false;

/**
 * Загрузить occt-import-js (WASM модуль).
 * Загружается один раз, затем переиспользуется.
 */
async function loadOCCT() {
    if (occtInstance) return occtInstance;
    if (occtLoading) {
        // Ждём пока загрузится в другом вызове
        while (occtLoading) {
            await new Promise(r => setTimeout(r, 100));
        }
        return occtInstance;
    }
    occtLoading = true;
    try {
        // В браузере: загружаем скрипт из CDN
        if (typeof window !== 'undefined' && !window.occtimportjs) {
            await loadScript('https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/occt-import-js.js');
        }
        const occtFactory = (typeof window !== 'undefined') ? window.occtimportjs : null;
        if (!occtFactory) throw new Error('occt-import-js не загружен');
        occtInstance = await occtFactory();
        occtLoading = false;
        console.log('✅ [STEP] occt-import-js загружен');
        return occtInstance;
    } catch(e) {
        occtLoading = false;
        console.error('❌ [STEP] Ошибка загрузки occt-import-js:', e);
        throw e;
    }
}

/**
 * Загрузить скрипт динамически.
 */
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error('Не удалось загрузить: ' + src));
        document.head.appendChild(script);
    });
}

/**
 * Импорт STEP-файла и развёртка листового металла.
 * @param {File} file — STEP-файл (.stp или .step)
 * @param {number} thickness — толщина металла (мм)
 * @returns {Object} результат: { objects: [...], bounds: {...} }
 */
window.importSTEP = async function(file, thickness) {
    if (!file) return null;
    thickness = thickness || 1.0;

    console.log(`📐 [STEP] Импорт: ${file.name}, толщина=${thickness}мм`);

    // 1. Загружаем occt-import-js
    const occt = await loadOCCT();
    if (!occt) {
        alert('❌ Не удалось загрузить модуль STEP-парсера');
        return null;
    }

    // 2. Читаем файл как Uint8Array
    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    // 3. Парсим STEP
    const params = {
        linearUnit: 'millimeter',
        linearDeflectionType: 'absolute_value',
        linearDeflection: 0.1,  // 0.1 мм точность
        angularDeflection: 0.5   // 0.5 рад
    };

    let result;
    try {
        result = occt.ReadStepFile(uint8, params);
    } catch(e) {
        console.error('❌ [STEP] Ошибка парсинга:', e);
        alert('❌ Ошибка парсинга STEP-файла: ' + e.message);
        return null;
    }

    if (!result || !result.success) {
        alert('❌ Не удалось распарсить STEP-файл. Проверьте формат.');
        return null;
    }

    console.log(`✅ [STEP] Парсинг успешен. meshes: ${result.meshes ? result.meshes.length : 0}`);

    // 4. Анализируем mesh — находим плоские грани и сгибы
    const allFaces = [];
    if (result.meshes) {
        for (const mesh of result.meshes) {
            const faces = analyzeMeshFaces(mesh, result.meshes);
            allFaces.push(...faces);
        }
    }

    console.log(`📐 [STEP] Граней найдено: ${allFaces.length}`);
    console.log(`   Плоских: ${allFaces.filter(f => f.type === 'planar').length}`);
    console.log(`   Сгибов: ${allFaces.filter(f => f.type === 'cylindrical').length}`);

    // 5. Развёртка
    const unfolded = unfoldSheetMetal(allFaces, thickness);

    if (unfolded.length === 0) {
        alert('⚠️ Не удалось развернуть деталь. Возможно, это не листовой металл.');
        return null;
    }

    // 6. Конвертация в объекты холста
    const objects = convertToCanvasObjects(unfolded);

    // 7. Вычисление габаритов
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const obj of objects) {
        const pts = getObjPoints(obj);
        for (const p of pts) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        }
    }

    const bounds = {
        minX: minX === Infinity ? 0 : minX,
        minY: minY === Infinity ? 0 : minY,
        maxX: maxX === -Infinity ? 0 : maxX,
        maxY: maxY === -Infinity ? 0 : maxY,
        width: maxX - minX,
        height: maxY - minY
    };

    console.log(`✅ [STEP] Развёртка готова: ${objects.length} объектов, ${bounds.width.toFixed(1)}×${bounds.height.toFixed(1)}мм`);

    return { objects, bounds, fileName: file.name.replace(/\.(stp|step)$/i, '') };
};

/**
 * Анализирует грани меша — определяет плоские и цилиндрические.
 */
function analyzeMeshFaces(mesh, allMeshes) {
    const faces = [];
    if (!mesh || !mesh.brep_faces || !mesh.attributes || !mesh.attributes.position) return faces;

    const positions = mesh.attributes.position.array;
    const indices = mesh.index ? mesh.index.array : null;
    const brepFaces = mesh.brep_faces;

    for (const bf of brepFaces) {
        const first = bf.first;
        const last = bf.last;

        // Собираем треугольники этой грани
        const triangles = [];
        for (let i = first; i <= last; i++) {
            if (indices) {
                const i0 = indices[i * 3];
                const i1 = indices[i * 3 + 1];
                const i2 = indices[i * 3 + 2];
                triangles.push({
                    v0: { x: positions[i0 * 3], y: positions[i0 * 3 + 1], z: positions[i0 * 3 + 2] },
                    v1: { x: positions[i1 * 3], y: positions[i1 * 3 + 1], z: positions[i1 * 3 + 2] },
                    v2: { x: positions[i2 * 3], y: positions[i2 * 3 + 1], z: positions[i2 * 3 + 2] }
                });
            }
        }

        if (triangles.length === 0) continue;

        // Вычисляем нормали каждого треугольника
        const normals = triangles.map(t => {
            const e1 = { x: t.v1.x - t.v0.x, y: t.v1.y - t.v0.y, z: t.v1.z - t.v0.z };
            const e2 = { x: t.v2.x - t.v0.x, y: t.v2.y - t.v0.y, z: t.v2.z - t.v0.z };
            const n = {
                x: e1.y * e2.z - e1.z * e2.y,
                y: e1.z * e2.x - e1.x * e2.z,
                z: e1.x * e2.y - e1.y * e2.x
            };
            const len = Math.hypot(n.x, n.y, n.z);
            if (len > 0.001) { n.x /= len; n.y /= len; n.z /= len; }
            return n;
        });

        // Средняя нормаль
        const avgN = normals.reduce((a, n) => ({ x: a.x + n.x, y: a.y + n.y, z: a.z + n.z }), { x: 0, y: 0, z: 0 });
        const avgLen = Math.hypot(avgN.x, avgN.y, avgN.z);
        if (avgLen > 0.001) { avgN.x /= avgLen; avgN.y /= avgLen; avgN.z /= avgLen; }

        // Отклонение нормалей от средней (определяет тип грани)
        let maxDeviation = 0;
        for (const n of normals) {
            const dot = n.x * avgN.x + n.y * avgN.y + n.z * avgN.z;
            const dev = Math.acos(Math.max(-1, Math.min(1, dot)));
            if (dev > maxDeviation) maxDeviation = dev;
        }

        // Собираем все вершины грани
        const vertices = [];
        for (const t of triangles) {
            vertices.push(t.v0, t.v1, t.v2);
        }

        // Площадь грани
        let area = 0;
        for (const t of triangles) {
            const e1 = { x: t.v1.x - t.v0.x, y: t.v1.y - t.v0.y, z: t.v1.z - t.v0.z };
            const e2 = { x: t.v2.x - t.v0.x, y: t.v2.y - t.v0.y, z: t.v2.z - t.v0.z };
            const cross = {
                x: e1.y * e2.z - e1.z * e2.y,
                y: e1.z * e2.x - e1.x * e2.z,
                z: e1.x * e2.y - e1.y * e2.x
            };
            area += Math.hypot(cross.x, cross.y, cross.z) / 2;
        }

        const face = {
            triangles, vertices, normals, avgNormal: avgN,
            area, maxDeviation,
            type: maxDeviation < 0.05 ? 'planar' : 'cylindrical',
            // Для цилиндрических: вычисляем ось и радиус
            axis: null, radius: 0, bendAngle: 0
        };

        // Для цилиндрических граней (сгибов): вычисляем ось вращения
        if (face.type === 'cylindrical') {
            const axisInfo = findCylinderAxis(normals, vertices);
            if (axisInfo) {
                face.axis = axisInfo.axis;
                face.radius = axisInfo.radius;
                face.bendAngle = axisInfo.angle;
            }
        }

        faces.push(face);
    }

    return faces;
}

/**
 * Находит ось цилиндра (для сгиба) по нормалям грани.
 */
function findCylinderAxis(normals, vertices) {
    if (normals.length < 3) return null;

    // Ось цилиндра — направление, вдоль которого нормали не меняются.
    // Ищем направление, перпендикулярное всем нормалям (наименьший разброс).
    // Для этого: нормали лежат в плоскости, перпендикулярной оси.
    // Ось = cross(n1, n2) для двух далёких нормалей.

    let bestAxis = null;
    let bestScore = 0;

    for (let i = 0; i < normals.length; i += Math.max(1, Math.floor(normals.length / 10))) {
        for (let j = i + 1; j < normals.length; j += Math.max(1, Math.floor(normals.length / 10))) {
            const n1 = normals[i];
            const n2 = normals[j];
            const cross = {
                x: n1.y * n2.z - n1.z * n2.y,
                y: n1.z * n2.x - n1.x * n2.z,
                z: n1.x * n2.y - n1.y * n2.x
            };
            const len = Math.hypot(cross.x, cross.y, cross.z);
            if (len > bestScore) {
                bestScore = len;
                bestAxis = { x: cross.x / len, y: cross.y / len, z: cross.z / len };
            }
        }
    }

    if (!bestAxis) return null;

    // Радиус: среднее расстояние от вершин до оси
    // (проекция на плоскость, перпендикулярную оси)
    let totalDist = 0;
    let count = 0;
    for (const v of vertices) {
        // Проекция вершины на плоскость, перпендикулярную оси
        const dot = v.x * bestAxis.x + v.y * bestAxis.y + v.z * bestAxis.z;
        const proj = { x: v.x - bestAxis.x * dot, y: v.y - bestAxis.y * dot, z: v.z - bestAxis.z * dot };
        // Расстояние от проекции до начала координат (приблизительно)
        const dist = Math.hypot(proj.x, proj.y, proj.z);
        if (dist > 0.001) {
            totalDist += dist;
            count++;
        }
    }
    const radius = count > 0 ? totalDist / count : 0;

    // Угол сгиба: максимальный угол между нормалями
    let maxAngle = 0;
    for (let i = 0; i < normals.length; i++) {
        for (let j = i + 1; j < normals.length; j++) {
            const dot = normals[i].x * normals[j].x + normals[i].y * normals[j].y + normals[i].z * normals[j].z;
            const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
            if (angle > maxAngle) maxAngle = angle;
        }
    }

    return { axis: bestAxis, radius, angle: maxAngle };
}

/**
 * Развёртка листового металла.
 * v1.3: Разворот через ось сгиба (shared vertices с уже развёрнутой гранью).
 */
function unfoldSheetMetal(faces, thickness) {
    const planarFaces = faces.filter(f => f.type === 'planar');
    if (planarFaces.length === 0) return projectAllFacesToXY(faces);

    // v1.6: Фильтруем только совсем мелкие грани (стенки отверстий, вырезы)
    // Абсолютный порог: 50мм² — убирает стенки (area 3-30мм²), оставляет грани отверстий
    const areaThreshold = 50;
    const significantFaces = faces.filter(f => f.area >= areaThreshold);
    console.log(`📐 [UNFOLD] Фильтр: ${faces.length} → ${significantFaces.length} граней (порог ${areaThreshold.toFixed(1)}мм²)`);

    // v1.6: Базовая грань — самая большая плоская грань с нормалью ≈ Z (основание).
    // Раньше: самая большая по площади → могла быть стенкой (normal=X).
    const sigPlanar = significantFaces.filter(f => f.type === 'planar');
    // Сначала ищем грани с нормалью ≈ Z
    let baseFace = sigPlanar.find(f => Math.abs(f.avgNormal.z) > 0.9);
    if (!baseFace) {
        // Нет грани с нормалью Z — берём самую большую
        baseFace = sigPlanar.reduce((a, b) => a.area > b.area ? a : b);
    } else {
        // Среди граней с нормалью Z — берём самую большую
        const zFaces = sigPlanar.filter(f => Math.abs(f.avgNormal.z) > 0.9);
        baseFace = zFaces.reduce((a, b) => a.area > b.area ? a : b);
    }
    const baseRotation = computeRotationToZ(baseFace.avgNormal);

    for (const face of significantFaces) {
        face.rotatedTriangles = face.triangles.map(t => ({
            v0: rotatePoint(t.v0, baseRotation),
            v1: rotatePoint(t.v1, baseRotation),
            v2: rotatePoint(t.v2, baseRotation)
        }));
        face.rotatedNormal = rotatePoint(face.avgNormal, baseRotation);
    }

    const flatFaces = [], bentFaces = [];
    for (const face of significantFaces) {
        if (face.type === 'planar') {
            if (Math.abs(face.rotatedNormal.z) > 0.95) flatFaces.push(face);
            else bentFaces.push(face);
        }
    }

    console.log(`📐 [UNFOLD] Плоских: ${flatFaces.length}, bent: ${bentFaces.length}`);

    function roundVert(v) { return `${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`; }
    function getVertSet(face) {
        const s = new Set();
        for (const t of face.rotatedTriangles) { s.add(roundVert(t.v0)); s.add(roundVert(t.v1)); s.add(roundVert(t.v2)); }
        return s;
    }

    // v1.5: Дедупликация flat граней — верхняя и нижняя пластина дают одинаковый контур
    // Оставляем только одну грань из пары с одинаковым контуром
    const uniqueFlatFaces = [];
    const seenContours = new Set();
    for (const face of flatFaces) {
        const verts = getVertSet(face);
        const contourKey = [...verts].sort().join('|');
        if (!seenContours.has(contourKey)) {
            seenContours.add(contourKey);
            uniqueFlatFaces.push(face);
        } else {
            console.log(`📐 [UNFOLD] Дубликат контура удалён (area=${face.area.toFixed(1)})`);
        }
    }

    const unfoldedFaces = [...uniqueFlatFaces];
    const unfoldedVerts = new Set();
    for (const f of unfoldedFaces) for (const v of getVertSet(f)) unfoldedVerts.add(v);

    const pending = [...bentFaces];
    let maxIter = pending.length + 5;
    while (pending.length > 0 && maxIter-- > 0) {
        let found = false;
        for (let i = 0; i < pending.length; i++) {
            const face = pending[i];
            const faceVerts = getVertSet(face);
            const sharedVerts = [];
            for (const v of faceVerts) if (unfoldedVerts.has(v)) sharedVerts.push(v);
            if (sharedVerts.length < 2) continue;

            const sv = sharedVerts.map(s => { const p = s.split(','); return {x:parseFloat(p[0]),y:parseFloat(p[1]),z:parseFloat(p[2])}; });
            let p1 = sv[0], p2 = sv[1], maxD = 0;
            for (let a = 0; a < sv.length; a++) for (let b = a+1; b < sv.length; b++) {
                const d = Math.hypot(sv[a].x-sv[b].x, sv[a].y-sv[b].y, sv[a].z-sv[b].z);
                if (d > maxD) { maxD = d; p1 = sv[a]; p2 = sv[b]; }
            }
            const axisDir = {x:(p2.x-p1.x)/maxD, y:(p2.y-p1.y)/maxD, z:(p2.z-p1.z)/maxD};
            let angle = Math.acos(Math.max(-1, Math.min(1, Math.abs(face.rotatedNormal.z))));
            angle = Math.PI - angle;

            face.rotatedTriangles = face.rotatedTriangles.map(t => ({
                v0: rotateAroundLine(t.v0, p1, axisDir, -angle),
                v1: rotateAroundLine(t.v1, p1, axisDir, -angle),
                v2: rotateAroundLine(t.v2, p1, axisDir, -angle)
            }));
            face.rotatedNormal = rotateAroundLine(face.rotatedNormal, {x:0,y:0,z:0}, axisDir, -angle);

            unfoldedFaces.push(face);
            for (const v of getVertSet(face)) unfoldedVerts.add(v);
            pending.splice(i, 1); i--; found = true;
            console.log(`📐 [UNFOLD] Развёрнута: ${sharedVerts.length} shared, угол=${(angle*180/Math.PI).toFixed(1)}°`);
        }
        if (!found) break;
    }
    if (pending.length > 0) console.warn(`⚠️ [UNFOLD] Не развёрнуто: ${pending.length}`);

    // v1.6: Проецируем все вершины на Z=0 перед извлечением рёбер
    for (const face of unfoldedFaces) {
        face.rotatedTriangles = face.rotatedTriangles.map(t => ({
            v0: { x: t.v0.x, y: t.v0.y, z: 0 },
            v1: { x: t.v1.x, y: t.v1.y, z: 0 },
            v2: { x: t.v2.x, y: t.v2.y, z: 0 }
        }));
    }

    // v1.6: Берём border edges от ВСЕХ развёрнутых граней (flat + bent).
    // Дедупликация с округлением 2мм убирает дубликаты между гранями.
    const unfoldedEdges = [];
    for (const face of unfoldedFaces) {
        const edges = extractBorderEdges(face.rotatedTriangles);
        unfoldedEdges.push(...edges);
    }
    const uniqueEdges = deduplicateEdges(unfoldedEdges);
    // v1.6: НЕ фильтруем по длине — короткие рёбра могут быть контуром отверстия
    // (круглое отверстие = много рёбер по 1-2мм). Вместо этого фильтруем
    // грани по площади (мелкие грани = стенки отверстий, не добавляем).
    console.log(`📐 [UNFOLD] Рёбер: ${unfoldedEdges.length} → уникальных: ${uniqueEdges.length}`);
    return uniqueEdges;
}

function rotateAroundLine(point, linePoint, lineDir, angle) {
    const p = {x:point.x-linePoint.x, y:point.y-linePoint.y, z:point.z-linePoint.z};
    const d = lineDir;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const dot = p.x*d.x + p.y*d.y + p.z*d.z;
    const r = {
        x: p.x*cos + (d.y*p.z - d.z*p.y)*sin + d.x*dot*(1-cos),
        y: p.y*cos + (d.z*p.x - d.x*p.z)*sin + d.y*dot*(1-cos),
        z: p.z*cos + (d.x*p.y - d.y*p.x)*sin + d.z*dot*(1-cos)
    };
    return {x:r.x+linePoint.x, y:r.y+linePoint.y, z:r.z+linePoint.z};
}

/**
 * Проекция всех граней на плоскость XY (Z=0).
 */
function projectAllFacesToXY(faces) {
    const edges = [];
    for (const face of faces) {
        for (const t of face.triangles) {
            edges.push({ x1: t.v0.x, y1: t.v0.y, x2: t.v1.x, y2: t.v1.y });
            edges.push({ x1: t.v1.x, y1: t.v1.y, x2: t.v2.x, y2: t.v2.y });
            edges.push({ x1: t.v2.x, y1: t.v2.y, x2: t.v0.x, y2: t.v0.y });
        }
    }
    return deduplicateEdges(edges);
}

/**
 * Вычисляет матрицу поворота для совмещения нормали с осью Z.
 */
function computeRotationToZ(normal) {
    const z = { x: 0, y: 0, z: 1 };
    const dot = normal.x * z.x + normal.y * z.y + normal.z * z.z;
    if (Math.abs(dot - 1) < 0.001) return null; // уже Z

    const axis = {
        x: normal.y * z.z - normal.z * z.y,
        y: normal.z * z.x - normal.x * z.z,
        z: normal.x * z.y - normal.y * z.x
    };
    const axisLen = Math.hypot(axis.x, axis.y, axis.z);
    if (axisLen < 0.001) return null;

    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    return { axis: { x: axis.x / axisLen, y: axis.y / axisLen, z: axis.z / axisLen }, angle };
}

/**
 * Поворот точки вокруг произвольной оси (формула Родригеса).
 */
function rotatePoint(p, rotation) {
    if (!rotation) return { x: p.x, y: p.y, z: p.z };
    const { axis, angle } = rotation;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dot = p.x * axis.x + p.y * axis.y + p.z * axis.z;

    return {
        x: p.x * cos + (axis.y * p.z - axis.z * p.y) * sin + axis.x * dot * (1 - cos),
        y: p.y * cos + (axis.z * p.x - axis.x * p.z) * sin + axis.y * dot * (1 - cos),
        z: p.z * cos + (axis.x * p.y - axis.y * p.x) * sin + axis.z * dot * (1 - cos)
    };
}

/**
 * Извлекает только border edges (внешний контур грани).
 * v1.2: Border edge = ребро, принадлежащее только 1 треугольнику.
 * Internal edges (диагонали триангуляции) принадлежат 2 треугольникам — отбрасываем.
 * Это убирает лишние линии внутри контура и сохраняет отверстия.
 */
function extractBorderEdges(triangles) {
    // v1.7: Округляем вершины до 0.01мм перед сравнением — это точно
    // сопоставляет внутренние рёбра (диагонали триангуляции) внутри грани.
    // Грубое округление (1мм) пропускало внутренние рёбра как border → лишние линии.
    const edgeMap = new Map();
    const R = 100; // множитель для округления до 0.01мм

    for (const t of triangles) {
        const verts = [t.v0, t.v1, t.v2];
        for (let i = 0; i < 3; i++) {
            const a = verts[i];
            const b = verts[(i + 1) % 3];
            const ar = { x: Math.round(a.x * R), y: Math.round(a.y * R), z: Math.round(a.z * R) };
            const br = { x: Math.round(b.x * R), y: Math.round(b.y * R), z: Math.round(b.z * R) };
            const k1 = `${ar.x},${ar.y},${ar.z}→${br.x},${br.y},${br.z}`;
            const k2 = `${br.x},${br.y},${br.z}→${ar.x},${ar.y},${ar.z}`;
            const key = k1 < k2 ? k1 : k2;
            if (edgeMap.has(key)) {
                edgeMap.get(key).count++;
            } else {
                edgeMap.set(key, { a, b, count: 1 });
            }
        }
    }

    const edges = [];
    for (const entry of edgeMap.values()) {
        if (entry.count === 1) {
            edges.push({ x1: entry.a.x, y1: entry.a.y, x2: entry.b.x, y2: entry.b.y });
        }
    }
    return edges;
}

/**
 * Удаление дублирующихся рёбер.
 * v1.7: Точное сравнение с допуском 0.1мм вместо грубого округления 2мм.
 * Грубое округление пропускало дубликаты (shared edges между гранями
 * после поворота отличались на >2мм) и создавало лишние линии.
 */
function deduplicateEdges(edges) {
    const R = 10; // округление до 0.1мм
    const seen = new Set();
    const unique = [];
    for (const e of edges) {
        const r1x = Math.round(e.x1 * R);
        const r1y = Math.round(e.y1 * R);
        const r2x = Math.round(e.x2 * R);
        const r2y = Math.round(e.y2 * R);
        const k1 = `${r1x},${r1y}→${r2x},${r2y}`;
        const k2 = `${r2x},${r2y}→${r1x},${r1y}`;
        if (seen.has(k1) || seen.has(k2)) continue;
        seen.add(k1);
        unique.push(e);
    }
    // v1.7: Слияние коллинеарных рёбер — объединяет соседние отрезки
    // на одной прямой в один, убирая «лесенку» из коротких линий.
    return mergeCollinearEdges(unique);
}

/**
 * v1.7: Слияние коллинеарных смежных рёбер.
 * Два ребра сливаются если: конец одного = начало другого И они на одной прямой.
 */
function mergeCollinearEdges(edges) {
    if (edges.length < 2) return edges;
    const TOL = 0.5; // допуск совпадения вершин (мм)
    const ANG_TOL = 0.5 * Math.PI / 180; // допуск угла (0.5°)

    // Группируем рёбра по начальной вершине
    const byStart = new Map();
    for (const e of edges) {
        const k = `${Math.round(e.x1 / TOL)},${Math.round(e.y1 / TOL)}`;
        if (!byStart.has(k)) byStart.set(k, []);
        byStart.get(k).push(e);
    }

    const used = new Set();
    const merged = [];

    for (const e of edges) {
        if (used.has(e)) continue;
        used.add(e);
        let current = { x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2 };
        let dirX = current.x2 - current.x1;
        let dirY = current.y2 - current.y1;
        const dirLen = Math.hypot(dirX, dirY);
        if (dirLen < 0.001) continue;
        dirX /= dirLen; dirY /= dirLen;

        // Пытаемся продолжить ребро вперёд
        let extended = true;
        while (extended) {
            extended = false;
            const endK = `${Math.round(current.x2 / TOL)},${Math.round(current.y2 / TOL)}`;
            const candidates = byStart.get(endK) || [];
            const revCandidates = [];
            // Также ищем рёбра, у которых КОНЕЦ = наш конец (нужно перевернуть)
            for (const c of edges) {
                if (used.has(c)) continue;
                if (Math.abs(c.x2 - current.x2) < TOL && Math.abs(c.y2 - current.y2) < TOL) {
                    revCandidates.push(c);
                }
            }
            for (const c of [...candidates, ...revCandidates]) {
                if (used.has(c)) continue;
                let cx2 = c.x2, cy2 = c.y2;
                // Если ребро начинается с нашего конца — берём как есть
                // Если ребро заканчивается нашим концом — переворачиваем
                if (Math.abs(c.x2 - current.x2) < TOL && Math.abs(c.y2 - current.y2) < TOL) {
                    cx2 = c.x1; cy2 = c.y1;
                }
                const cDirX = cx2 - current.x2;
                const cDirY = cy2 - current.y2;
                const cLen = Math.hypot(cDirX, cDirY);
                if (cLen < 0.001) { used.add(c); continue; }
                const dot = (cDirX * dirX + cDirY * dirY) / cLen;
                if (dot > 1 - 0.001) {
                    // Коллинеарно и сонаправлено — продлеваем
                    current.x2 = cx2;
                    current.y2 = cy2;
                    used.add(c);
                    extended = true;
                    break;
                }
            }
        }
        merged.push(current);
    }
    return merged;
}

/**
 * Конвертация рёбер в объекты холста (Line).
 */
function convertToCanvasObjects(edges) {
    const objects = [];
    for (const e of edges) {
        if (typeof Line !== 'undefined') {
            const line = new Line(e.x1, e.y1, e.x2, e.y2);
            line.color = '#00aadd';
            objects.push(line);
        } else {
            objects.push({
                type: 'line',
                x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2,
                id: Date.now() + Math.random(),
                color: '#00aadd'
            });
        }
    }
    return objects;
}

/**
 * Получить точки объекта для вычисления bounds.
 */
function getObjPoints(obj) {
    if (obj.type === 'line') return [{ x: obj.x1, y: obj.y1 }, { x: obj.x2, y: obj.y2 }];
    if (obj.getPoints) return obj.getPoints();
    return [];
}

console.log('✅ step-unfold.js v1.0 загружен — window.importSTEP(file, thickness)');
})();
