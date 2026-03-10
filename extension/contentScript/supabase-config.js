// =====================================================================
// === КОНФИГУРАЦИЯ (Render Backend) ===
// =====================================================================
const CONFIG = {
    backendUrl: 'https://test-extension-ai.onrender.com',
    supabaseUrl: 'https://ofxbtognakyiugrijbat.supabase.co',
    supabaseAnonKey: 'sb_publishable_9hwkldYTVXAbLJuQ9IRzxw_UD4Uls6B',
    apiKey: 'xK9mP2nQ7vL4wR8tY3sF6hJ1zX5cV9bN3mL7kP2',
    timeout: 30000
};

// =====================================================================
// === ФУНКЦИИ ДЛЯ РАБОТЫ С RENDER BACKEND ===
// =====================================================================

// Поиск ответов через Render сервер
window.fetchAnswersFromServer = async function(question) {
    try {
        const response = await fetch(`${CONFIG.backendUrl}/api/answers?question=${encodeURIComponent(question)}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(CONFIG.timeout)
        });

        if (!response.ok) throw new Error(`Server error: ${response.status}`);

        const result = await response.json();

        if (result.success && result.data?.length > 0) {
            const correctRecord = result.data.find(r => r.is_correct === true);
            if (correctRecord?.answers) {
                window.sendLogToBackground?.(`✅ Найдено на сервере: ${correctRecord.answers.length} ответов`);
                return correctRecord.answers;
            }
            const topRecord = result.data[0];
            if (topRecord?.answers) {
                window.sendLogToBackground?.(`⚠️ Найдено на сервере (статус неизвестен)`);
                return topRecord.answers;
            }
        }
        return [];
    } catch (error) {
        window.sendLogToBackground?.(`⚠️ Ошибка поиска на сервере: ${error.message}`);
        return [];
    }
};

// Сохранение ответа через Render сервер
window.saveAnswerToServer = async function(question, answers, isCorrect = null) {
    if (window.currentMode !== 'auto_ai') {
        window.sendLogToBackground?.(`ℹ️ Пропуск сохранения (режим: ${window.currentMode})`);
        return false;
    }
    if (!answers?.length) return false;

    try {
        const response = await fetch(`${CONFIG.backendUrl}/api/answers`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': CONFIG.apiKey
            },
            body: JSON.stringify({
                question: question.trim(),
                answers: answers.map(a => a.trim()),
                isCorrect: isCorrect
            }),
            signal: AbortSignal.timeout(CONFIG.timeout)
        });

        const result = await response.json();
        if (result.success) {
            window.sendLogToBackground?.(`💾 Сохранено на сервере: "${question.substring(0, 40)}..."`);
            return true;
        }
        return false;
    } catch (error) {
        window.sendLogToBackground?.(`❌ Ошибка сохранения: ${error.message}`);
        return false;
    }
};

// ✅ Обновление статуса ответа через Render сервер (ИСПРАВЛЕНО!)
window.updateAnswerStatus = async function(id, isCorrect) {
    if (!id) {
        window.sendLogToBackground?.(`⚠️ Нет ID для обновления`);
        return false;
    }

    try {
        const response = await fetch(`${CONFIG.backendUrl}/api/answers/${id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': CONFIG.apiKey
            },
            body: JSON.stringify({
                isCorrect: isCorrect
            }),
            signal: AbortSignal.timeout(CONFIG.timeout)
        });

        if (!response.ok) {
            throw new Error(`Status ${response.status}`);
        }

        const result = await response.json();
        if (result.success) {
            window.sendLogToBackground?.(`✅ Успешно обновлено #${id}`);
            return true;
        }
        return false;
    } catch (error) {
        window.sendLogToBackground?.(`⚠️ Ошибка обновления #${id}: ${error.message}`);
        return false;
    }
};

// Экспорт в глобальную область
window.CONFIG = CONFIG;
window.fetchAnswersFromServer = fetchAnswersFromServer;
window.saveAnswerToServer = saveAnswerToServer;
window.updateAnswerStatus = updateAnswerStatus;

// Проверка подключения
(async function testConnection() {
    try {
        const response = await fetch(`${CONFIG.backendUrl}/health`);
        if (response.ok) {
            window.sendLogToBackground?.('✅ Render сервер подключён');
        }
    } catch (e) {
        window.sendLogToBackground?.('⚠️ Render сервер: проверка соединения:', e.message);
    }
})();