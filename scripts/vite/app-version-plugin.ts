import { randomUUID } from 'node:crypto';
import type { Plugin } from 'vite';

/** The bundle and static JSON share an ID generated per deployment, including CI. */
export function appVersionPlugin(): Plugin {
  const version = randomUUID();
  return {
    name: 'office-app-version',
    apply: 'build',
    config: () => ({ define: { __OFFICE_BUILD_ID__: JSON.stringify(version) } }),
    generateBundle() {
      if (this.environment.name !== 'client') return;
      this.emitFile({ type: 'asset', fileName: 'app-version.json', source: JSON.stringify({ version }) });
    },
  };
}
