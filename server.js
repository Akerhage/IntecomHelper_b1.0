// server.js - Version 8.1 - Slutgiltig "Intensivkurs MC"-expert
// Helt omskriven logik för att korrekt hämta och presentera detaljerad fakta.

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
  const foundKeywords = [];

  const sortedKeywords = Object.keys(knowledge.keywords).sort((a, b) => {
    const aHasVehicle = a.includes('_bil') || a.includes('_mc');
    const bHasVehicle = b.includes('_bil') || b.includes('_mc');
    
    if (aHasVehicle && !bHasVehicle) return -1;
    if (!aHasVehicle && bHasVehicle) return 1;

    const aHasMC = a.includes('_mc');
    const bHasMC = b.includes('_mc');

    if ((q.includes('mc') || q.includes('hoj') || q.includes('motorcykel'))) {
        if (aHasMC && !bHasMC) return -1;
        if (!aHasMC && bHasMC) return 1;
    }
    
    return b.length - a.length;
  });

  for (const mainKeyword of sortedKeywords) {
    const synonyms = knowledge.keywords[mainKeyword];
    for (const synonym of synonyms) {
      const synonymWords = synonym.toLowerCase().split(' ');
      
      const requiredWords = synonymWords.filter(word => {
          if ((word === 'bil' && mainKeyword.includes('_bil')) || (word === 'mc' && mainKeyword.includes('_mc'))) {
              return !(q.includes('bil') || q.includes('mc') || q.includes('hoj') || q.includes('motorcykel'));
          }
          return true;
      });

      if (requiredWords.every(word => q.includes(word))) {
        if (!foundKeywords.includes(mainKeyword)) {
          foundKeywords.push(mainKeyword);
        }
      }
    }
  }
  return foundKeywords;
}

function getTopicFacts(primaryKeyword, question) {
    const q = question.toLowerCase();
    const topicMap = {
        'am_kurs': 'am_kort_och_kurser',
        'körkortstillstånd': 'korkortstillstand',
        'intensivkurs_bil': ['lektioner_paket_bil', 'macros_mejl-mallar'],
        'intensivkurs_mc': ['lektioner_paket_mc', 'policy_kundavtal', 'mc_lektioner_utbildning']
    };
    const topicKeys = Array.isArray(topicMap[primaryKeyword]) ? topicMap[primaryKeyword] : [topicMap[primaryKeyword]];
    if (!topicKeys || !knowledge.basfakta_topics[topicKeys[0]]) return [];
    
    if (primaryKeyword === 'am_kurs') {
        const topicData = knowledge.basfakta_topics[topicKeys[0]];
        let allFacts = [];
        let requirementsList = [];
        if (topicData.am_license_info?.requirements) {
            requirementsList = topicData.am_license_info.requirements;
            allFacts.push({ id: 'krav', text: "För att få ett AM-körkort behöver du uppfylla några krav:\n" + requirementsList.map(req => `• ${req}`).join('\n') });
        }
        if (q.includes('gammal') || q.includes('ålder')) {
            return ["Du måste ha fyllt 15 år för att få göra kunskapsprovet för AM-körkort."];
        }
        return allFacts.map(fact => fact.text);
    }
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
        } 
        else if (q.includes("avbokningsbar")) {
             if (intensiveCourseInfo?.description?.includes("INTE avbokningsbar")) {
                facts.push("Nej, vår 2-veckors intensivutbildning är INTE avbokningsbar efter att den har bokats in.");
            }
        } 
        else { 
            if (policyInfo?.body) {
                facts.push("Vår 2-veckors intensivkurs är ett upplägg där vi försöker planera in 16 körlektioner under en tvåveckorsperiod. Målet är att du även ska hinna med Risk 1 och Risk 2 under denna tid. Det är ett högt tempo som kräver att du är tillgänglig på de tider läraren har. Proven bokas vanligtvis in veckan efter kursen, om det finns tider hos Trafikverket.");
            }
        }
        return facts;
    }
    else if (primaryKeyword === 'intensivkurs_mc') {
        const utbildningData = knowledge.basfakta_topics[topicKeys[2]];
        let facts = [];
        
        const intensiveCourseInfo = utbildningData?.intensive_course;

        if (!intensiveCourseInfo) return [];

        if (q.includes("ingår")) {
            if (intensiveCourseInfo.inclusions?.items) {
                facts.push("Följande ingår i priset för intensivveckan för MC:\n• " + intensiveCourseInfo.inclusions.items.join('\n• '));
            }
        }
        else if (q.includes("avbokningsregler") || q.includes("avboka")) {
            if (intensiveCourseInfo.cancellation_policy?.rule) {
                facts.push("Avbokning för MC intensivvecka: " + intensiveCourseInfo.cancellation_policy.rule);
            }
        }
        else { // Allmän fråga
            let fullDescription = [];
            if (intensiveCourseInfo.target_audience) fullDescription.push(intensiveCourseInfo.target_audience);
            if (intensiveCourseInfo.experience) fullDescription.push(intensiveCourseInfo.experience);
            if (intensiveCourseInfo.expectations) fullDescription.push(intensiveCourseInfo.expectations);
            if (fullDescription.length > 0) {
                facts.push(fullDescription.join(' '));
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

  const primaryKeyword = facts.keywords[0];
  const greetings = { 
      'am_kurs': "Vad roligt att du är intresserad av en AM-kurs!",
      'intensivkurs_bil': "Absolut! Här är lite information om vår intensivutbildning för bil.",
      'intensivkurs_mc': "Javisst! Här kommer lite information om vår intensivvecka för MC."
  };
  if(greetings[primaryKeyword]) answerParts.push(greetings[primaryKeyword]);
  
  if (facts.basfakta.length > 0) {
    answerParts.push(...facts.basfakta);
  }

  if (facts.offices.length > 0 && primaryKeyword) {
    const city = facts.offices[0].city;
    const serviceNameMap = { 
        'intensivkurs_bil': 'Intensivutbildning (2 veckor) BIL',
        'intensivkurs_mc': 'Intensivvecka MC' 
    };
    const serviceSearchTerm = serviceNameMap[primaryKeyword] || primaryKeyword.replace('_', '-');
    const officesWithService = [];
    facts.offices.forEach(office => {
        const priceEntry = office.prices.find(p => p.service_name.toLowerCase().includes(serviceSearchTerm.toLowerCase()));
        if (priceEntry) officesWithService.push({ name: office.name, price: priceEntry.price, service_name: priceEntry.service_name });
    });
    if (officesWithService.length > 0) {
        answerParts.push(`\nI ${city} erbjuder följande kontor detta:`);
        const officeList = officesWithService.map(o => `• ${o.name} (${o.service_name}): ${o.price} kr`);
        answerParts.push(officeList.join('\n'));
    } else if (/pris|kostar|boka/i.test(question)) {
        answerParts.push(`\nJag kunde tyvärr inte hitta information om detta i ${city}. Vi rekommenderar att du kontaktar våra kontor där direkt för att se om de erbjuder detta.`);
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
  let facts = { offices: offices, keywords: keywords, basfakta: [] };

  if (keywords.length > 0) {
      facts.basfakta = getTopicFacts(keywords[0], question);
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
