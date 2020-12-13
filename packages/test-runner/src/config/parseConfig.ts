import { TestRunnerGroupConfig } from '@web/test-runner-core';
import { chromeLauncher } from '@web/test-runner-chrome';
import {
  emulateMediaPlugin,
  setUserAgentPlugin,
  setViewportPlugin,
} from '@web/test-runner-commands/plugins';
import { getPortPromise } from 'portfinder';
import path from 'path';
import { cpus } from 'os';

import { TestRunnerCliArgs } from './readCliArgs';
import { mergeConfigs } from './mergeConfigs';
import { TestRunnerConfig } from './TestRunnerConfig';
import { esbuildPlugin, nodeResolvePlugin } from '@web/dev-server';
import { TestRunnerStartError } from '../TestRunnerStartError';
import { collectGroupConfigs } from './collectGroupConfigs';
import { playwrightLauncher, puppeteerLauncher } from './loadLauncher';
import { defaultReporter } from '../reporter/defaultReporter';
import { TestRunnerLogger } from '../logger/TestRunnerLogger';

const secondMs = 1000;
const minuteMs = secondMs * 60;

const defaultConfig: Partial<TestRunnerConfig> = {
  rootDir: process.cwd(),
  protocol: 'http:',
  hostname: 'localhost',
  middleware: [],
  plugins: [],
  watch: false,
  concurrentBrowsers: 2,
  concurrency: Math.max(1, cpus().length / 2),
  browserStartTimeout: minuteMs / 2,
  testsStartTimeout: secondMs * 20,
  testsFinishTimeout: minuteMs * 2,
  browserLogs: true,
};

function validate(config: Record<string, unknown>, key: string, type: string) {
  if (config[key] == null) {
    return;
  }

  if (typeof config[key] !== type) {
    throw new TestRunnerStartError(`Configuration error: The ${key} setting should be a ${type}.`);
  }
}

const stringSettings = ['rootDir', 'hostname'];
const numberSettings = [
  'port',
  'concurrentBrowsers',
  'concurrency',
  'browserStartTimeout',
  'testsStartTimeout',
  'testsFinishTimeout',
];
const booleanSettings = [
  'watch',
  'preserveSymlinks',
  'browserLogs',
  'coverage',
  'staticLogging',
  'manual',
  'open',
  'debug',
];

export function validateConfig(config: Partial<TestRunnerConfig>) {
  stringSettings.forEach(key => validate(config, key, 'string'));
  numberSettings.forEach(key => validate(config, key, 'number'));
  booleanSettings.forEach(key => validate(config, key, 'boolean'));

  if (
    config.esbuildTarget != null &&
    !(typeof config.esbuildTarget === 'string' || Array.isArray(config.esbuildTarget))
  ) {
    throw new Error(`Configuration error: The esbuildTarget setting should be a string or array.`);
  }

  if (config.files != null && !(typeof config.files === 'string' || Array.isArray(config.files))) {
    throw new Error(`Configuration error: The files setting should be a string or an array.`);
  }

  return config as TestRunnerConfig;
}

export async function parseConfig(
  config: Partial<TestRunnerConfig>,
  cliArgs: TestRunnerCliArgs = {},
): Promise<{ config: TestRunnerConfig; groupConfigs: TestRunnerGroupConfig[] }> {
  const cliArgsConfig: Partial<TestRunnerConfig> = {
    ...cliArgs,
    // TestRunnerCliArgs shadows some properties of TestRunnerConfig
    // remove them to avoid merging into main config
    groups: undefined,
    browsers: undefined,
  };
  const mergedConfigs = mergeConfigs(defaultConfig, config, cliArgsConfig);
  const finalConfig = validateConfig(mergedConfigs);

  // ensure rootDir is always resolved
  if (typeof finalConfig.rootDir === 'string') {
    finalConfig.rootDir = path.resolve(finalConfig.rootDir);
  } else {
    throw new TestRunnerStartError('No rootDir specified.');
  }

  // generate a default random port
  if (typeof finalConfig.port !== 'number') {
    finalConfig.port = await getPortPromise({ port: 8000 });
  }

  let groupConfigs: TestRunnerGroupConfig[] = [];

  if (finalConfig.groups) {
    const configPatterns: string[] = [];
    for (const entry of typeof finalConfig.groups === 'string'
      ? [finalConfig.groups]
      : finalConfig.groups) {
      if (typeof entry === 'object') {
        groupConfigs.push(entry);
      } else {
        configPatterns.push(entry);
      }
    }
    // group entries which are strings are globs which point to group conigs
    groupConfigs.push(...(await collectGroupConfigs(configPatterns)));
  }

  if (groupConfigs.find(g => g.name === 'default')) {
    throw new Error(
      'Cannot create a group named "default". This named is reserved by the test runner.',
    );
  }

  if (cliArgs.group != null) {
    if (cliArgs.group === 'default') {
      // default group is an alias for the root config
      groupConfigs = [];
    } else {
      const groupConfig = groupConfigs.find(c => c.name === cliArgs.group);
      if (!groupConfig) {
        throw new TestRunnerStartError(`Could not find any group named ${cliArgs.group}`);
      }

      // when focusing a group, ensure that the "default" group isn't run
      // we can improve this by relying only on groups inside the test runner itself
      if (groupConfig.files == null) {
        groupConfig.files = finalConfig.files;
      }
      finalConfig.files = undefined;

      groupConfigs = [groupConfig];
    }
  }

  if (cliArgs.puppeteer) {
    if (finalConfig.browsers && finalConfig.browsers.length > 0) {
      throw new TestRunnerStartError(
        'The --puppeteer flag cannot be used when defining browsers manually in your finalConfig.',
      );
    }
    finalConfig.browsers = puppeteerLauncher(cliArgs.browsers);
  } else if (cliArgs.playwright) {
    if (finalConfig.browsers && finalConfig.browsers.length > 0) {
      throw new TestRunnerStartError(
        'The --playwright flag cannot be used when defining browsers manually in your finalConfig.',
      );
    }
    finalConfig.browsers = playwrightLauncher(cliArgs.browsers);
  } else {
    if (cliArgs.browsers != null) {
      throw new TestRunnerStartError(
        `The browsers option must be used along with the puppeteer or playwright option.`,
      );
    }

    // add default chrome launcher if the user did not configure their own browsers
    if (!finalConfig.browsers) {
      finalConfig.browsers = [chromeLauncher()];
    }
  }

  finalConfig.testFramework = {
    path: require.resolve('@web/test-runner-mocha/dist/autorun.js'),
    ...(finalConfig.testFramework ?? {}),
  };

  if (!finalConfig.reporters) {
    finalConfig.reporters = [defaultReporter()];
  }

  if (!finalConfig.logger) {
    finalConfig.logger = new TestRunnerLogger(config.debug);
  }

  if (finalConfig.plugins == null) {
    finalConfig.plugins = [];
  }

  // plugin with a noop transformImport hook, this will cause the dev server to analyze modules and
  // catch syntax errors. this way we still report syntax errors when the user has no flags enabled
  finalConfig.plugins.unshift({
    name: 'syntax-checker',
    transformImport() {
      return undefined;
    },
  });

  finalConfig.plugins.unshift(setViewportPlugin(), emulateMediaPlugin(), setUserAgentPlugin());

  if (finalConfig.nodeResolve) {
    const userOptions =
      typeof finalConfig.nodeResolve === 'object' ? finalConfig.nodeResolve : undefined;
    // do node resolve after user plugins, to allow user plugins to resolve imports
    finalConfig.plugins!.push(
      nodeResolvePlugin(finalConfig.rootDir!, finalConfig.preserveSymlinks, userOptions),
    );
  }

  if (finalConfig?.esbuildTarget) {
    finalConfig.plugins!.unshift(esbuildPlugin(finalConfig.esbuildTarget));
  }

  return { config: finalConfig, groupConfigs };
}
