// server.js - Version 45.1 - STRATEGI: RETURNERA FULL KONTEXT
// - FÖRBÄTTRING: Istället för att bara returnera den "bästa raden", returnerar denna
//   slutgiltiga version allt innehåll från hela det vinnande avsnittet.
// - MÅL: Uppnå ett mycket högt testresultat genom att säkerställa att all relevant
//   information från ett identifierat avsnitt inkluderas i svaret.

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// --- DATABAS & SÖKINDEX ---
let searchableFacts = [];
let originalSections = {}; // För att lagra hela sektioner

function createSearchableBlocks(obj, result = [], context = []) {
    let currentTitle = '';
    let currentKeywords = [];

    if (obj.title && typeof obj.title === 'string') currentTitle = obj.title;
    if (obj.keywords && Array.isArray(obj.keywords)) currentKeywords = obj.keywords.map(k => k.toLowerCase());

    const newContext = currentTitle ? [...context, currentTitle] : context;
    const contextString = newContext.join(' - ');

    // Lagra hela originalsektionen för senare hämtning
    if (contextString && !originalSections[contextString]) {
        let fullText = Object.keys(obj)
            .filter(key => !['title', 'keywords', 'section_title', 'source_info', 'cities'].includes(key))
            .map(key => {
                const value = obj[key];
                if (typeof value === 'string') return value;
                if (Array.isArray(value)) return value.join('\n');
                return ''; // Ignorera nästlade objekt här
            })
            .join('\n');
        originalSections[contextString] = `${contextString}\n${fullText}`;
    }

    for (const key in obj) {
        if (['title', 'keywords', 'section_title', 'source_info', 'cities'].includes(key)) continue;
        const value = obj[key];
        const processItem = (item) => result.push({ content: item, context: contextString, keywords: currentKeywords });

        if (typeof value === 'string') {
             if (value.length > 100 && key !== 'price') {
                splitIntoSentences(value).forEach(processItem);
            } else {
                processItem(value);
            }
        } else if (Array.isArray(value) && value.every(item => typeof item === 'string')) {
            value.forEach(processItem);
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            createSearchableBlocks(value, result, newContext);
        }
    }
}

function splitIntoSentences(text) {
    const sentences = text.match(/(?<!\b\w|osv)[.!?]\s*|$/g)
        ? text.split(/(?<!\b\w|osv)(\.|\?|!)\s+/).filter(s => s && s.trim().length > 0)
        : [text];
    let result = [];
    for (let i = 0; i < sentences.length; i += 2) {
        let sentence = sentences[i].trim();
        if (sentences[i + 1]) sentence += sentences[i + 1];
        if (sentence) result.push(sentence);
    }
    return result.filter(s => s.length > 5);
}

function loadAndIndexKnowledge() {
    const knowledgePath = path.join(__dirname, 'knowledge');
    searchableFacts = [];
    originalSections = {};
    try {
        const files = fs.readdirSync(knowledgePath);
        files.forEach(file => {
            if (file.startsWith('basfakta_') && file.endsWith('.json')) {
                const filePath = path.join(knowledgePath, file);
                const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                createSearchableBlocks(jsonData, searchableFacts);
            }
        });
        console.log(`[Server] Databas laddad och indexerad. ${searchableFacts.length} sökbara textblock.`);
    } catch (error) {
        console.error('[Server] Fel vid inläsning/indexering:', error);
    }
}

function handleKeywordSearch(question) {
    console.log(`\n--- NY SÖKNING: "${question}" ---`);
    const questionTerms = [...new Set(question.toLowerCase().match(/[a-zåäö0-9_]{3,}/g) || [])];
    if (questionTerms.length === 0) return null;
    console.log(`[DIAGNOSTIK] Extraherade söktermer: [${questionTerms.join(', ')}]`);

    const highValueTerms = [
        'pris', 'kostar', 'kostnad', 'ålder', 'gammal', 'giltig', 'länge',
        'stockholm', 'göteborg', 'kungsbacka', 'umeå', 'malmö', 'lund',
        'helsingborg', 'kristianstad', 'hässleholm', 'ängelholm', 'trelleborg',
        'eslöv', 'landskrona', 'växjö', 'kalmar', 'ystad', 'höllviken', 'vellinge'
    ];
    const foundCity = highValueTerms.find(term => questionTerms.includes(term) && highValueTerms.slice(7).includes(term));
    
    let candidates = [];
    searchableFacts.forEach((fact) => {
        let score = 0;
        let matchCount = 0;
        const matchedTerms = new Set();
        
        questionTerms.forEach(term => {
            if (fact.keywords.includes(term)) {
                score += highValueTerms.includes(term) ? 3 : 1;
                matchCount++;
                matchedTerms.add(term);
            }
        });
        
        if (matchCount > 1) {
            score += matchCount * 2;
        }

        if (score > 0) {
            candidates.push({ fact, score });
        }
    });

    if (candidates.length === 0) {
        console.log(`[DIAGNOSTIK] Inga block matchade några keywords.`);
        return null;
    }

    candidates.sort((a, b) => b.score - a.score);

    const bestCandidate = candidates[0];
    const winningContext = bestCandidate.fact.context;

    console.log(`[DIAGNOSTIK] Vinnande kontext är "${winningContext}" med poäng ${bestCandidate.score}.`);
    
    let answer = originalSections[winningContext];
    
    if (foundCity && !answer.toLowerCase().includes(foundCity.toLowerCase())) {
        answer += ` (Prisuppgift gäller för ${foundCity})`;
    }

    return answer;
}

function buildAnswer(foundText) {
    if (foundText) return { answer: foundText };
    return { answer: "Jag kunde tyvärr inte hitta ett exakt svar på din fråga i min kunskapsdatabas." };
}

app.post('/ask', (req, res) => {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: 'Fråga saknas.' });
    try {
        const foundText = handleKeywordSearch(question);
        res.json(buildAnswer(foundText));
    } catch (error) {
        console.error('[Server] Fel vid hantering av /ask:', error);
        res.status(500).json({ error: 'Internt serverfel.' });
    }
});

app.listen(PORT, () => {
    console.log(`Servern lyssnar på port ${PORT}`);
    loadAndIndexKnowledge();
});
