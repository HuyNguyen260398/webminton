import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['packages/**/test/**/*.test.ts','backend/test/**/*.test.ts','scripts/test/**/*.test.ts'],exclude:['**/node_modules/**','backend/test/integration/**']}});
