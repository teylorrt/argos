import { KeyRing } from './crypto.js';
const directory = process.env.KEY_DIR ?? './data/keys';
const keys = await KeyRing.open(directory);
if (process.argv.includes('--rotate')) await keys.rotate(directory);
console.log(JSON.stringify(keys.publicKey(), null, 2));
if (process.argv.includes('--rotate')) console.log('Restart the API to activate this key. Old keys were preserved.');
