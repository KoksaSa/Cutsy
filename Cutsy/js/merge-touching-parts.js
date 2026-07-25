// ═══════════════════════════════════════════════════════════════
// ОБЪЕДИНЕНИЕ СОПРИКАСАЮЩИХСЯ ДЕТАЛЕЙ (spacing=0)
// ═══════════════════════════════════════════════════════════════

function findAndMergeTouchingParts(parts) {
    if (!parts || parts.length === 0) return [];

    // Шаг 1: Находим пары деталей с spacing=0
    const touchingPairs = [];
    for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
            const partA = parts[i];
            const partB = parts[j];
            
            const spacingA = typeof partA.spacing === 'number' ? partA.spacing : 3;
            const spacingB = typeof partB.spacing === 'number' ? partB.spacing : 3;
            
            if (spacingA !== 0 && spacingB !== 0) continue;
            
            if (arePartsTouching(partA, partB)) {
                touchingPairs.push([i, j]);
            }
        }
    }

    if (touchingPairs.length === 0) return parts.map(p => [p]);

    // Шаг 2: Union-Find
    const parent = parts.map((_, i) => i);
    const find = (i) => {
        if (parent[i] !== i) parent[i] = find(parent[i]);
        return parent[i];
    };
    const union = (i, j) => {
        const rootI = find(i);
        const rootJ = find(j);
        if (rootI !== rootJ) parent[rootI] = rootJ;
    };

    for (const [i, j] of touchingPairs) {
        union(i, j);
    }

    // Шаг 3: Группируем по корням
    const groups = {};
    for (let i = 0; i < parts.length; i++) {
        const root = find(i);
        if (!groups[root]) groups[root] = [];
        groups[root].push(i);
    }

    // Шаг 4: Объединяем каждую группу
    const mergedGroups = [];
    for (const root of Object.keys(groups)) {
        const indices = groups[root];
        if (indices.length === 1) {
            mergedGroups.push([parts[indices[0]]]);
        } else {
            const groupParts = indices.map(i => parts[i]);
            const mergedId = 'M_' + indices.map(i => parts[i].id).sort().join('_');
            const merged = {
                id: mergedId,
                partId: mergedId,
                name: groupParts.map(p => p.name || `Деталь ${p.id}`).join(' + '),
                objects: groupParts.flatMap(p => p.objects || []),
                thickness: groupParts[0]?.thickness || 0.8,
                spacing: 0,
                visible: false,
                nestingEnabled: true,
                isMerged: true,
                bounds: calculateMergedBounds(groupParts)
            };
            mergedGroups.push([merged]);
            console.log(`[MERGE] Группа "${merged.name}": ${indices.length} деталей → ${merged.objects.length} объектов`);
        }
    }

    console.log(`[MERGE] Найдено ${touchingPairs.length} пар, объединено в ${mergedGroups.length} групп`);
    return mergedGroups;
}

function arePartsTouching(partA, partB) {
    const bboxA = partA.bounds;
    const bboxB = partB.bounds;
    
    if (!bboxA || !bboxB) return false;
    
    const overlapX = bboxA.minX < bboxB.minX + bboxB.width && bboxA.minX + bboxA.width > bboxB.minX;
    const overlapY = bboxA.minY < bboxB.minY + bboxB.height && bboxA.minY + bboxA.height > bboxB.minY;
    
    return overlapX && overlapY;
}

function calculateMergedBounds(parts) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    for (const part of parts) {
        for (const obj of part.objects || []) {
            if (obj.type === 'rect') {
                const x = obj.x ?? 0, y = obj.y ?? 0, w = obj.width ?? 0, h = obj.height ?? 0;
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x + w);
                maxY = Math.max(maxY, y + h);
            } else if (obj.type === 'line') {
                minX = Math.min(minX, obj.x1, obj.x2);
                minY = Math.min(minY, obj.y1, obj.y2);
                maxX = Math.max(maxX, obj.x1, obj.x2);
                maxY = Math.max(maxY, obj.y1, obj.y2);
            } else if (obj.type === 'circle' || obj.type === 'arc') {
                minX = Math.min(minX, obj.cx - obj.radius);
                minY = Math.min(minY, obj.cy - obj.radius);
                maxX = Math.max(maxX, obj.cx + obj.radius);
                maxY = Math.max(maxY, obj.cy + obj.radius);
            } else if (obj.points) {
                for (const p of obj.points) {
                    minX = Math.min(minX, p.x);
                    minY = Math.min(minY, p.y);
                    maxX = Math.max(maxX, p.x);
                    maxY = Math.max(maxY, p.y);
                }
            } else if (obj.vertices) {
                for (const v of obj.vertices) {
                    minX = Math.min(minX, v.x);
                    minY = Math.min(minY, v.y);
                    maxX = Math.max(maxX, v.x);
                    maxY = Math.max(maxY, v.y);
                }
            }
        }
    }
    
    return {
        minX, minY, maxX, maxY,
        width: maxX - minX,
        height: maxY - minY
    };
}

window.findAndMergeTouchingParts = findAndMergeTouchingParts;
