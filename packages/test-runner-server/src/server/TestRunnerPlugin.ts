import { Plugin } from '@web/dev-server-core';
import { BasicTestSession } from '@web/test-runner-core';

export type ExecuteCommandResult = void | unknown | Promise<void> | Promise<unknown>;

export interface ExecuteCommandArgs {
  command: string;
  payload?: unknown;
  session: BasicTestSession;
}

export interface TestRunnerPlugin extends Plugin {
  executeCommand?(args: ExecuteCommandArgs): ExecuteCommandResult;
}