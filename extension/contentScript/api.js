// =====================================================================
// === API.JS — РАБОТА С AI (Mistral) И RENDER СЕРВЕРОМ ===
// =====================================================================

// Извлечение текста из кавычек (для ИИ)
window.extractQuotedText = function(text) {
    const regex = /"([^"]*)"/g;
    const matches = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
        matches.push(match[1]);
    }
    return matches;
};

// ✅ Генерация всех возможных комбинаций
window.generateAllCombinations = function(options) {
    const allCombinations = [];
    
    for (const opt of options) {
        allCombinations.push([opt]);
    }
    
    for (let i = 0; i < options.length; i++) {
        for (let j = i + 1; j < options.length; j++) {
            allCombinations.push([options[i], options[j]]);
        }
    }
    
    if (options.length >= 3) {
        for (let i = 0; i < options.length; i++) {
            for (let j = i + 1; j < options.length; j++) {
                for (let k = j + 1; k < options.length; k++) {
                    allCombinations.push([options[i], options[j], options[k]]);
                }
            }
        }
    }
    
    if (options.length >= 4) {
        allCombinations.push([...options]);
    }
    
    return allCombinations;
};

// ✅ Поиск свободной комбинации
window.findFreeCombination = function(options, incorrectCombinations) {
    const allCombinations = window.generateAllCombinations(options);
    
    const forbiddenSets = incorrectCombinations.map(comb => 
        comb.map(ans => window.normalizeText(ans)).sort().join('|')
    );
    
    const freeCombinations = allCombinations.filter(comb => {
        const normalizedComb = comb.map(ans => window.normalizeText(ans)).sort().join('|');
        return !forbiddenSets.includes(normalizedComb);
    });
    
    window.sendLogToBackground(`🔢 Всего комбинаций: ${allCombinations.length}, Запрещено: ${forbiddenSets.length}, Свободно: ${freeCombinations.length}`);
    
    if (freeCombinations.length > 0) {
        const randomIndex = Math.floor(Math.random() * freeCombinations.length);
        window.sendLogToBackground(`🎲 Выбрана комбинация #${randomIndex + 1} из свободных`);
        return freeCombinations[randomIndex];
    }
    
    return [];
};

// =====================================================================
// === ЗАПРОС К ИИ С РЕЗЕРВНЫМ ПЛАНОМ ===
// =====================================================================
window.askAIWithIncorrectCombinations = async function(question, options, isMultipleChoice, incorrectCombinations = []) {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1500;
    let systemMessage;
    let userMessageBase;
    
    const optionsList = options.map((opt, index) => `[${index + 1}] ${opt}`).join('\n');
    
    systemMessage = `Ты — медицинский эксперт-экзаменатор. Твоя ЕДИНСТВЕННАЯ задача: выбрать правильные варианты ответов ИЗ ПРЕДЛОЖЕННОГО СПИСКА.
🔒 КРИТИЧЕСКИЕ ПРАВИЛА:
ОТВЕЧАЙ ТОЛЬКО полным текстом вариантов КАК ОНИ НАПИСАНЫ в списке.
⛔ ЗАПРЕЩЕНО возвращать "вариант 1", "вариант 2", "[1]", "[2]" или любые номера.
Формат ответа: ТОЛЬКО валидный JSON-массив строк. БЕЗ пояснений.`;

    userMessageBase = `ВОПРОС: ${question}
📋 ДОСТУПНЫЕ ВАРИАНТЫ:
${optionsList}
🎯 ТИП ВОПРОСА: ${isMultipleChoice ? 'НЕСКОЛЬКО' : 'ОДИН'}`;
    
    if (incorrectCombinations.length > 0) {
        userMessageBase += `\n\n⛔ ЗАПРЕЩЁННЫЕ КОМБИНАЦИИ:`;
        incorrectCombinations.slice(0, 10).forEach((comb, idx) => {
            userMessageBase += `\n${idx + 1}. [${comb.join(', ')}]`;
        });
    }
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const currentTemperature = attempt === 1 ? 0.1 : 0.7;
            
            window.sendLogToBackground(`🤖 Запрос к ИИ (попытка ${attempt}/${MAX_RETRIES})...`);
            
            const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer vIbfcVlLsLylHUHN19BiZUyc6amzLSVE",
                },
                body: JSON.stringify({
                    model: "mistral-small-latest",
                    messages: [
                        { role: "system", content: systemMessage },
                        { role: "user", content: userMessageBase }
                    ],
                    temperature: currentTemperature,
                    top_p: 0.9,
                    max_tokens: 512,
                    response_format: { type: "json_object" }
                })
            });
            
            if (!response.ok) {
                if ([503, 429, 500, 502, 504].includes(response.status)) {
                    if (attempt < MAX_RETRIES) {
                        await new Promise(r => setTimeout(r, RETRY_DELAY));
                        continue;
                    }
                }
                throw new Error(`API error: ${response.status}`);
            }
            
            const data = await response.json();
            const aiResponseRaw = data.choices?.[0]?.message?.content?.trim();
            
            if (!aiResponseRaw) throw new Error("Пустой ответ от ИИ");
            
            let aiVariants = [];
            try {
                const cleaned = aiResponseRaw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
                aiVariants = JSON.parse(cleaned);
                if (!Array.isArray(aiVariants)) throw new Error("Не массив");
                
                aiVariants = aiVariants.map(v => {
                    if (typeof v === 'string') {
                        return v.replace(/^["']|["']$/g, '').trim();
                    }
                    return v;
                }).filter(v => v && typeof v === 'string');
                
            } catch (parseError) {
                aiVariants = window.extractQuotedText(aiResponseRaw);
            }
            
            if (aiVariants.length === 0) throw new Error("Пустой результат");
            
            const matchedOptions = [];
            for (const aiVariant of aiVariants) {
                const normalizedAi = window.normalizeText(aiVariant);
                const foundOriginal = options.find(opt => 
                    opt === aiVariant || window.normalizeText(opt) === normalizedAi
                );
                if (foundOriginal) {
                    matchedOptions.push(foundOriginal);
                }
            }
            
            if (matchedOptions.length === 0) throw new Error("Нет совпадений со страницей");
            
            window.sendLogToBackground(`✅ Успех: [${matchedOptions.join('; ')}]`);
            return matchedOptions;
            
        } catch (error) {
            window.sendLogToBackground(`💥 Попытка ${attempt} неудачна: ${error.message}`);
            if (attempt === MAX_RETRIES) break;
        }
    }
    
    window.sendLogToBackground("🛡️ АКТИВАЦИЯ РЕЗЕРВНОГО ПЛАНА...");
    const freeCombination = window.findFreeCombination(options, incorrectCombinations);
    
    if (freeCombination && freeCombination.length > 0) {
        window.sendLogToBackground(`🎲 Резервный выбор: [${freeCombination.join('; ')}]`);
        return freeCombination;
    }
    
    return [];
};

window.askAI = async function(question, options, isMultipleChoice) {
    return await window.askAIWithIncorrectCombinations(question, options, isMultipleChoice, []);
};

// =====================================================================
// === ЗАПРОС К RENDER СЕРВЕРУ (старый API) ===
// =====================================================================
window.fetchAnswers = async function(question) {
    if (window.isStopped) return [];
    
    try {
        window.setLoadingIndicator(true);
        const response = await fetch(encodeURI(`https://new-8peq.onrender.com/api/test?quest=${question}`), {
            signal: window.abortController.signal,
        });
        
        if (window.isStopped) return [];
        if (!response.ok) throw new Error(`Server error: ${response.status}`);
        
        const data = await response.json();
        if (!Array.isArray(data.correct_options) || !data.correct_options.length) {
            window.setLoadingIndicator(true, false, 'Нет ответов');
            return [];
        }
        return data.correct_options;
    } catch (error) {
        if (error.name !== 'AbortError') {
            window.sendLogToBackground("Ошибка запроса:", error.message);
        }
        return [];
    } finally {
        window.setLoadingIndicator(false);
    }
};

// =====================================================================
// === РАБОТА С SUPABASE (ОБЩАЯ БАЗА) — ЧЕРЕЗ RENDER BACKEND ===
// =====================================================================
window.fetchAnswersFromSupabase = async function(question) {
    if (!window.fetchAnswersFromServer) {
        window.sendLogToBackground?.('⚠️ fetchAnswersFromServer не инициализирован');
        return [];
    }
    try {
        return await window.fetchAnswersFromServer(question);
    } catch (error) {
        window.sendLogToBackground?.(`⚠️ Ошибка поиска в Supabase: ${error.message}`);
        return [];
    }
};

window.saveAnswerToSupabase = async function(question, answers, isCorrect = null) {
    if (window.currentMode !== 'auto_ai') {
        window.sendLogToBackground?.(`ℹ️ Пропуск сохранения в Supabase (режим: ${window.currentMode})`);
        return false;
    }
    
    if (!window.saveAnswerToServer) {
        window.sendLogToBackground?.('⚠️ saveAnswerToServer не инициализирован');
        return false;
    }
    
    if (!answers || answers.length === 0) return false;
    
    try {
        return await window.saveAnswerToServer(question, answers, isCorrect);
    } catch (error) {
        window.sendLogToBackground?.(`❌ Ошибка сохранения в Supabase: ${error.message}`);
        return false;
    }
};

// =====================================================================
// === УНИВЕРСАЛЬНЫЙ ПОИСК ===
// =====================================================================
window.fetchAnswersUniversal = async function(question) {
    if (window.isStopped) return [];
    
    window.sendLogToBackground?.(`\n🔍 === УНИВЕРСАЛЬНЫЙ ПОИСК ===`);
    
    window.sendLogToBackground?.(`1️⃣ Поиск в общей базе Supabase...`);
    let answers = await window.fetchAnswersFromSupabase(question);
    if (answers && answers.length > 0) {
        window.sendLogToBackground?.(`✅ Найдено в Supabase: ${answers.length} ответов`);
        return answers;
    }
    
    window.sendLogToBackground?.(`2️⃣ Поиск в Render API...`);
    answers = await window.fetchAnswers(question);
    if (answers && answers.length > 0) {
        window.sendLogToBackground?.(`✅ Найдено в Render: ${answers.length} ответов`);
        if (window.currentMode === 'auto_ai') {
            await window.saveAnswerToSupabase(question, answers, null);
        }
        return answers;
    }
    
    window.sendLogToBackground?.(`❌ Ничего не найдено в базах`);
    return [];
};