// =====================================================================
// === КОНФИГУРАЦИЯ ===
// =====================================================================

// ✅ ВАШИ ДАННЫЕ:
// ✅ ВАШИ ДАННЫЕ ОТ SUPABASE:
const SUPABASE_CONFIG = {
    url: 'https://ofxbtognakyiugrijbat.supabase.co',
    anonKey: 'sb_publishable_9hwkldYTVXAbLJuQ9IRzxw_UD4Uls6B',
    // ❌ serviceRoleKey НЕ УКАЗЫВАЕМ здесь!
    timeout: 10000
};

// =====================================================================
// === ФУНКЦИИ ДЛЯ РАБОТЫ С СЕРВЕРОМ ===
// =====================================================================

// ✅ Поиск ответов через сервер
window.fetchAnswersFromServer = async function(question) {
    try {
        const response = await fetch(`${CONFIG.backendUrl}/api/answers?question=${encodeURIComponent(question)}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(CONFIG.timeout)
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        const result = await response.json();
        
        if (result.success && result.data && result.data.length > 0) {
            // Ищем запись с is_correct = true
            const correctRecord = result.data.find(r => r.is_correct === true);
            if (correctRecord && correctRecord.answers) {
                window.sendLogToBackground?.(`✅ Найдено на сервере: ${correctRecord.answers.length} ответов (голосов: ${correctRecord.votes})`);
                return correctRecord.answers;
            }
            
            // Если нет правильных, берем самую популярную
            const topRecord = result.data[0];
            if (topRecord && topRecord.answers) {
                window.sendLogToBackground?.(`⚠️ Найдено на сервере (статус неизвестен): ${topRecord.answers.length} ответов`);
                return topRecord.answers;
            }
        }
        
        return [];
    } catch (error) {
        window.sendLogToBackground?.(`⚠️ Ошибка поиска на сервере: ${error.message}`);
        return [];
    }
};

// ✅ Сохранение ответа через сервер
window.saveAnswerToServer = async function(question, answers, isCorrect = null) {
    // ✅ ПРОВЕРКА РЕЖИМА - СОХРАНЯЕМ ТОЛЬКО В AUTO_AI
    if (window.currentMode !== 'auto_ai') {
        window.sendLogToBackground?.(`ℹ️ Пропуск сохранения (режим: ${window.currentMode})`);
        return false;
    }
    
    if (!answers || answers.length === 0) return false;
    
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
            window.sendLogToBackground?.(`💾 Сохранено на сервере: "${question.substring(0, 40)}..." [${isCorrect === true ? 'ВЕРНО' : (isCorrect === false ? 'НЕВЕРНО' : 'попытка')}]`);
            return true;
        } else {
            window.sendLogToBackground?.(`⚠️ Ошибка сохранения на сервере: ${result.error}`);
            return false;
        }
    } catch (error) {
        window.sendLogToBackground?.(`❌ Ошибка сохранения на сервере: ${error.message}`);
        return false;
    }
};

// ✅ Универсальный поиск: Сервер → Render API → пустой массив
window.fetchAnswersUniversal = async function(question) {
    if (window.isStopped) return [];
    
    window.sendLogToBackground?.(`\n🔍 === УНИВЕРСАЛЬНЫЙ ПОИСК ===`);
    
    // 1. Пробуем сервер (общая база)
    window.sendLogToBackground?.(`1️⃣ Поиск на сервере...`);
    let answers = await window.fetchAnswersFromServer(question);
    if (answers && answers.length > 0) {
        window.sendLogToBackground?.(`✅ Найдено на сервере: ${answers.length} ответов`);
        return answers;
    }
    
    // 2. Пробуем Render API (старый)
    window.sendLogToBackground?.(`2️⃣ Поиск в Render API...`);
    answers = await window.fetchAnswers(question);
    if (answers && answers.length > 0) {
        window.sendLogToBackground?.(`✅ Найдено в Render: ${answers.length} ответов`);
        // Сохраняем находку на сервер
        if (window.currentMode === 'auto_ai') {
            await window.saveAnswerToServer(question, answers, null);
        }
        return answers;
    }
    
    // 3. Ничего не найдено
    window.sendLogToBackground?.(`❌ Ничего не найдено в базах`);
    return [];
};

// Экспортируем конфигурацию
window.CONFIG = CONFIG;
window.fetchAnswersFromServer = fetchAnswersFromServer;
window.saveAnswerToServer = saveAnswerToServer;
window.fetchAnswersUniversal = fetchAnswersUniversal;

// ✅ Проверка подключения при загрузке
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