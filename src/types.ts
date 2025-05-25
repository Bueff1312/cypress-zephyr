export type ZephyrStatus = 'Pass' | 'Fail' | 'Pending' | 'Blocked' | 'Not Executed' | 'In Progress';

export type ZephyrTestResult = {
  result: ZephyrStatus;
  testCase: {
    key: string;
    comment: string | undefined;
  };
};

export type ServiceOptions = {
  projectKey: string;
  authorizationToken: string;
  testCycle: TestCycle;
  autoCreateTestCases: 'true' | 'false';
  nodeInternalTlsRejectUnauthorized: '0' | '1';
  createTestPlan?: boolean;
  testPlanName?: string;
  testPlanFolderId?: number;
};

export interface TestPlan {
  id: number;
  key: string;
  projectKey: string;
  name: string;
  description?: string;
  folderId?: number;
}

export type TestCycle = {
  name: string;
  description: string;
  jiraProjectVersion: number;
  folderId: number;
  customFields: {
    [key: string]: string;
  };
};
