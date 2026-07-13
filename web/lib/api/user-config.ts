import { apiFetch } from "./client";
import { toast } from "sonner";

export interface UserConfig {
  user_id: number;
  google_api_key: string | null;
  openai_api_key: string | null;
  anthropic_api_key: string | null;
  default_model: string | null;
  opik_api_key: string | null;
  opik_workspace: string | null;
  opik_project_name: string | null;
  opik_url_override: string | null;
  opik_enabled: boolean | null;
  slack_bot_token: string | null;
  slack_signing_secret: string | null;
  slack_app_token: string | null;
  slack_bot_user_id: string | null;
  slack_default_channel: string | null;
  slack_default_agent_id: number | null;
  slack_enabled: boolean | null;
  gmail_address: string | null;
  gmail_app_password: string | null;
  // Secrets are write-only: the API returns `null` for the value and a
  // `<field>_set` boolean so the UI can show "configured" without exposing it.
  google_api_key_set?: boolean;
  openai_api_key_set?: boolean;
  anthropic_api_key_set?: boolean;
  opik_api_key_set?: boolean;
  slack_bot_token_set?: boolean;
  slack_signing_secret_set?: boolean;
  slack_app_token_set?: boolean;
  gmail_app_password_set?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface UserConfigUpdate {
  google_api_key?: string | null;
  openai_api_key?: string | null;
  anthropic_api_key?: string | null;
  default_model?: string | null;
  opik_api_key?: string | null;
  opik_workspace?: string | null;
  opik_project_name?: string | null;
  opik_url_override?: string | null;
  opik_enabled?: boolean | null;
  slack_bot_token?: string | null;
  slack_signing_secret?: string | null;
  slack_app_token?: string | null;
  slack_bot_user_id?: string | null;
  slack_default_channel?: string | null;
  slack_default_agent_id?: number | null;
  slack_enabled?: boolean | null;
  gmail_address?: string | null;
  gmail_app_password?: string | null;
}

export interface ApiKeyInfo {
  key_prefix: string | null;
  created_at: string | null;
}

export interface ApiKeyGenerated {
  api_key: string;
  key_prefix: string;
}

export async function getUserConfig(): Promise<UserConfig> {
  const response = await apiFetch<UserConfig>("/api/v1/user-config/");
  return response.data!;
}

export async function updateUserConfig(data: UserConfigUpdate): Promise<UserConfig> {
  try {
    const response = await apiFetch<UserConfig>("/api/v1/user-config/", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    toast.success("Settings saved");
    return response.data!;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to save settings");
    throw error;
  }
}

export async function getApiKeyInfo(): Promise<ApiKeyInfo> {
  const response = await apiFetch<ApiKeyInfo>("/api/v1/user-config/api-key");
  return response.data!;
}

export async function generateApiKey(): Promise<ApiKeyGenerated> {
  try {
    const response = await apiFetch<ApiKeyGenerated>("/api/v1/user-config/api-key/generate", {
      method: "POST",
    });
    toast.success("API key generated");
    return response.data!;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to generate API key");
    throw error;
  }
}

export async function revokeApiKey(): Promise<void> {
  try {
    await apiFetch("/api/v1/user-config/api-key", {
      method: "DELETE",
    });
    toast.success("API key revoked");
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to revoke API key");
    throw error;
  }
}
