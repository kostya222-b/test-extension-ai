// server/server.js
require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 10000;

// ✅ CORS настройка
app.use(cors({
    origin: function(origin, callback) {
        if (!origin) return callback(null, true);
        if (origin.includes('edu.rosminzdrav.ru')) return callback(null, true);
        if (origin.startsWith('chrome-extension://')) return callback(null, true);
        if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) return callback(null, true);
        if (origin.includes('onrender.com')) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'X-API-Key', 'Authorization'],
    credentials: false
}));

app.options('*', cors());
app.use(express.json({ limit: '10mb' }));

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const validateApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(403).json({ error: 'Неверный API ключ' });
    }
    next();
};

// =====================================================================
// === GET: Поиск ответов ===
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
            .limit(50);

        if (error) throw error;

        res.json({
            success: true,
            count: records?.length || 0,
            data: records || []
        });
    } catch (error) {
        console.error('GET error:', error);
        res.status(500).json({ error: 'Ошибка сервера', message: error.message });
    }
});

// =====================================================================
// === POST: Сохранение ответа (ИСПРАВЛЕНО - ЗАЩИТА ОТ ДУБЛЕЙ) ===
// =====================================================================
app.post('/api/answers', validateApiKey, async (req, res) => {
    try {
        const { question, answers, isCorrect } = req.body;

        if (!question || !answers || !Array.isArray(answers)) {
            return res.status(400).json({ error: 'Вопрос и ответы обязательны' });
        }

        const questionHash = crypto.createHash('md5').update(question.trim()).digest('hex');
        // Нормализуем ответы: сортируем и убираем лишние пробелы для надежного сравнения
        const normalizedAnswers = answers.map(a => a.trim()).sort();
        const answersString = `{${normalizedAnswers.join(',')}}`;

        // 1. ПРОВЕРЯЕМ: Существует ли уже ТАКАЯ ЖЕ комбинация ответов для этого вопроса?
        const { data: existing } = await supabase
            .from('questions')
            .select('id, is_correct, votes')
            .eq('question_hash', questionHash)
            .eq('answers', answersString)
            .maybeSingle();

        if (existing) {
            // ЗАПИСЬ УЖЕ ЕСТЬ!
            
            // Если пришедший статус isCorrect = true, а в базе false/null -> ОБНОВЛЯЕМ на true
            if (isCorrect === true && existing.is_correct !== true) {
                const { data: updated } = await supabase
                    .from('questions')
                    .update({
                        is_correct: true,
                        votes: (existing.votes || 0) + 1,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', existing.id)
                    .select()
                    .single();
                
                return res.json({ 
                    success: true, 
                    message: 'Обновлено на верное', 
                    action: 'updated_to_correct',
                    data: updated 
                });
            }

            // Если статус такой же или хуже (например, прислали null, а там уже true) -> НИЧЕГО НЕ ДЕЛАЕМ
            // Просто возвращаем существующую запись, чтобы клиент знал, что она есть.
            return res.json({ 
                success: true, 
                message: 'Уже существует', 
                action: 'exists_no_change',
                data: existing 
            });
        }

        // 2. ЕСЛИ ЗАПИСИ НЕТ -> СОЗДАЕМ НОВУЮ
        const { data: created, error } = await supabase
            .from('questions')
            .insert({
                question_hash: questionHash,
                question: question.trim(),
                answers: normalizedAnswers, // Сохраняем отсортированный массив
                is_correct: isCorrect || null,
                votes: isCorrect === true ? 1 : 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;

        res.json({ 
            success: true, 
            message: 'Создано', 
            action: 'created',
            data: created 
        });

    } catch (error) {
        console.error('POST error:', error);
        res.status(500).json({ error: 'Ошибка сервера', message: error.message });
    }
});

// =====================================================================
// === PATCH: Обновление статуса ответа ===
// =====================================================================
app.patch('/api/answers/:id', validateApiKey, async (req, res) => {
    try {
        const { id } = req.params;
        const { isCorrect, votes } = req.body;

        if (isCorrect === undefined && votes === undefined) {
            return res.status(400).json({ error: 'Необходимо указать isCorrect или votes' });
        }

        const updateData = {};
        if (isCorrect !== undefined) updateData.is_correct = isCorrect;
        if (votes !== undefined) updateData.votes = votes;
        updateData.updated_at = new Date().toISOString();

        // Если обновляем на TRUE, сбрасываем счетчик ошибок или увеличиваем голоса
        if (isCorrect === true) {
             // Опционально: можно добавить логику повышения рейтинга
        }

        const { data: updated, error } = await supabase
            .from('questions')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, message: 'Обновлено', data: updated });
    } catch (error) {
        console.error('PATCH error:', error);
        res.status(500).json({ error: 'Ошибка сервера', message: error.message });
    }
});

// =====================================================================
// === Health Check ===
// =====================================================================
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
});