// Loaded for every Vitest run via vitest.config.ts setupFiles.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Without vitest `globals: true`, @testing-library/react cannot self-register its
// automatic DOM cleanup — rendered components would accumulate across tests and
// getByText would start matching stale duplicates.
afterEach(() => {
  cleanup();
});
