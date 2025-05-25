import type { PathLike } from 'node:fs';
import type { AxiosError, AxiosRequestConfig } from 'axios';
import type { TestCycle, ServiceOptions, TestPlan } from './types';

import axios from 'axios';
import { inspect } from 'util';
import { createReadStream } from 'fs';
import FormData from 'form-data';
import { printReport } from './terminal-reporter';

function isAxiosError(error: unknown): error is AxiosError {
  return error instanceof Error && 'isAxiosError' in error;
}

export class Service {
  private readonly authorizationToken: string;
  private readonly projectKey: string;
  private readonly testCycle: TestCycle | undefined;
  private readonly autoCreateTestCases: boolean;
  private readonly testPlanName: string | undefined;
  private readonly testPlanFolderId: number | undefined;
  private readonly createTestPlanEnabled: boolean;
  private readonly url = 'https://api.zephyrscale.smartbear.com/v2';
  private readonly defaultRunName = `Cypress run - [${new Date().toUTCString()}]`;
  private readonly defaultTestPlanName = `Test Plan - [${new Date().toUTCString()}]`;

  constructor(options: ServiceOptions) {
    this.projectKey = options.projectKey;
    this.authorizationToken = options.authorizationToken!;
    this.testCycle = options.testCycle;
    this.autoCreateTestCases = options.autoCreateTestCases === 'true';
    this.testPlanName = options.testPlanName;
    this.testPlanFolderId = options.testPlanFolderId;
    this.createTestPlanEnabled = !!options.createTestPlan;
  }

  async createTestPlan(): Promise<TestPlan> {
    const url = `${this.url}/testplans`;
    const requestBody: {
      projectKey: string;
      name: string;
      folderId?: number;
      // description?: string; // Not adding description for now as it's not in ServiceOptions yet
    } = {
      projectKey: this.projectKey,
      name: this.testPlanName || this.defaultTestPlanName,
    };

    if (this.testPlanFolderId) {
      requestBody.folderId = this.testPlanFolderId;
    }

    try {
      const response = await axios({
        url,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.authorizationToken}`,
          'Content-Type': 'application/json',
        },
        data: requestBody,
      } as AxiosRequestConfig); // Added type assertion for config

      // Assuming status 201 for successful creation as is common for POST
      if (response.status !== 201) { 
        throw new Error(
          `[zephyr reporter]: Failed to create test plan due to ${response.status} ${response.statusText}\nResponse: ${JSON.stringify(response.data)}`,
        );
      }
      // Assuming the response data directly matches the TestPlan interface
      return response.data as TestPlan;
    } catch (error) {
      this.handleAxiosError(error);
      // handleAxiosError throws, but to satisfy TypeScript's need for a return path:
      throw error; 
    }
  }

  async createTestCycle(testResults: PathLike) {
    const url = `${this.url}/automations/executions/custom?projectKey=${this.projectKey}&autoCreateTestCases=${this.autoCreateTestCases}`;
    const data = new FormData();
    const testCycleDefault = {
      name: this.defaultRunName,
      ...this.testCycle,
    };

    data.append('file', createReadStream(testResults));
    data.append('testCycle', JSON.stringify(testCycleDefault), { contentType: 'application/json' });

    try {
      const response = await axios({
        url,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.authorizationToken}`,
          ...data.getHeaders(),
        },
        data,
      });

      if (response.status !== 200)
        throw new Error(
          `[zephyr reporter]: Failed to create test cycle due to ${response.status} ${response.statusText}\n`,
        );

      const {
        data: { testCycle },
      } = response;

      printReport(testCycle); // testCycle is the actual object like { key: '...', ...}

      // >>> NEW INTEGRATION LOGIC STARTS HERE <<<
      if (this.createTestPlanEnabled) {
        console.log('[zephyr reporter]: createTestPlan option is enabled. Creating test plan...');
        try {
          const testPlan = await this.createTestPlan();
          console.log(`[zephyr reporter]: Successfully created test plan: ${testPlan.key} - ${testPlan.name}`);

          // The 'testCycle' variable from destructuring above holds the created test cycle object
          const testCycleKey = testCycle?.key; 
          if (testCycleKey) {
            console.log(`[zephyr reporter]: Linking test cycle ${testCycleKey} to test plan ${testPlan.key}...`);
            await this.linkTestCycleToTestPlan(testPlan.key, testCycleKey);
            // The linkTestCycleToTestPlan method already logs success
          } else {
            console.error('[zephyr reporter]: Could not find testCycleKey to link to test plan. The created test cycle data did not have a key.');
          }
        } catch (planError) {
          console.error(`[zephyr reporter]: Error during test plan creation or linking: ${planError}`);
          // Optionally, decide if this error should be re-thrown or handled by this.handleAxiosError
          // For now, logging the error and allowing the original test cycle creation data to be returned.
          // If planError is an Axios error and needs specific handling:
          // if (axios.isAxiosError(planError)) {
          //   this.handleAxiosError(planError); // This would throw, might be too aggressive
          // }
        }
      }
      // >>> NEW INTEGRATION LOGIC ENDS HERE <<<

      return response.data; // Return the original test cycle creation response data
    } catch (error) {
      this.handleAxiosError(error);
      // For createTestCycle, if the primary operation (test cycle creation) fails,
      // handleAxiosError will throw, and nothing will be returned, which is correct.
      // To satisfy TypeScript about all paths returning a value (or throwing):
      throw error;
    }
  }

  handleAxiosError(error: unknown): void {
    if (isAxiosError(error)) {
      console.error(`Config: ${inspect(error.config)}`);

      if (error.response) {
        throw new Error(
          `\nStatus: ${error.response.status} \nHeaders: ${inspect(error.response.headers)} \nData: ${inspect(
            error.response.data,
          )}`,
        );
      } else if (error.request) {
        throw new Error(`The request was made but no response was received. \n Error: ${inspect(error.toJSON())}`);
      } else {
        throw new Error(
          `Something happened in setting up the request that triggered an Error\n : ${inspect(error.message)}`,
        );
      }
    }

    throw new Error(`\nUnknown error: ${error}`);
  }

  async linkTestCycleToTestPlan(testPlanKey: string, testCycleKey: string): Promise<any> {
    const url = `${this.url}/testplans/${testPlanKey}/testcycles`;
    const requestBody = {
      testCycleKeys: [testCycleKey],
    };

    try {
      const response = await axios({
        url,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.authorizationToken}`,
          'Content-Type': 'application/json',
        },
        data: requestBody,
      } as AxiosRequestConfig);

      // Assuming a 200 or 201 or 204 status for successful linking.
      // For simplicity, checking if status is not in the 200-299 range.
      if (response.status < 200 || response.status >= 300) {
        throw new Error(
          `[zephyr reporter]: Failed to link test cycle ${testCycleKey} to test plan ${testPlanKey} due to ${response.status} ${response.statusText}\nResponse: ${JSON.stringify(response.data)}`,
        );
      }

      console.log(`[zephyr reporter]: Successfully linked test cycle ${testCycleKey} to test plan ${testPlanKey}.`);
      return response.data; // Return response data, which might be empty or a confirmation
    } catch (error) {
      this.handleAxiosError(error);
      // handleAxiosError throws, but to satisfy TypeScript's need for a return path:
      throw error;
    }
  }
}
