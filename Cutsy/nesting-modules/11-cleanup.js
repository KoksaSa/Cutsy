// ════════════════════════════════════════════════════════════════
// SilikinK Nesting Engine — DXF Cleanup Utilities (Module 11)
// ════════════════════════════════════════════════════════════════
(function(N) {
    'use strict';
    
N.removeShortSegments = function removeShortSegments(objects, minLength = 0.05) {
    if (!objects) return objects;
    for (const obj of objects) {
        // v3.67: N.getShapeType() вместо obj.type
        const objType = N.getShapeType(obj);
        if (objType === 'line') {
            const len = Math.hypot((obj.x2 || 0) - (obj.x1 || 0), (obj.y2 || 0) - (obj.y1 || 0));
            if (len < minLength) {
                obj._removed = true;
            }
        } else if (objType === 'polyline' || objType === 'lwpolyline') {
            const pts = obj.points || obj.vertices || [];
            // Удаляем сегменты короче minLength
            for (let i = pts.length - 1; i > 0; i--) {
                const len = Math.hypot(
                    (pts[i].x || 0) - (pts[i-1].x || 0),
                    (pts[i].y || 0) - (pts[i-1].y || 0)
                );
                if (len < minLength) {
                    pts.splice(i, 1); // убираем точку, сливающую короткий сегмент
                }
            }
        }
    }
    return objects.filter(o => !o._removed);
}

N.removeDuplicateVertices = function removeDuplicateVertices(objects) {
    if (!objects) return objects;
    for (const obj of objects) {
        // v3.67: N.getShapeType() вместо obj.type
        if (N.getShapeType(obj) === 'polyline' || N.getShapeType(obj) === 'lwpolyline') {
            const pts = obj.points || obj.vertices || [];
            for (let i = pts.length - 1; i > 0; i--) {
                if (Math.abs(pts[i].x - pts[i-1].x) < N.EPS &&
                    Math.abs(pts[i].y - pts[i-1].y) < N.EPS) {
                    pts.splice(i, 1);
                }
            }
            // Последняя = первая (замкнутая полилиния)?
            if (pts.length > 2 &&
                Math.abs(pts[0].x - pts[pts.length-1].x) < N.EPS &&
                Math.abs(pts[0].y - pts[pts.length-1].y) < N.EPS) {
                pts.splice(pts.length - 1, 1);
            }
        }
    }
    return objects;
}

N.removeCollinearVertices = function removeCollinearVertices(objects) {
    if (!objects) return objects;
    for (const obj of objects) {
        // v3.67: N.getShapeType() вместо obj.type
        if (N.getShapeType(obj) === 'polyline' || N.getShapeType(obj) === 'lwpolyline') {
            const pts = obj.points || obj.vertices || [];
            if (pts.length < 3) continue;
            // FIX: Проверяем, замкнута ли полилиния.
            // Для незамкнутых — не используем модульную арифметику
            // для первой/последней вершины, чтобы не удалить
            // концевые точки (они значимы для разомкнутых контуров).
            const closed = obj.closed === true || obj.isClosed === true;
            const first = pts[0], last = pts[pts.length - 1];
            const isClosedGeom = first && last &&
                Math.abs(first.x - last.x) < N.EPS &&
                Math.abs(first.y - last.y) < N.EPS;
            const isClosed = closed || isClosedGeom;

            for (let i = pts.length - 1; i >= 0; i--) {
                // Для незамкнутых полилиний — пропускаем первую и последнюю вершину
                if (!isClosed && (i === 0 || i === pts.length - 1)) continue;

                const prev = pts[(i - 1 + pts.length) % pts.length];
                const curr = pts[i];
                const next = pts[(i + 1) % pts.length];
                // Векторное произведение = 0 → коллинеарны
                const cross = (curr.x - prev.x) * (next.y - prev.y) -
                              (curr.y - prev.y) * (next.x - prev.x);
                if (Math.abs(cross) < N.EPS * 10) {
                    pts.splice(i, 1);
                }
            }
        }
    }
    return objects;
}

// Комплексная очистка DXF-геометрии детали
N.cleanupPartGeometry = function cleanupPartGeometry(part) {
    if (!part.objects || part._geometryCleaned) return;
    part.objects = N.removeShortSegments(part.objects, 0.05);
    part.objects = N.mergeCloseVertices(part.objects, N.MERGE_EPS);
    part.objects = N.removeDuplicateVertices(part.objects);
    part.objects = N.removeCollinearVertices(part.objects);
    part._geometryCleaned = true;
}
})(window.Nesting = window.Nesting || {});
