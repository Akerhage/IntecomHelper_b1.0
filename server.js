// server.js - Version 34.0 - NY STRATEGI: INTERN SÖKMOTOR
// - GRUNDLÄGGANDE ARKITEKTURÄNDRING: AI-tolken är borttagen från det första steget.
// - IMPLEMENTATION: Använder nu Fuse.js för att direkt göra en "fuzzy search" på all text i knowledge-databasen.
// - MÅL: Att pålitligt hitta det mest relevanta textstycket som innehåller svaret på en fråga.
// - Detta är första steget i en tvåstegsstrategi för att bygga en robust och pålitlig bot och bryta test-cyklerna.

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

// Funktion för att rekursivt platta ut JSON-objekt till sökbara textsträngar
function flattenObject(obj, path = '', result = []) {
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const newPath = path ? `${path}.${key}` : key;
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        flattenObject(obj[key], newPath, result);
      } else if (typeof obj[key] === 'string') {
        result.push({ path: newPath, text: obj[key] });
      } else if (Array.isArray(obj[key])) {
        // Hantera arrayer av strängar
        obj[key].forEach(item => {
          if (typeof item === 'string') {
            result.push({ path: `${newPath}`, text: item });
          }
        });
      }
    }
  }
}

function loadAndIndexKnowledge() {
  const knowledgePath = path.join(__dirname, 'knowledge');
  try {
    const files = fs.readdirSync(knowledgePath);
    files.forEach(file => {
      if (file.startsWith('basfakta_') && file.endsWith('.json')) {
        const filePath = path.join(knowledgePath, file);
        const rawData = fs.readFileSync(filePath, 'utf8');
        const jsonData = JSON.parse(rawData);
        
        const facts = [];
        flattenObject(jsonData, '', facts);
        searchableFacts.push(...facts);
      }
    });

    // Skapa Fuse.js-indexet
    const options = {
      keys: ['text'],
      includeScore: true,
      threshold: 0.4, // Justera denna tröskel för att finjustera sökningen (lägre = striktare)
      minMatchCharLength: 5,
    };
    fuse = new Fuse(searchableFacts, options);

    console.log(`[Server] Databas laddad och indexerad. Totalt ${searchableFacts.length} sökbara textstycken.`);

  } catch (error) {
    console.error('[Server] Ett allvarligt fel inträffade vid inläsning/indexering av knowledge-filer:', error);
  }
}

// --- FÖRMÅGOR / HANDLERS ---
function handleFuzzySearch(question) {
    if (!fuse) return null;
    
    const results = fuse.search(question);
    
    if (results.length > 0) {
        // Returnera den bäst matchande texten
        return results[0].item.text;
    }
    
    return null;
}


// --- SVARSBYGGARE ---
function build
