/**
 * AIlogic.js
 * Двухэтапная генерация сайта (Оптимизация промпта -> Генерация HTML, CSS, JS)
 */

// Укажите ваш URL Cloudflare Worker
const WORKER_URL = "https://groq-proxy-assistant.matvey-bogdanchik10.workers.dev"; // <-- ЗАМЕНИТЕ НА ВАШ URL

// Минимальное количество слов для отправки
const MIN_WORDS_COUNT = 5;

function cleanCode(str) {
    if (!str) return '';
    return str
        .replace(/^```(json|html|css|javascript|js)?/gi, '')
        .replace(/```$/gi, '')
        .trim();
}

/**
 * Подсчет слов в строке
 */
function countWords(str) {
    return str.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Основная функция генерации
 */
window.generateWebsite = async function (userPrompt, onStatusChange) {
    const wordCount = countWords(userPrompt);

    if (wordCount < MIN_WORDS_COUNT) {
        return {
            success: false,
            error: `Слишком короткий запрос. Введите минимум ${MIN_WORDS_COUNT} слова.`
        };
    }

    try {
        // ----------------------------------------------------
        // ЭТАП 1: Создание детального UI/UX Технического Задания
        // ----------------------------------------------------
        if (onStatusChange) onStatusChange("Анализ запроса и проектирование UI/UX...");

        const step1Response = await fetch(WORKER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "openai/gpt-oss-20b",
                messages: [
                    {
                        role: "system",
                        content: "Ты — Senior Prompt Engineer и Lead UI/UX Designer. Преобразуй запрос пользователя в лаконичное ТЗ для верстки (до 200 слов). Опиши: 1) Структуру блоков (header, hero, features, footer). 2) Современную цветовую палитру и стиль. 3) Интерактивные элементы и поведение JS."
                    },
                    {
                        role: "user",
                        content: userPrompt
                    }
                ],
                temperature: 0.5,
                max_completion_tokens: 600
            })
        });

        if (!step1Response.ok) {
            const errData = await step1Response.json().catch(() => ({}));
            const msg = errData.error?.message || `Код ошибки: ${step1Response.status}`;
            throw new Error(`Ошибка на этапе проектирования: ${msg}`);
        }

        const step1Data = await step1Response.json();
        const refinedPrompt = cleanCode(step1Data.choices?.[0]?.message?.content);

        if (!refinedPrompt) {
            throw new Error("Не удалось сформулировать ТЗ.");
        }

        // ----------------------------------------------------
        // ЭТАП 2: Генерация современно сверстанного кода (HTML, CSS, JS)
        // ----------------------------------------------------
        if (onStatusChange) onStatusChange("Генерация HTML, CSS и JS...");

        const safePrompt = refinedPrompt.length > 3000 ? refinedPrompt.slice(0, 3000) : refinedPrompt;

        const step2Response = await fetch(WORKER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "openai/gpt-oss-120b",
                response_format: { type: "json_object" },
                messages: [
                    {
                        role: "system",
                        content: `Ты — Senior Frontend Developer & UI/UX Expert. Напиши современный, премиальный и адаптивный сайт по ТЗ.

СТРОГИЕ ТРЕБОВАНИЯ К КОДУ:
1. HTML: Семантический код без inline-стилей. Если нужны иконки, используй теги Lucide Icons: <i data-lucide="имя-иконки"></i>.
2. CSS: Используй CSS-переменные (:root), Flexbox/Grid, медиазапросы для мобильных устройств, стильные hover-эффекты, мягкие тени и плавные transitions.
3. JS: Добавь полноценную интерактивность (работа кнопок, модальные окна, анимации или мобильное меню). Если использовал иконки, обязательно добавь инициализацию: lucide.createIcons();

Верни результат СТРОГО в виде валидного JSON-объекта без Markdown:
{
  "html": "код внутри body",
  "css": "стили CSS",
  "javascript": "скрипт JS"
}`
                    },
                    {
                        role: "user",
                        content: safePrompt
                    }
                ],
                temperature: 0.3,
                max_completion_tokens: 4000
            })
        });

        if (!step2Response.ok) {
            const errData = await step2Response.json().catch(() => ({}));
            const msg = errData.error?.message || `Код ошибки: ${step2Response.status}`;
            throw new Error(`Ошибка на этапе генерации кода: ${msg}`);
        }

        const step2Data = await step2Response.json();
        let rawContent = step2Data.choices?.[0]?.message?.content || "";

        let parsedCode = { html: "", css: "", javascript: "" };

        // 1. Попытка стандартного JSON.parse
        try {
            // Очищаем от возможных Markdown-оберток ```json
            const cleanedRaw = rawContent
                .replace(/^```(json)?/gi, '')
                .replace(/```$/gi, '')
                .trim();

            parsedCode = JSON.parse(cleanedRaw);
        } catch (e) {
            console.warn("Стандартный JSON.parse не справился, включаем аварийный извлекатель...", e);

            // 2. Аварийное извлечение регулярными выражениями, если JSON "сломан"
            const extractKey = (keyName) => {
                const regex = new RegExp(`"${keyName}"\\s*:\\s*"([\\s\\S]*?)"(?=\\s*,\\s*"|\\s*\\})`, 'i');
                const match = rawContent.match(regex);
                if (match && match[1]) {
                    return match[1]
                        .replace(/\\n/g, '\n')
                        .replace(/\\"/g, '"')
                        .replace(/\\\\/g, '\\');
                }
                return '';
            };

            parsedCode.html = extractKey('html');
            parsedCode.css = extractKey('css');
            parsedCode.javascript = extractKey('javascript') || extractKey('js');

            // Если даже регулярки ничего не нашли, отдаем весь ответ в HTML
            if (!parsedCode.html && !parsedCode.css && !parsedCode.javascript) {
                parsedCode.html = rawContent;
            }
        }

        return {
            success: true,
            refinedPrompt: refinedPrompt,
            html: cleanCode(parsedCode.html),
            css: cleanCode(parsedCode.css),
            js: cleanCode(parsedCode.javascript || parsedCode.js)
        };

    } catch (error) {
        console.error("AI Generation Error:", error);
        return {
            success: false,
            error: error.message || "Ошибка соединения."
        };
    }
};
