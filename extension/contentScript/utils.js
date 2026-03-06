// Логирование сообщений в background.js
window.sendLogToBackground = function(...args) {
    chrome.runtime.sendMessage({ action: "log", args: args });
};

// Нормализация текста вопроса
window.normalizeQuestionText = function(text) {
    return text
        .replace(/[‐‑‒–—―−-─]/g, '-')
        .replace(/≤/g, '<')
        .replace(/≥/g, '>')
        .replace(/[\u00A0\u2000-\u200D\u202F\u205F\u3000]/g, ' ')
        .replace(/[«»„""″]/g, '"')
        .replace(/[''‚‹›′`ʹ]/g, "'")
        .replace(/\p{Cf}/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
};

//  УЛУЧШЕННАЯ нормализация ответа для сравнения
// Удаляет лишние пробелы, приводит к нижнему регистру, убирает пунктуацию в конце
window.normalizeText = function(text) {
    if (!text) return '';
    
    const replaceMap = {
        'a': 'а', 'b': 'в', 'c': 'с', 'e': 'е', 'o': 'о', 'p': 'р', 'x': 'х',
        'A': 'А', 'B': 'В', 'C': 'С', 'E': 'Е', 'O': 'О', 'P': 'Р', 'X': 'Х',
        'k': 'к', 'm': 'м', 'h': 'н', 't': 'т', 'y': 'у',
        'K': 'K', 'M': 'М', 'H': 'Н', 'T': 'Т', 'Y': 'У',
    };

    let normalized = text
        .replace(/[a-zA-Z]/g, char => replaceMap[char] || char)
        .replace(/[‐‑‒–—―−─]/g, '-')
        .replace(/[а-яА-Я]/g, char => Object.entries(replaceMap).find(([k, v]) => v === char)?.[0] || char)
        .toLowerCase()
        .replace(/[^\w\s-]/g, '') // Удаляем всю пунктуацию кроме букв, цифр и дефиса
        .replace(/\s+/g, ' ')     // Заменяем множественные пробелы на один
        .trim();

    return normalized;
};

// Получение случайной задержки
window.getRandomDelay = function(min, max) {
    return window.isStopped ? 0 : Math.floor(Math.random() * (max - min + 1) + min);
};