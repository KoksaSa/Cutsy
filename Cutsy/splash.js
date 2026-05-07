// ═══════════════════════════════════════════════════════════
// ЗАСТАВКА (SPLASH SCREEN) — 1 секунда
// ═══════════════════════════════════════════════════════════

(function initSplashScreen() {
    // Создаём HTML заставки (БЕЗ CSS анимации!)
    const splashHTML = `
    <div id="splashScreen" style="position:fixed;top:0;left:0;width:100%;height:100%;background:linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%);display:flex;justify-content:center;align-items:center;z-index:99999;">
        <img src="logo.png" alt="Загрузка..." style="max-width:600px;max-height:400px;object-fit:contain;box-shadow:0 10px 40px rgba(0,0,0,0.5);border-radius:8px;">
    </div>`;

    // Вставляем заставку в начало body
    document.body.insertAdjacentHTML('afterbegin', splashHTML);

    // Автоматическое скрытие после загрузки страницы
    window.addEventListener('load', () => {
        setTimeout(() => {
            const splash = document.getElementById('splashScreen');
            if (splash) {
                // Добавляем плавное исчезновение с улетанием СТРОГО ВВЕРХ
                splash.style.transition = 'all 0.8s cubic-bezier(0.7, 0, 0.3, 1)';
                splash.style.opacity = '0';
                splash.style.transform = 'translateY(-100vh)'; // Только вверх, без scale!
                splash.style.pointerEvents = 'none';
                
                setTimeout(() => {
                    splash.remove(); // Полностью удаляем из DOM
                }, 800);
            }
        }, 500); // 1 секунда показ
    });
})();