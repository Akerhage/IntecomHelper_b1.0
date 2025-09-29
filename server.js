// server.js - Version 14.2 - Korrigerad med alla experter
// - Återställt den fungerande koden för AM- och Introduktionskurs-experterna från den stabila grunden.
// - Implementerat en fullständig och korrekt version av "Intensivkurs MC"-experten.
// - Målet är att klara 16/16 tester i den automatiska test-sviten.

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// --- DATABAS ---

let knowledge = {
  basfakta_topics: {},
  offices: [],
  keywords: {}
};

function loadKnowledge() {
  const knowledgePath = path.join(__dirname, 'knowledge');
  try {
    const files = fs.readdirSync(knowledgePath);
    knowledge.basfakta_topics = {};
    knowledge.offices = [];
    knowledge.keywords = {};
    
    files.forEach(file => {
      if (file.endsWith('.json')) {
        const filePath = path.join(knowledgePath, file);
        const rawData = fs.readFileSync(filePath, 'utf8');
        const jsonData = JSON.parse(rawData);
        
        if (file === 'basfakta_keywords.json') {
          knowledge.keywords = jsonData;
        } else if (file.startsWith('basfakta_')) {
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

function findOfficesInQuestion(question) {
    const q = question.toLowerCase();
    const foundCities = new Set();
    knowledge.offices.forEach(office => {
        const cityLower = office.city.toLowerCase();
        if (q.includes(cityLower)) {
            foundCities.add(cityLower);
        }
    });
    if (foundCities.size === 0) return [];
    const targetCity = Array.from(foundCities)[0];
    return knowledge.offices.filter(office => office.city.toLowerCase() === targetCity);
}

function findKeywordsInQuestion(question) {
    const q = question.toLowerCase();
    const foundKeywords = new Set();
    const sortedKeywords = Object.keys(knowledge.keywords).sort((a, b) => b.length - a.length);

    sortedKeywords.forEach(mainKeyword => {
        const allTerms = [mainKeyword.replace(/_/g, ' '), ...knowledge.keywords[mainKeyword]];
        allTerms.forEach(synonym => {
            if (q.includes(synonym.toLowerCase())) {
                foundKeywords.add(mainKeyword);
            }
        });
    });
    if (q.includes('handledarutbildning') && !foundKeywords.has('introduktionskurs')) {
        foundKeywords.add('introduktionskurs');
    }
    return Array.from(foundKeywords);
}

function getTopicFacts(keywords, question) {
    const q = question.toLowerCase();
    let allFacts = [];
    let handledKeywords = new Set();

    const topicMap = {
        'am_kurs': 'am_kort_och_kurser',
        'körkortstillstånd': 'korkortstillstand',
        'introduktionskurs': 'introduktionskurs_handledarkurs_bil',
        'intensivkurs_mc': 'mc_lektioner_utbildning'
    };

    keywords.forEach(keyword => {
        if (handledKeywords.has(keyword)) return;

        const topicKey = topicMap[keyword];
        if (!topicKey || !knowledge.basfakta_topics[topicKey]) return;
        
        const topicData = knowledge.basfakta_topics[topicKey];
        let factsFoundForKeyword = false;

        // --- AM-kurs EXPERT (STABIL) ---
        if (keyword === 'am_kurs') {
            if (keywords.includes('körkortstillstånd')) {
                allFacts.push("Ja, du måste ha ett giltigt körkortstillstånd för att få övningsköra och göra proven för AM-körkort.");
                factsFoundForKeyword = true;
                handledKeywords.add('körkortstillstånd');
            }
            if (q.includes('gammal') || q.includes('ålder')) {
                allFacts.push("Du måste vara minst 14 år och 9 månader för att börja övningsköra. För att göra kunskapsprovet måste du ha fyllt 15 år.");
                factsFoundForKeyword = true;
            }
            if (q.includes('ingår') && topicData.general_course_structure?.components) {
                const inclusions = topicData.general_course_structure.components.join('\n• ');
                allFacts.push(`Följande ingår i vår AM-kurs:\n• ${inclusions}`);
                factsFoundForKeyword = true;
            }
            if (q.includes('övningsköra privat')) {
                allFacts.push("Nej, privat övningskörning för AM-körkort är inte tillåten. All övningskörning måste ske hos en godkänd utbildare.");
                factsFoundForKeyword = true;
            }
        }

        // --- Introduktionskurs EXPERT (STABIL) ---
        else if (keyword === 'introduktionskurs') {
            if (keywords.includes('körkortstillstånd')) {
                 allFacts.push("Du behöver inte ha ett körkortstillstånd för att gå själva introduktionskursen, men eleven måste ha ett giltigt körkortstillstånd när ni ansöker om handledarskapet hos Transportstyrelsen efter kursen.");
                 factsFoundForKeyword = true;
                 handledKeywords.add('körkortstillstånd');
            }
            if (q.includes('giltig')) {
                allFacts.push("En handledarutbildning är giltig i 5 år från det datum den genomfördes.");
                factsFoundForKeyword = true;
            }
            if (q.includes('både') || q.includes('pappa') || q.includes('mamma') || q.includes('tillsammans')) {
                allFacts.push("Ja, både du som ska vara elev och den som ska vara handledare måste gå kursen. Ni behöver dock inte gå den vid samma tillfälle.");
                factsFoundForKeyword = true;
            }
            if (q.includes('lång tid') || q.includes('lång') || (q.includes('tar') && q.includes('tid'))) {
                allFacts.push("Kursen är cirka tre och en halv timme lång, inklusive pauser.");
                factsFoundForKeyword = true;
            }
            if (q.includes('vad är') || q.includes('innebär')) {
                 allFacts.push(topicData.course_details.what_it_is.description);
                 factsFoundForKeyword = true;
            }
        }
        
        // --- Intensivkurs MC EXPERT (NY) ---
        else if (keyword === 'intensivkurs_mc') {
            const mcCourseInfo = topicData.intensive_course;
            if (q.includes('ingår') && mcCourseInfo?.inclusions?.items) {
                const inclusions = mcCourseInfo.inclusions.items.join(', ');
                allFacts.push(`Följande ingår i intensivkursen för MC: ${inclusions}`);
                factsFoundForKeyword = true;
            }
            if ((q.includes('förkunskaper') || q.includes('krav')) && mcCourseInfo?.experience) {
                allFacts.push(mcCourseInfo.experience);
                factsFoundForKeyword = true;
            }
            if ((q.includes('avboka') || q.includes('avbokningsregler')) && mcCourseInfo?.cancellation_policy?.rule) {
                allFacts.push(mcCourseInfo.cancellation_policy.rule);
                factsFoundForKeyword = true;
            }
        }
        
        handledKeywords.add(keyword);
    });

    return allFacts;
}

function getGreeting() {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 10) return "God morgon!";
    if (hour >= 10 && hour < 12) return "God förmiddag!";
    if (hour >= 12 && hour < 18) return "God eftermiddag!";
    return "God kväll!";
}

function buildAnswer(facts, question) {
    let answerParts = [];
    answerParts.push(getGreeting());
  
    if (facts.basfakta.length > 0) {
        answerParts.push(...facts.basfakta);
    }

    if (facts.offices.length > 0) {
        const city = facts.offices[0].city;
        const serviceNameMap = { 
            'am_kurs': 'AM-Kurs',
            'introduktionskurs': 'Introduktionskurs/Handledarkurs',
            'intensivkurs_mc': 'Intensivvecka MC'
        };
    
        const primaryKeyword = facts.keywords[0];
        const relevantKeywordForPrice = facts.keywords.find(k => serviceNameMap[k]);
        const serviceSearchTerm = relevantKeywordForPrice ? serviceNameMap[relevantKeywordForPrice] : (primaryKeyword ? primaryKeyword.replace(/_/g, ' ') : '');

        if (serviceSearchTerm) {
            const officesWithService = [];
            facts.offices.forEach(office => {
                const priceEntry = office.prices.find(p => p.service_name.toLowerCase().includes(serviceSearchTerm.toLowerCase()));
                if (priceEntry) officesWithService.push({ name: office.name, price: priceEntry.price, service_name: priceEntry.service_name });
            });
            if (officesWithService.length > 0) {
                answerParts.push(`\nI ${city} erbjuder följande kontor detta:`);
                const officeList = officesWithService.map(o => `• ${o.name} (${o.service_name}): ${o.price} kr`);
                answerParts.push(officeList.join('\n'));
            }
        }
    }

    if (facts.basfakta.length === 0 && facts.offices.length === 0 && facts.keywords.length > 0) {
        return `Jag förstår att du frågar om ${facts.keywords.join(' och ').replace(/_/g, ' ')}, men jag har tyvärr ingen specifik information om det. Kan du omformulera din fråga?`;
    }
    
    if (answerParts.length === 1) { 
        return "Jag är inte säker på att jag förstår. Kan du försöka omformulera frågan?";
    }
  
    const closings = [ "Hoppas detta var till hjälp! Ha en fortsatt fin dag!", "Hör av dig igen om du har fler frågor!", "Jag hoppas det besvarade din fråga! Med vänliga hälsningar," ];
    const randomClosing = closings[Math.floor(Math.random() * closings.length)];
    answerParts.push(`\n${randomClosing}`);
  
    return answerParts.join('\n\n');
}

app.post('/ask', (req, res) => {
    const question = req.body.question || "";
    console.log(`\n------------------\n[Server] Mottog fråga: "${question}"`);
  
    if (!question) return res.status(400).json({ answer: "Frågan var tom." });
  
    let keywords = findKeywordsInQuestion(question);
    const offices = findOfficesInQuestion(question);
  
    if (offices.length > 0 && keywords.length === 0) {
        if (/introduktionskurs|handledarkurs/i.test(question)) {
            keywords.push('introduktionskurs');
        } else if (/am|moped|moppe/i.test(question)) {
            keywords.push('am_kurs');
        } else if (/intensivkurs mc|intensivvecka mc/i.test(question)) {
            keywords.push('intensivkurs_mc');
        }
    }

    let facts = { offices: offices, keywords: keywords, basfakta: [] };

    if (keywords.length > 0) {
        facts.basfakta = getTopicFacts(keywords, question);
    }
    
    console.log(`[Server] Insamlad fakta:`, { 
        num_offices: facts.offices.length, 
        keywords: keywords.join(', '), 
        num_basfakta: facts.basfakta.length 
    });
  
    if (facts.offices.length === 0 && facts.basfakta.length === 0 && keywords.length === 0) {
        return res.json({ answer: "Jag är inte säker på att jag förstår. Kan du försöka omformulera frågan?" });
    }

    const finalAnswer = buildAnswer(facts, question);
    console.log(`[Server] Formulerat svar:\n---\n${finalAnswer}\n---`);
    return res.json({ answer: finalAnswer });
});

app.listen(PORT, () => {
  console.log(`[Server] Lyssnar på http://localhost:${PORT}`);
  loadKnowledge();
});
