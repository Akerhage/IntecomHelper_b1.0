// autotest.js - Vårt automatiska testverktyg (Korrigerad)

const fs = require('fs');
const axios = require('axios');

const TEST_SUITE_FILE = './test-suite.json';
const SERVER_URL = 'http://localhost:3000/ask';
const LOG_FILE = './test_log.txt';

// Funktion för att skriva till både konsol och loggfil
let logOutput = '';
function log(message) {
  console.log(message);
  logOutput += message + '\n';
}

async function runTests() {
  log(`--- STARTAR AUTOMATISK TEST-SVIT [${new Date().toLocaleString('sv-SE')}] ---`);
  
  let testSuite;
  try {
    const rawData = fs.readFileSync(TEST_SUITE_FILE, 'utf8');
    testSuite = JSON.parse(rawData);
  } catch (error) {
    log(`\nFATALT FEL: Kunde inte läsa test-sviten från ${TEST_SUITE_FILE}`);
    log(error.message);
    fs.writeFileSync(LOG_FILE, logOutput, 'utf8');
    return;
  }

  let totalTests = 0;
  let passedTests = 0;

  for (const expertName in testSuite) {
    log(`\n--- Testar Expert: ${expertName} ---`);
    const tests = testSuite[expertName];

    for (let i = 0; i < tests.length; i++) {
      totalTests++;
      const test = tests[i];
      const question = test.question;
      const expectedKeywords = test.expected_keywords;

      try {
        const response = await axios.post(SERVER_URL, { question });
        const answer = response.data.answer.toLowerCase();
        
        const allKeywordsFound = expectedKeywords.every(keyword => answer.includes(keyword.toLowerCase()));

        if (allKeywordsFound) {
          passedTests++;
          log(`  [PASS] Fråga ${i + 1}/${tests.length}: "${question}"`);
        } else {
          log(`  [FAIL] Fråga ${i + 1}/${tests.length}: "${question}"`);
          log(`    --> Fick svar: "${response.data.answer.replace(/\n/g, ' ')}"`);
          log(`    --> Saknade nyckelord: [${expectedKeywords.filter(kw => !answer.includes(kw.toLowerCase())).join(', ')}]`);
        }
      } catch (error) {
        log(`  [ERROR] Fråga ${i + 1}/${tests.length}: "${question}"`);
        if (error.response) {
            log(`    --> Servern svarade med status: ${error.response.status}`);
        } else if (error.request) {
            log(`    --> Ingen respons från servern. Är du säker på att den är igång med 'npm start'?`);
        } else {
            log(`    --> Ett fel inträffade: ${error.message}`);
        }
      }
    }
  }

  log('\n--- TESTER AVSLUTADE ---');
  log(`Resultat: ${passedTests} / ${totalTests} godkända tester.`);
  
  fs.writeFileSync(LOG_FILE, logOutput, 'utf8');
  log(`\nFullständig logg har sparats till: ${LOG_FILE}`);
}

runTests();
