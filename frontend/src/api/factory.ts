import type { ApiClient } from "../types/domain";
import { RestStoryNetApiClient } from "./restClient";

let singletonClient: ApiClient | null = null;

export function createApiClient(): ApiClient {
  if (singletonClient) {
    return singletonClient;
  }

  singletonClient = new RestStoryNetApiClient();

  return singletonClient;
}

export const apiClient = createApiClient();
