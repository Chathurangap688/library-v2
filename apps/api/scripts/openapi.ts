/**
 * Lesson 2.2: write the API contract to apps/api/openapi.json (committed to Git).
 *   npm run openapi        (the web app then turns it into TypeScript types)
 * No database or server is needed: the document comes only from the route schemas.
 */
import { writeFileSync } from 'node:fs'
import { buildApp, openApiInfo } from '../src/app'

const app = buildApp(() => { throw new Error('no database needed to build the document') })
const doc = app.getOpenAPI31Document(openApiInfo)
writeFileSync('openapi.json', JSON.stringify(doc, null, 2) + '\n')
console.log(`openapi.json written: ${Object.keys(doc.paths ?? {}).length} paths, ${Object.keys(doc.components?.schemas ?? {}).length} schemas`)
