// server/server.js
require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors({
    origin: ['chrome-extension://*', 'https://edu.rosminzdrav.ru'],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'X-API-Key']
}));
app.use(express.json());

// ✅ Supabase клиент (service_role ТОЛЬКО на сервере!)
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// ✅ Простая авторизация по API ключу
const validateApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(403).json({ error: 'Неверный API ключ' });
    }
    next();
};

// =====================================================================
// === GET: Поиск ответов (публичный, без API ключа) ===
// =====================================================================
app.get('/api/answers', async (req, res) => {
    try {
        const { question } = req.query;
        if (!question) return res.status(400).json({ error: 'Вопрос не указан' });

        const questionHash = crypto.createHash('md5').update(question.trim()).digest('hex');

        const { data: records, error } = await supabase
            .from('questions')
            .select('*')
            .eq('question_hash', questionHash)
            .order('votes', { ascending: false })
            .limit(10);

        if (error) throw error;

        res.json({
            success: true,
            count: records?.length || 0,
            data: records || []
        });
    } catch (error) {
        console.error('Ошибка поиска:', error);
        res.status(500).json({ error: 'Ошибка сервера', message: error.message });
    }
});

// =====================================================================
// === POST: Сохранение ответа (требует API ключ) ===
// =====================================================================
app.post('/api/answers', validateApiKey, async (req, res) => {
    try {
        const { question, answers, isCorrect } = req.body;
        
        if (!question || !answers || !Array.isArray(answers)) {
            return res.status(400).json({ error: 'Вопрос и ответы обязательны' });
        }

        const questionHash = crypto.createHash('md5').update(question.trim()).digest('hex');
        const normalizedAnswers = answers.map(a => a.trim()).sort();

        // Проверка на дубликат
        const { data: existing } = await supabase
            .from('questions')
            .select('*')
            .eq('question_hash', questionHash)
            .eq('answers', `{${normalizedAnswers.join(',')}}`)
            .maybeSingle();

        if (existing) {
            // Обновление существующей записи
            if (isCorrect !== null && existing.is_correct !== isCorrect) {
                const { data: updated } = await supabase
                    .from('questions')
                    .update({
                        is_correct: isCorrect,
                        votes: (existing.votes || 0) + 1,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', existing.id)
                    .select()
                    .single();
                
                res.json({ success: true, message: 'Обновлено', data: updated });
            } else {
                res.json({ success: true, message: 'Уже существует', data: existing });
            }
        } else {
            // Создание новой записи
            const { data: created } = await supabase
                .from('questions')
                .insert({
                    question_hash: questionHash,
                    question: question.trim(),
                    answers: normalizedAnswers,
                    is_correct: isCorrect || null,
                    votes: isCorrect === true ? 1 : 0,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .select()
                .single();
            
            res.json({ success: true, message: 'Создано', data: created });
        }
    } catch (error) {
        console.error('Ошибка сохранения:', error);
        res.status(500).json({ error: 'Ошибка сервера', message: error.message });
    }
});

// =====================================================================
// === Health Check ===
// =====================================================================
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// =====================================================================
// === Старт сервера ===
// =====================================================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
});