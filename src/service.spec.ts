import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import { Service } from './service';
import type { ServiceOptions } from './types';
import axios from 'axios';
import FormData from 'form-data';
import { createReadStream } from 'fs';

import type { AxiosRequestConfig } from 'axios';

// Mock dependencies
jest.mock('axios'); // Mock axios first
jest.mock('fs', () => ({
  ...(jest.requireActual('fs') as object),
  createReadStream: jest.fn().mockReturnValue('mocked stream'),
}));

// Mock FormData module
const mockAppend = jest.fn();
const mockGetHeaders = jest.fn().mockReturnValue({ 'Content-Type': 'multipart/form-data' });
jest.mock('form-data', () => {
  return jest.fn().mockImplementation(() => {
    return {
      append: mockAppend,
      getHeaders: mockGetHeaders,
    };
  });
});

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedCreateReadStream = createReadStream as jest.Mock;
// After mocking, FormData is the mock constructor
const mockedFormData = FormData as jest.MockedClass<typeof FormData>; 

describe('Service', () => {
  // Define a base mockOptions that satisfies ServiceOptions
  const baseMockOptions: Omit<ServiceOptions, 'autoCreateTestCases'> = {
    projectKey: 'TEST_PROJECT',
    authorizationToken: 'TEST_TOKEN',
    testCycle: { // Ensure all required fields for TestCycle are present
      name: 'Test Cycle Name',
      description: 'Test Cycle Description',
      jiraProjectVersion: 1,
      folderId: 123,
      customFields: {},
    },
    nodeInternalTlsRejectUnauthorized: '0',
  };

  beforeEach(() => {
    // Clear all instances and calls to constructor and all methods:
    mockedAxios.mockClear();
    mockedCreateReadStream.mockClear();
    
    // Reset and re-configure FormData mock for each test
    // Clear mocks before each test
    mockedAxios.mockClear();
    mockedCreateReadStream.mockClear();
    // Clear the mock functions that are shared across FormData instances
    mockAppend.mockClear();
    mockGetHeaders.mockClear();
    // Reset FormData constructor mock calls, instances, etc.
    mockedFormData.mockClear(); 

    // Re-establish default mock return value for getHeaders for next test
    mockGetHeaders.mockReturnValue({ 'Content-Type': 'multipart/form-data' });


    // Mock default axios response for successful calls
    mockedAxios.mockResolvedValue({
      status: 200,
      data: { testCycle: { key: 'TC-123' } },
    } as any);
  });

  test("should include 'autoCreateTestCases=true' in URL when autoCreateTestCases is 'true'", async () => {
    const service = new Service({
      ...baseMockOptions,
      autoCreateTestCases: 'true',
    });
    await service.createTestCycle('path/to/results.json');
    
    expect(mockedAxios).toHaveBeenCalledTimes(1);
    const axiosCallArgs = mockedAxios.mock.calls[0]![0] as AxiosRequestConfig; 
    expect(axiosCallArgs.url).toContain('autoCreateTestCases=true');
    expect(axiosCallArgs.url).toContain(`projectKey=${baseMockOptions.projectKey}`);
    expect(mockedCreateReadStream).toHaveBeenCalledWith('path/to/results.json');
    expect(mockAppend).toHaveBeenCalledWith('file', 'mocked stream');
    expect(mockAppend).toHaveBeenCalledWith('testCycle', expect.any(String), { contentType: 'application/json' });
    expect(mockGetHeaders).toHaveBeenCalledTimes(1); // As it's called by axios
  });

  test("should include 'autoCreateTestCases=false' in URL when autoCreateTestCases is 'false'", async () => {
    const service = new Service({
      ...baseMockOptions,
      autoCreateTestCases: 'false',
    });
    await service.createTestCycle('path/to/another-results.json');

    expect(mockedAxios).toHaveBeenCalledTimes(1);
    const axiosCallArgs = mockedAxios.mock.calls[0]![0] as AxiosRequestConfig;
    expect(axiosCallArgs.url).toContain('autoCreateTestCases=false');
    expect(axiosCallArgs.url).toContain(`projectKey=${baseMockOptions.projectKey}`);
    expect(mockedCreateReadStream).toHaveBeenCalledWith('path/to/another-results.json');
    expect(mockAppend).toHaveBeenCalledWith('file', 'mocked stream');
    expect(mockAppend).toHaveBeenCalledWith('testCycle', expect.any(String), { contentType: 'application/json' });
    expect(mockGetHeaders).toHaveBeenCalledTimes(1);
  });

  test('should handle axios error correctly when creating test cycle', async () => {
    const service = new Service({
      ...baseMockOptions,
      autoCreateTestCases: 'true',
    });

    // Create an error object that is an instance of Error and has isAxiosError = true
    const axiosErrorInstance = new Error("Simulated Axios Error") as any;
    axiosErrorInstance.isAxiosError = true;
    axiosErrorInstance.response = { 
        status: 500, 
        headers: { 'content-type': 'application/json' }, 
        data: { message: 'Internal Server Error' }, 
        config: {} as AxiosRequestConfig, 
        statusText: "Internal Server Error" 
    };
    axiosErrorInstance.config = { url: 'http://test-url' };
    axiosErrorInstance.toJSON = () => ({ message: 'Axios error object for JSON' });
    
    mockedAxios.mockRejectedValue(axiosErrorInstance);

    // Expect the specific error message structure from handleAxiosError
    // Using a regex to match multi-line error messages and specific parts.
    await expect(service.createTestCycle('path/to/error-results.json')).rejects.toThrowError(
      /Status: 500[\s\S]*Data: { message: 'Internal Server Error' }/
    );
  });

  test('should handle non-axios error when creating test cycle', async () => {
    const service = new Service({
      ...baseMockOptions,
      autoCreateTestCases: 'true',
    });

    const genericError = new Error('Network Error'); // This is a simple Error instance
    mockedAxios.mockRejectedValue(genericError);

    // The error message thrown by Service.ts for non-Axios errors is `\nUnknown error: ${error}`
    // where ${error} will be the string representation of genericError (e.g., "Error: Network Error")
    await expect(service.createTestCycle('path/to/generic-error-results.json')).rejects.toThrowError(
      `\nUnknown error: ${genericError.toString()}`
    );
  });
});
