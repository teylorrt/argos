import { writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { observationSchema } from './model.js';
await writeFile(new URL('../../contracts/observation.schema.json', import.meta.url), JSON.stringify(z.toJSONSchema(observationSchema), null, 2) + '\n');
console.log('Observation JSON Schema generated from the server validator.');
