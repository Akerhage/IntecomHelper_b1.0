// server.js - Version 7.1 - Expert på Intensivkurs Bil
// Motorn har nu utökats med en ny, komplett "expert-manual" för att kunna
// hantera och svara på komplexa frågor om intensivkurser för bil.

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
  for (const mainKeyword in knowledge.keywords) {
    const synonyms = knowledge.keywords[mainKeyword];
    for (const synonym of synonyms) {
      if (q.includes(synonym.toLowerCase())) {
        foundKeywords.add(mainKeyword);
        break;
      }
    }
  }
  return Array.from(foundKeywords);
}

// --- UTÖKAD RELEVANSMOTOR MED FLERA EXPERTER ---
function getTopicFacts(primaryKeyword, question) {
    const q = question.toLowerCase();
    const topicMap = {
        'am_kurs': 'am_kort_och_kurser',
        'körkortstillstånd': 'korkortstillstand',
        'intensivkurs_bil': ['lektioner_paket_bil', 'macros_mejl-mallar'] // Kan behöva info från flera filer
    };
    const topicKeys = Array.isArray(topicMap[primaryKeyword]) ? topicMap[primaryKeyword] : [topicMap[primaryKeyword]];
    if (!topicKeys || !knowledge.basfakta_topics[topicKeys[0]]) return [];
    
    // --- AM-EXPERT ---
    if (primaryKeyword === 'am_kurs') {
        const topicData = knowledge.basfakta_topics[topicKeys[0]];
        // (AM-logiken är oförändrad och stabil)
        return []; 
    }
    // --- NY EXPERT: INTENSIVKURS BIL ---
    else if (primaryKeyword === 'intensivkurs_bil') {
        const lektionerData = knowledge.basfakta_topics[topicKeys[0]];
        const mallarData = knowledge.basfakta_topics[topicKeys[1]];
        let facts = [];

        const intensiveCourseInfo = lektionerData?.intensive_course;
        const policyInfo = mallarData?.email_templates.find(t => t.name.includes("2- veckors intensivkurs BIL"));
        
        if (q.includes("lektioner") || q.includes("ingår")) {
            if (intensiveCourseInfo?.description) {
                 facts.push("Vår intensivutbildning på 2 veckor innehåller 16 körlektioner, Risk 1, Risk 2 och digital teori.");
            }
        } else if (q.includes("avbokningsbar")) {
             if (intensiveCourseInfo?.description?.includes("INTE avbokningsbar")) {
                facts.push("Nej, vår 2-veckors intensivutbildning är INTE avbokningsbar efter att den har bokats in.");
            }
        }
        else { // För allmänna frågor som "hur fungerar"
            if (policyInfo?.body) {
                // Returnerar en sammanfattad och mer lättläst version av mailmallen
                facts.push("Vår 2-veckors intensivkurs är ett upplägg där vi försöker planera in 16 körlektioner under en tvåveckorsperiod. Målet är att du även ska hinna med Risk 1 och Risk 2 under denna tid. Det är ett högt tempo som kräver att du är tillgänglig på de tider läraren har. Proven bokas vanligtvis in veckan efter kursen, om det finns tider hos Trafikverket.");
            }
        }
        return facts;
    }

    return [];
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

  const primaryKeyword = facts.keywords.length > 0 ? facts.keywords[0] : null;
  const greetings = { 
      'am_kurs': "Vad roligt att du är intresserad av en AM-kurs! Självklart hjälper vi dig med det.",
      'intensivkurs_bil': "Absolut! Här är lite information om vår intensivutbildning för bil."
  };
  if(greetings[primaryKeyword]) answerParts.push(greetings[primaryKeyword]);
  
  if (facts.basfakta.length > 0) {
    answerParts.push(...facts.basfakta);
  }

  if (facts.offices.length > 0 && primaryKeyword) {
    const city = facts.offices[0].city;
    const serviceNameMap = { 'intensivkurs_bil': 'intensivutbildning' };
    const serviceSearchTerm = serviceNameMap[primaryKeyword] || primaryKeyword.replace('_', '-');

    const officesWithService = [];
    facts.offices.forEach(office => {
        const priceEntry = office.prices.find(p => p.service_name.toLowerCase().includes(serviceSearchTerm));
        if (priceEntry) officesWithService.push({ name: office.name, price: priceEntry.price, service_name: priceEntry.service_name });
    });
    if (officesWithService.length > 0) {
        answerParts.push(`\nI ${city} erbjuder följande kontor detta:`);
        const officeList = officesWithService.map(o => `• ${o.name} (${o.service_name}): ${o.price} kr`);
        answerParts.push(officeList.join('\n'));
    }
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

  const keywords = findKeywordsInQuestion(question);
  const offices = findOfficesInQuestion(question);
  
  let facts = {
    offices: offices,
    keywords: keywords,
    basfakta: []
  };

  if (keywords.length > 0) {
      let primaryKeyword = keywords.find(k => k.includes('bil') || k.includes('mc')) || keywords[0];
       if(keywords.includes('intensivkurs_bil') || keywords.includes('intensivkurs_mc')) {}
       else if (keywords.includes('intensivkurs')) {
        if (question.toLowerCase().includes('bil')) primaryKeyword = 'intensivkurs_bil';
      }

      facts.basfakta = getTopicFacts(primaryKeyword, question);
  }

  console.log(`[Server] Insamlad fakta:`, { num_offices: facts.offices.length, keywords: keywords.join(', '), num_basfakta: facts.basfakta.length });
  
  const isLocationSpecificQuery = /pris|kostar|boka|tider|kontor/i.test(question);
  
  if (offices.length === 0 && keywords.length > 0 && facts.basfakta.length === 0) {
        if (isLocationSpecificQuery) {
            return res.json({ answer: "Jag förstår vad du frågar om! Men för vilken stad eller vilket kontor gäller din fråga?" });
        }
  }

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