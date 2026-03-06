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
    origin: ['chrome-extension://*', 'https://edu.rosminzdrav.ru', 'http://localhost:*'],
    methods: ['GET', 'POST', 'PUT'],
    allowedHeaders: ['Content-Type', 'X-API-Key']
}));
app.use(express.json());

// ✅ Supabase клиент (service_role key ТОЛЬКО на сервере!)
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
        if (!question) {
            return res.status(400).json({ error: 'Вопрос не указан' });
        }

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
        const { data: existing, error: findError } = await supabase
            .from('questions')
            .select('*')
            .eq('question_hash', questionHash)
            .eq('answers', `{${normalizedAnswers.join(',')}}`)
            .maybeSingle();

        if (findError) throw findError;

        if (existing) {
            // Обновление существующей записи
            if (isCorrect !== null && existing.is_correct !== isCorrect) {
                const { data: updated, error: updateError } = await supabase
                    .from('questions')
                    .update({
                        is_correct: isCorrect,
                        votes: (existing.votes || 0) + 1,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', existing.id)
                    .select()
                    .single();
                
                if (updateError) throw updateError;
                res.json({ success: true, message: 'Обновлено', data: updated });
            } else {
                res.json({ success: true, message: 'Уже существует', data: existing });
            }
        } else {
            // Создание новой записи
            const { data: created, error: createError } = await supabase
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
            
            if (createError) throw createError;
            res.json({ success: true, message: 'Создано', data: created });
        }
    } catch (error) {
        console.error('Ошибка сохранения:', error);
        res.status(500).json({ error: 'Ошибка сервера', message: error.message });
    }
});

// =====================================================================
// === GET: Статистика ===
// =====================================================================
app.get('/api/stats', async (req, res) => {
    try {
        const { count: total } = await supabase.from('questions').select('*', { count: 'exact', head: true });
        const { count: correct } = await supabase.from('questions').select('*', { count: 'exact', head: true }).eq('is_correct', true);
        const { count: incorrect } = await supabase.from('questions').select('*', { count: 'exact', head: true }).eq('is_correct', false);
        const { count: unknown } = await supabase.from('questions').select('*', { count: 'exact', head: true }).is('is_correct', null);

        res.json({
            success: true,
            stats: { total, correct, incorrect, unknown }
        });
    } catch (error) {
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
    console.log(`📍 URL: https://your-app.onrender.com`);
});