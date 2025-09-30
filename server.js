// server.js - Version 34.7 - NY STRATEGI: BALANSERAD RELEVANSSÖKNING
// - JUSTERING: En balanserad 'threshold' (0.4) och finjusterade Fuse.js-parametrar.
// - MÅL: Denna version är designad för att vara "lagom" strikt och förlitar sig på
//   den kraftfulla kombinationen av viktade keywords och fokuserade textblock för att
//   hitta det mest relevanta svaret utan att filtrera bort för många bra resultat.

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const Fuse = require('fuse.js');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// --- DATABAS & SÖKINDEX ---
let searchableFacts = [];
let fuse;

// Funktion för att skapa fokuserade, sökbara textblock med ärvd kontext
function createSearchableBlocks(obj, result = [], context = []) {
    let currentTitle = '';
    let currentKeywords = [];

    if (obj.title && typeof obj.title === 'string') {
        currentTitle = obj.title;
    }
    if (obj.keywords && Array.isArray(obj.keywords)) {
        currentKeywords = obj.keywords;
    }

    const newContext = currentTitle ? [...context, currentTitle] : context;

    for (const key in obj) {
        if (key === 'title' || key === 'keywords' || key === 'section_title' || key === 'source_info') {
            continue;
        }

        const value = obj[key];

        if (typeof value === 'string') {
            const combinedText = newContext.join(' - ') + '\n' + value;
            result.push({ text: combinedText.trim(), keywords: currentKeywords });
        } else if (Array.isArray(value) && value.every(item => typeof item === 'string')) {
            const combinedText = newContext.join(' - ') + '\n' + value.join('\n');
            result.push({ text: combinedText.trim(), keywords: currentKeywords });
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            createSearchableBlocks(value, result, newContext);
        }
    }
}

function loadAndIndexKnowledge() {
    const knowledgePath = path.join(__dirname, 'knowledge');
    searchableFacts = []; // Nollställ databasen
    try {
        const files = fs.readdirSync(knowledgePath);
        files.forEach(file => {
            if (file.startsWith('basfakta_') && file.endsWith('.json')) {
                const filePath = path.join(knowledgePath, file);
                const rawData = fs.readFileSync(filePath, 'utf8');
                const jsonData = JSON.parse(rawData);
                createSearchableBlocks(jsonData, searchableFacts);
            }
        });

        const options = {
            includeScore: true,
            minMatchCharLength: 4,
            threshold: 0.4, // Balanserad strikthet
            ignoreLocation: true,
            keys: [
                { name: 'keywords', weight: 0.3 },
                { name: 'text', weight: 0.7 }
            ]
        };
        fuse = new Fuse(searchableFacts, options);

        console.log(`[Server] Databas laddad och indexerad. Totalt ${searchableFacts.length} sökbara textblock.`);

    } catch (error) {
        console.error('[Server] Ett allvarligt fel inträffade vid inläsning/indexering:', error);
    }
}

function handleFuzzySearch(question) {
    if (!fuse) {
        console.error("[Server] Fuse.js index är inte tillgängligt.");
        return null;
    }

    const results = fuse.search(question);

    if (results.length > 0) {
        console.log(`[Server] Sökning för "${question}" gav träff med poäng ${results[0].score}.`);
        return results[0].item.text;
    }

    console.log(`[Server] Ingen träff för frågan: "${question}"`);
    return null;
}

function buildAnswer(foundText) {
    if (foundText) {
        return { answer: foundText };
    }
    return { answer: "Jag kunde tyvärr inte hitta ett exakt svar på din fråga i min kunskapsdatabas." };
}

app.post('/ask', (req, res) => {
    const { question } = req.body;
    if (!question) {
        return res.status(400).json({ error: 'Fråga saknas i anropet.' });
    }
    try {
        const foundText = handleFuzzySearch(question);
        const response = buildAnswer(foundText);
        res.json(response);
    } catch (error) {
        console.error('[Server] Fel vid hantering av /ask-request:', error);
        res.status(500).json({ error: 'Ett internt serverfel inträffade.' });
    }
});

app.listen(PORT, () => {
    console.log(`Servern lyssnar på port ${PORT}`);
    loadAndIndexKnowledge();
});
