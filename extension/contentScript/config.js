// extension/contentScript/config.js
// =====================================================================
// === КОНФИГУРАЦИЯ РАСШИРЕНИЯ ===
// =====================================================================

const CONFIG = {
    // ✅ URL вашего сервера на Render
    backendUrl: 'https://test-extension-ai.onrender.com',
    
    // ✅ Supabase anon key (только для чтения, безопасно)
    supabaseUrl: 'https://ofxbtognakyiugrijbat.supabase.co',
    supabaseAnonKey: 'sb_publishable_9hwkldYTVXAbLJuQ9IRzxw_UD4Uls6B',
    
    // ✅ API ключ для записи (тот же, что в Render!)
    apiKey: 'your_secret_api_key_here_12345',
    
    // Таймауты
    timeout: 15000
};

// ✅ Экспорт в глобальную область
window.CONFIG = CONFIG;

// ✅ Проверка подключения к серверу
(async function testConnection() {
    try {
        const response = await fetch(`${CONFIG.backendUrl}/health`);
        if (response.ok) {
            window.sendLogToBackground?.('✅ Сервер подключён');
        }
    } catch (e) {
        window.sendLogToBackground?.('⚠️ Сервер: проверка соединения:', e.message);
    }
})();