// ═══════════════════════════════════════════════════════════════
// ПРАЙСИНГ — ВЗАИМНОЕ ИСКЛЮЧЕНИЕ ЦЕН ЗА КГ И М²
// ═══════════════════════════════════════════════════════════════

/**
 * Инициализирует обработчики для взаимного исключения цен за кг и м²
 * При вводе значения в одно поле, другое очищается
 * @param {HTMLElement} overlay - Модальное окно с настройками цен
 */
function initPricingMutualExclusion(overlay) {
    // Обработчик для полей «Цена за кг»
    overlay.querySelectorAll('.price-per-kg').forEach(input => {
        input.addEventListener('input', function() {
            if (this.value > 0) {
                const row = this.closest('tr');
                const m2Input = row.querySelector('.price-per-m2');
                if (m2Input) m2Input.value = '';
            }
        });
    });

    // Обработчик для полей «Цена за м²»
    overlay.querySelectorAll('.price-per-m2').forEach(input => {
        input.addEventListener('input', function() {
            if (this.value > 0) {
                const row = this.closest('tr');
                const kgInput = row.querySelector('.price-per-kg');
                if (kgInput) kgInput.value = '';
            }
        });
    });
}

// Экспорт функции в глобальную область
window.initPricingMutualExclusion = initPricingMutualExclusion;
