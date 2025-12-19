/**
 * Generate a secure API key for your pothole detection system
 * 
 * Usage: node scripts/generateApiKey.js
 */

import crypto from 'crypto';

// Generate a random API key
const generateApiKey = (prefix = 'sk_live') => {
  const randomBytes = crypto.randomBytes(32);
  const randomString = randomBytes.toString('hex');
  return `${prefix}_${randomString}`;
};

// Generate multiple keys
const generateMultipleKeys = (count = 1) => {
  const keys = [];
  for (let i = 0; i < count; i++) {
    keys.push(generateApiKey());
  }
  return keys;
};

// Main
const count = process.argv[2] ? parseInt(process.argv[2]) : 1;
const keys = generateMultipleKeys(count);

console.log('\n🔐 Generated API Key(s):\n');
keys.forEach((key, index) => {
  console.log(`${index + 1}. ${key}`);
});

console.log('\n📝 To use these keys:');
console.log('1. Add them to your .env file:');
console.log(`   API_KEYS=${keys.join(',')}`);
console.log('\n2. Share the key(s) with authorized users/devices');
console.log('\n3. Users should include the key in requests:');
console.log('   Header: X-API-Key: <your-key>');
console.log('   Or query: ?api_key=<your-key>\n');

