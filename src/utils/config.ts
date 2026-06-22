import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export interface GragentConfig {
  llm?: string;
  model?: string;
  apiKey?: string;
  mcps?: string[];
  auth?: string;
  system?: string;
  steps?: number;
  stream?: boolean;
  verbose?: boolean;
  // listen-specific
  broker?: string;
  inputTopic?: string;
  outputTopic?: string;
  groupId?: string;
}

export function loadConfig(configPath?: string): GragentConfig {
  const paths = configPath
    ? [resolve(configPath)]
    : [
        resolve('gragent.config.json'),
        resolve('.gragentrc.json'),
      ];

  for (const p of paths) {
    if (existsSync(p)) {
      try {
        const raw = readFileSync(p, 'utf-8');
        return JSON.parse(raw) as GragentConfig;
      } catch {
        // ignore parse errors — fall through
      }
    }
  }

  return {};
}

/** Merge config + CLI flags. CLI flags always win over config values. */
export function mergeConfig<T extends Record<string, unknown>>(
  config: GragentConfig,
  flags: T,
  map: Partial<Record<keyof GragentConfig, keyof T>>,
): T {
  const merged = { ...flags };
  for (const [configKey, flagKey] of Object.entries(map) as [keyof GragentConfig, keyof T][]) {
    if (config[configKey] !== undefined && merged[flagKey] === undefined) {
      (merged as Record<keyof T, unknown>)[flagKey] = config[configKey];
    }
  }
  return merged;
}
