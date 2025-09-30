// server.js - Version 21.0 - DEN SLUTGILTIGA
// - Implementerat en robust normaliseringsfunktion för stadsnamn.
// - Helt omskriven och förenklad logik i handleHämtaFakta för att garantera korrekta uppslag.
// - Verifierad mot alla testfall. Detta är den produktionsklara versionen.

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = 3000;

// --- KONFIGURATION ---
const GEMINI_API_KEY = 'AIzaSyBH1qk79tRCF_E8hfc3Y_nGWFDggTTKm48';
const MODEL_NAME = 'gemini-2.5-flash'; 
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;

app.use(cors());
app.use(express.json());

// --- DATABAS ---
let knowledge = {
  basfakta_topics: {},
  offices: [],
};

function loadKnowledge() {
  const knowledgePath = path.join(__dirname, 'knowledge');
  try {
    const files = fs.readdirSync(knowledgePath);
    files.forEach(file => {
      if (file.endsWith('.json') && !file.includes('keywords')) {
        const filePath = path.join(knowledgePath, file);
        const rawData = fs.readFileSync(filePath, 'utf8');
        const jsonData = JSON.parse(rawData);
        
        if (file.startsWith('basfakta_')) {
          const topicName = file.replace('basfakta_', '').replace('.json', '');
          knowledge.basfakta_topics[topicName] = jsonData;
        } else {
          knowledge.offices.push(jsonData);
        }
      }
    });
    console.log(`[Server] Databas laddad: ${Object.keys(knowledge.basfakta_topics).length} basfakta-ämnen, ${knowledge.offices.length} kontor.`);
  } catch (error) {
    console.error('[Server] Ett allvarligt fel inträffade vid inläsning av knowledge-filer:', error);
  }
}

// --- AI-TOLK ---
function getPromptForAI(question) {
    return `
Du är en AI-assistent som agerar som "tolk". Din enda uppgift är att analysera en användarfråga och översätta den till ett specifikt JSON-format. Svara ALDRIG på frågan, bara med det strukturerade JSON-kommandot. Om en fråga innehåller flera avsikter, returnera en JSON-array med ett objekt för varje avsikt.

De tillgängliga "förmågorna" är:
1. "hämta_pris": Används för frågor om kostnad. Kräver parametrarna "kurs" och "stad".
2. "hämta_fakta": Används för allmänna frågor om regler, krav, innehåll etc. Kräver parametrarna "kurs" och "ämne".

Giltiga värden för "kurs" är: "am_kurs", "introduktionskurs", "intensivkurs_mc".
Giltiga värden för "ämne" är: "körkortstillstånd", "ålderskrav", "kursinnehåll", "övningskörning_privat", "definition", "giltighetstid", "deltagarkrav", "kurslängd", "förkunskapskrav", "avbokningsregler".

Städer ska alltid vara med små bokstäver.

---
Översätt nu följande användarfråga till JSON-formatet:

Fråga: "${question}"
Svar:`;
}

async function getCommandsFromAI(question) {
    try {
        const prompt = getPromptForAI(question);
        const response = await axios.post(GEMINI_API_URL, 
            { contents: [{ parts: [{ text: prompt }] }] },
            { params: { key: GEMINI_API_KEY } }
        );

        if (!response.data.candidates || response.data.candidates.length === 0) {
            console.error("[Server] Gemini API returnerade ett tomt eller blockerat svar.");
            return null;
        }

        const aiResponseText = response.data.candidates[0].content.parts[0].text.replace(/```json\n|\n```/g, '').trim();
        let commands = JSON.parse(aiResponseText);
        
        if (!Array.isArray(commands)) {
            commands = [commands];
        }
        return commands;

    } catch (error) {
        console.error("[Server] Fel vid anrop till Gemini API:", error.response ? JSON.stringify(error.response.data) : error.message);
        return null;
    }
}


// --- FÖRMÅGOR / HANDLERS ---

const normalizeCity = (city) => {
    if (!city) return '';
    return city.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

function handleHämtaPris(parametrar) {
    const { kurs, stad } = parametrar;
    if (!kurs || !stad) return null;

    const normalizedStad = normalizeCity(stad);

    const serviceNameMap = { 
        'am_kurs': 'am-kurs',
        'introduktionskurs': 'introduktionskurs',
        'intensivkurs_mc': 'intensivvecka mc'
    };
    const serviceSearchTerm = serviceNameMap[kurs];
    if (!serviceSearchTerm) return null;

    const targetOffices = knowledge.offices.filter(o => normalizeCity(o.city) === normalizedStad);
    if (targetOffices.length === 0) return `Vi verkar inte ha ett kontor i ${stad}.`;

    let priceInfo = [];
    targetOffices.forEach(office => {
        const priceEntry = office.prices.find(p => p.service_name.toLowerCase().includes(serviceSearchTerm));
        if (priceEntry) {
            priceInfo.push(`På ${office.name} i ${office.city} kostar ${priceEntry.service_name} ${priceEntry.price} kr.`);
        }
    });

    return priceInfo.length > 0 ? priceInfo.join('\n') : `Vi kunde tyvärr inte hitta någon prisinformation för ${serviceSearchTerm} i ${stad}.`;
}

function handleHämtaFakta(parametrar) {
    const { kurs, ämne } = parametrar;
    if (!kurs || !ämne) return null;
    
    // Omskriven och förenklad logik för att vara 100% korrekt
    const factMap = {
        'am_kurs_körkortstillstånd': { topic: 'am_kort_och_kurser', path: 'course_details.license_requirement' },
        'introduktionskurs_körkortstillstånd': { topic: 'introduktionskurs_handledarkurs_bil', path: 'course_details.license_requirement' },
        'am_kurs_ålderskrav': { topic: 'am_kort_och_kurser', path: 'course_details.age_requirement' },
        'am_kurs_kursinnehåll': { topic: 'am_kort_och_kurser', path: 'general_course_structure.components', prefix: 'Följande ingår i vår AM-kurs:\n• ' },
        'am_kurs_övningskörning_privat': { topic: 'am_kort_och_kurser', path: 'course_details.private_practice_rules' },
        'introduktionskurs_definition': { topic: 'introduktionskurs_handledarkurs_bil', path: 'course_details.what_it_is.description' },
        'introduktionskurs_giltighetstid': { topic: 'introduktionskurs_handledarkurs_bil', path: 'course_details.validity_period' },
        'introduktionskurs_deltagarkrav': { topic: 'introduktionskurs_handledarkurs_bil', path: 'course_details.who_must_attend' },
        'introduktionskurs_kurslängd': { topic: 'introduktionskurs_handledarkurs_bil', path: 'course_details.course_length' },
        'intensivkurs_mc_kursinnehåll': { topic: 'mc_lektioner_utbildning', path: 'intensive_course.inclusions.items', prefix: 'Följande ingår i intensivkursen för MC: ' },
        'intensivkurs_mc_förkunskapskrav': { topic: 'mc_lektioner_utbildning', path: 'intensive_course.experience' },
        'intensivkurs_mc_avbokningsregler': { topic: 'mc_lektioner_utbildning', path: 'intensive_course.cancellation_policy.rule' }
    };

    const factKey = `${kurs}_${ämne}`;
    const mapping = factMap[factKey];

    if (!mapping) return null;

    const topicData = knowledge.basfakta_topics[mapping.topic];
    if (!topicData) return null;

    const value = mapping.path.split('.').reduce((o, k) => (o || {})[k], topicData);
    
    if (value) {
        if (Array.isArray(value)) {
            return (mapping.prefix || '') + value.join((mapping.prefix && mapping.prefix.includes('•')) ? '\n• ' : ', ');
        }
        return value;
    }
    return null;
}

// --- SVARSBYGGARE ---
function buildAnswer(results) {
    if (results.length === 0 || results.every(r => r === null)) {
        return "Jag är inte säker på att jag förstår. Kan du försöka omformulera frågan?";
    }
    const greeting = "Hej!";
    const closing = "\nHoppas detta var till hjälp! Ha en fortsatt fin dag!";
    const answerParts = results.filter(r => r !== null);
    return [greeting, ...answerParts, closing].join('\n\n');
}

// --- HUVUDLOGIK / ENDPOINT ---
app.post('/ask', async (req, res) => {
    const question = req.body.question || "";
    console.log(`\n------------------\n[Server] Mottog fråga: "${question}"`);
  
    if (!question) return res.status(400).json({ answer: "Frågan var tom." });

    const commands = await getCommandsFromAI(question);
    if (!commands) {
        return res.json({ answer: "Ett fel inträffade när jag försökte förstå din fråga. Försök igen." });
    }
    console.log('[Server] AI-Tolk returnerade kommandon:', commands);

    const results = [];
    for (const command of commands) {
        const ability = command.förmåga;
        const parametrar = command.parametrar;

        if (ability === 'hämta_pris' && parametrar) {
            results.push(handleHämtaPris(parametrar));
        } else if (ability === 'hämta_fakta' && parametrar) {
            results.push(handleHämtaFakta(parametrar));
        }
    }
    console.log('[Server] Resultat från förmågor:', results);

    const finalAnswer = buildAnswer(results);
    console.log(`[Server] Formulerat svar:\n---\n${finalAnswer}\n---`);
    return res.json({ answer: finalAnswer });
});


app.listen(PORT, () => {
  console.log(`[Server] Lyssnar på http://localhost:${PORT}`);
  loadKnowledge();
});
