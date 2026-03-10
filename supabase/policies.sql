-- supabase/policies.sql
-- =====================================================================
-- === RLS ПОЛИТИКИ ДЛЯ ТАБЛИЦЫ questions ===
-- =====================================================================

-- ✅ Включаем Row Level Security для таблицы questions
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

-- 🔓 Политика ЧТЕНИЯ: все могут читать (анонимно)
DROP POLICY IF EXISTS "Allow public read" ON questions;
CREATE POLICY "Allow public read" ON questions
FOR SELECT 
USING (true);

-- ✍️ Политика ЗАПИСИ: все могут создавать (с валидацией)
DROP POLICY IF EXISTS "Allow public insert" ON questions;
CREATE POLICY "Allow public insert" ON questions
FOR INSERT 
WITH CHECK (
    question IS NOT NULL AND 
    question != '' AND
    answers IS NOT NULL AND
    json_array_length(answers) > 0
);

-- ✏️ Политика ОБНОВЛЕНИЯ: все могут обновлять (для будущего)
DROP POLICY IF EXISTS "Allow public update" ON questions;
CREATE POLICY "Allow public update" ON questions
FOR UPDATE 
USING (true);

-- 🗑️ Политика УДАЛЕНИЯ: только владелец (опционально, можно убрать)
-- DROP POLICY IF EXISTS "Allow owner delete" ON questions;
-- CREATE POLICY "Allow owner delete" ON questions
-- FOR DELETE 
-- USING (auth.uid() = owner_id);

-- ✅ Проверка: выводим созданные политики
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'questions';