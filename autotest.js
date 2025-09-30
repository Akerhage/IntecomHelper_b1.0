// autotest.js - Version 2.7 - ROBUST KEYWORD-KONTROLL
// - Fix: Gör checkKeywords-funktionen mer robust för att korrekt hantera priser
//   och andra numeriska värden i testfallen.

const fs = require('fs');
const path = require('path');

const API_URL = 'http://localhost:3000/ask';
const TEST_SUITE_FILE = './test-suite.json';
const SERVER_LOG_FILE = './server_log.txt';
const LOG_FILE = './test_log.txt';
const VERSION = '2.7';

const log = (message) => {
    console.log(message);
    fs.appendFileSync(LOG_FILE, message + '\n');
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const checkKeywords = (answer, keywords) => {
    if (!answer || typeof answer !== 'string') return { pass: false, missing: keywords };
    // Normalisera svaret för att bättre matcha siffror och tecken
    const normalizedAnswer = answer.toLowerCase().replace(/[\s,.]/g, '');
    
    const missing = keywords.filter(kw => {
        const normalizedKw = kw.toLowerCase().replace(/[\s,.]/g, '');
        return !normalizedAnswer.includes(normalizedKw);
    });

    return {
        pass: missing.length === 0,
        missing: missing
    };
};

const runTest = async (testCase, index, total) => {
    const { expert, question, expected_keywords } = testCase;
    log(`\n--- Testar (${index}/${total}) - Expert: ${expert} ---`);
    log(`Fråga: "${question}"`);

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question })
        });

        if (!response.ok) {
            log(`  [FAIL]`);
            log(`    --> Servern svarade med status ${response.status}`);
            return false;
        }

        const data = await response.json();
        const { answer } = data;
        const result = checkKeywords(answer, expected_keywords);

        if (result.pass) {
            log(`  [PASS]`);
            return true;
        } else {
            const cleanAnswer = (answer || "Inget svar").replace(/(\r\n|\n|\r)/gm, " ");
            log(`  [FAIL]`);
            log(`    --> Fick svar: "${cleanAnswer}"`);
            log(`    --> Saknade nyckelord: [${result.missing.join(', ')}]`);
            return false;
        }
    } catch (error) {
        log(`  [ERROR]`);
        log(`    --> Kunde inte ansluta till servern: ${error.message}`);
        return false;
    }
};

const main = async () => {
    const {default: clipboardy} = await import('clipboardy');
    const timestamp = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' }).replace(',','');
    fs.writeFileSync(LOG_FILE, `--- STARTAR AUTOMATISK TEST-SVIT (v${VERSION}) [${timestamp}] ---\n`);

    let testSuite;
    try {
        testSuite = JSON.parse(fs.readFileSync(TEST_SUITE_FILE, 'utf8'));
    } catch (error) {
        log('Kunde inte läsa test-suite.json. Avbryter.');
        return;
    }

    let passedCount = 0;
    for (let i = 0; i < testSuite.length; i++) {
        const pass = await runTest(testSuite[i], i + 1, testSuite.length);
        if (pass) passedCount++;
        await delay(100);
    }

    log('\n--- TESTER AVSLUTADE ---');
    log(`Resultat: ${passedCount} / ${testSuite.length} godkända tester.`);
    log(`\nFullständig logg har sparats till: ${LOG_FILE}`);

    try {
        const testLogContent = fs.readFileSync(LOG_FILE, 'utf8');
        const serverLogContent = fs.existsSync(SERVER_LOG_FILE) ? fs.readFileSync(SERVER_LOG_FILE, 'utf8') : 'SERVER-LOGG SAKNAS.\n';
        const combinedContent = `--- SERVER-LOGG ---\n${serverLogContent}\n\n--- TEST-RESULTAT ---\n${testLogContent}`;
        clipboardy.writeSync(combinedContent);
        console.log('\n\x1b[32m%s\x1b[0m', '[AUTOTEST] Server- och testloggar har kopierats till urklipp!');
    } catch (error) {
        console.log('\n\x1b[31m%s\x1b[0m', '[AUTOTEST] Kunde inte kopiera loggar till urklipp.');
        console.error(error);
    }
};

main();
