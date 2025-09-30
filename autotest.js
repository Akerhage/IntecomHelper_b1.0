// autotest.js - Vårt automatiska testverktyg (Version 2.2 - Korrekt paus)
// - Paus på 7 sekunder för att respektera gränsen på 10 anrop/minut.

const fs = require('fs');
const axios = require('axios');

const TEST_SUITE_FILE = './test-suite.json';
const SERVER_URL = 'http://localhost:3000/ask';
const LOG_FILE = './test_log.txt';

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let logOutput = '';
function log(message) {
  console.log(message);
  logOutput += message + '\n';
}

async function runTests() {
  log(`--- STARTAR AUTOMATISK TEST-SVIT (v2.2) [${new Date().toLocaleString('sv-SE')}] ---`);
  
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
  const allQuestions = [];
  for (const expertName in testSuite) {
      testSuite[expertName].forEach(test => {
          allQuestions.push({ ...test, expertName });
      });
  }
  totalTests = allQuestions.length;

  for (let i = 0; i < allQuestions.length; i++) {
      const test = allQuestions[i];
      log(`\n--- Testar (${i + 1}/${totalTests}) - Expert: ${test.expertName} ---`);
      log(`Fråga: "${test.question}"`);

      try {
        const response = await axios.post(SERVER_URL, { question: test.question });
        const answer = response.data.answer.toLowerCase();
        
        const allKeywordsFound = test.expected_keywords.every(keyword => answer.includes(keyword.toLowerCase()));

        if (allKeywordsFound) {
          passedTests++;
          log(`  [PASS]`);
        } else {
          log(`  [FAIL]`);
          log(`    --> Fick svar: "${response.data.answer.replace(/\n/g, ' ')}"`);
          log(`    --> Saknade nyckelord: [${test.expected_keywords.filter(kw => !answer.includes(kw.toLowerCase())).join(', ')}]`);
        }
      } catch (error) {
        log(`  [ERROR]`);
        if (error.response) {
            log(`    --> Servern svarade med status: ${error.response.status}`);
        } else if (error.request) {
            log(`    --> Ingen respons från servern. Är du säker på att den är igång med 'npm start'?`);
        } else {
            log(`    --> Ett fel inträffade: ${error.message}`);
        }
      }
      
      if (i < allQuestions.length - 1) {
          log('    --> Pausar i 7 sekunder...');
          await wait(7000); 
      }
  }

  log('\n--- TESTER AVSLUTADE ---');
  log(`Resultat: ${passedTests} / ${totalTests} godkända tester.`);
  
  fs.writeFileSync(LOG_FILE, logOutput, 'utf8');
  log(`\nFullständig logg har sparats till: ${LOG_FILE}`);
}

runTests();
