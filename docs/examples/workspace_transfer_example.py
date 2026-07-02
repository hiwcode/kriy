"""
Example script demonstrating workspace resource transfer.

This script shows how to transfer resources between workspaces using the API.
"""

import requests
from typing import Optional

# Configuration
API_BASE_URL = "http://localhost:8000/api/v1"
API_KEY = "your-api-key-here"  # Replace with your actual API key


class WorkspaceTransferClient:
    """Client for transferring resources between workspaces."""
    
    def __init__(self, api_key: str, base_url: str = API_BASE_URL):
        self.api_key = api_key
        self.base_url = base_url
        self.headers = {
            "Content-Type": "application/json",
            "X-API-Key": api_key,
        }
    
    def list_workspaces(self):
        """List all workspaces the user has access to."""
        response = requests.get(
            f"{self.base_url}/workspaces/",
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()
    
    def transfer_resources(
        self,
        source_workspace_id: int,
        target_workspace_id: int,
        resource_type: str,
        resource_ids: Optional[list[int]] = None
    ):
        """
        Transfer resources from one workspace to another.
        
        Args:
            source_workspace_id: Source workspace ID
            target_workspace_id: Target workspace ID
            resource_type: Type of resources (agents, prompts, mcp_connections, database_connections, all)
            resource_ids: Optional list of specific resource IDs to transfer
        """
        payload = {
            "source_workspace_id": source_workspace_id,
            "target_workspace_id": target_workspace_id,
            "resource_type": resource_type,
        }
        
        if resource_ids is not None:
            payload["resource_ids"] = resource_ids
        
        response = requests.post(
            f"{self.base_url}/workspaces/transfer",
            headers=self.headers,
            json=payload
        )
        response.raise_for_status()
        return response.json()


def main():
    """Example usage of the workspace transfer client."""
    
    # Initialize the client
    client = WorkspaceTransferClient(API_KEY)
    
    # List available workspaces
    print("Fetching workspaces...")
    workspaces_response = client.list_workspaces()
    workspaces = workspaces_response.get("data", [])
    
    print("\nAvailable workspaces:")
    for ws in workspaces:
        ws_type = "Personal" if ws.get("is_personal") else "Shared"
        print(f"  - ID: {ws['id']}, Name: {ws['name']}, Type: {ws_type}")
    
    # Example 1: Transfer all agents from personal to a team workspace
    if len(workspaces) >= 2:
        personal_ws = next((ws for ws in workspaces if ws.get("is_personal")), None)
        team_ws = next((ws for ws in workspaces if not ws.get("is_personal")), None)
        
        if personal_ws and team_ws:
            print(f"\n--- Example 1: Transfer all agents ---")
            print(f"From: {personal_ws['name']} (ID: {personal_ws['id']})")
            print(f"To: {team_ws['name']} (ID: {team_ws['id']})")
            
            result = client.transfer_resources(
                source_workspace_id=personal_ws["id"],
                target_workspace_id=team_ws["id"],
                resource_type="agents"
            )
            
            print(f"Result: {result['message']}")
            print(f"Details: {result['data']}")
    
    # Example 2: Transfer specific prompts
    # Assuming you know the prompt IDs you want to transfer
    specific_prompt_ids = [1, 2, 3]  # Replace with actual IDs
    
    if len(workspaces) >= 2:
        print(f"\n--- Example 2: Transfer specific prompts ---")
        print(f"Transferring prompt IDs: {specific_prompt_ids}")
        
        result = client.transfer_resources(
            source_workspace_id=workspaces[0]["id"],
            target_workspace_id=workspaces[1]["id"],
            resource_type="prompts",
            resource_ids=specific_prompt_ids
        )
        
        print(f"Result: {result['message']}")
        print(f"Details: {result['data']}")
    
    # Example 3: Transfer all resources
    if len(workspaces) >= 2:
        print(f"\n--- Example 3: Transfer all resources ---")
        
        result = client.transfer_resources(
            source_workspace_id=workspaces[0]["id"],
            target_workspace_id=workspaces[1]["id"],
            resource_type="all"
        )
        
        print(f"Result: {result['message']}")
        print(f"Details: {result['data']}")
        print(f"  - Agents transferred: {result['data']['transferred_agents']}")
        print(f"  - Prompts transferred: {result['data']['transferred_prompts']}")
        print(f"  - MCP connections transferred: {result['data']['transferred_mcp_connections']}")
        print(f"  - Database connections transferred: {result['data']['transferred_database_connections']}")
        print(f"  - Total: {result['data']['total_transferred']}")


if __name__ == "__main__":
    try:
        main()
    except requests.exceptions.HTTPError as e:
        print(f"HTTP Error: {e}")
        print(f"Response: {e.response.text}")
    except Exception as e:
        print(f"Error: {e}")
