/**
 * Генератор лицензионных ключей Cutsy CAD PRO
 * Использование: node scripts/generate-key.js [количество]
 */

// Минимальная реализация LicenseManager для генерации без DOM
class KeyGenerator {
    static PRO_KEY_PREFIX = 'CUTSY2-PRO-';

    static _calcCs(str) {
        let h = 0;
        for (let i = 0; i < str.length; i++) {
            h = ((h << 5) - h) + str.charCodeAt(i);
            h |= 0;
        }
        return Math.abs(h).toString(16).padStart(8, '0').toUpperCase().slice(-8);
    }

    static generate() {
        const r1 = Math.random().toString(36).slice(2, 6).toUpperCase();
        const r2 = Math.random().toString(36).slice(2, 6).toUpperCase();
        const base = `${this.PRO_KEY_PREFIX}${r1}-${r2}`;
        const cs = this._calcCs(base);
        return `${base}-${cs}`;
    }
}

const count = parseInt(process.argv[2], 10) || 1;

console.log('═══════════════════════════════════════');
console.log('  Cutsy CAD PRO — Генератор ключей');
console.log('═══════════════════════════════════════\n');

const keys = [];
for (let i = 0; i < count; i++) {
    const key = KeyGenerator.generate();
    keys.push(key);
    console.log(`${i + 1}. ${key}`);
}

console.log('\n═══════════════════════════════════════');
console.log(`Всего сгенерировано: ${count}`);
console.log('Формат: CUTSY2-PRO-XXXX-XXXX-XXXXXXXX');
console.log('═══════════════════════════════════════');
