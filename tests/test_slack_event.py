#!/usr/bin/env python
"""Test Slack event endpoint"""
import json
import hmac
import hashlib
import time
import requests

# Slack credentials (from your app)
SIGNING_SECRET = ""
BACKEND_URL = "http://localhost:8000"
SLACK_ENDPOINT = f"{BACKEND_URL}/api/v1/slack/events"

def create_slack_signature(body: bytes, timestamp: str, signing_secret: str) -> str:
    """Create Slack signature for request verification"""
    base_string = f"v0:{timestamp}:{body.decode('utf-8')}"
    signature = hmac.new(
        signing_secret.encode(),
        base_string.encode(),
        hashlib.sha256
    ).hexdigest()
    return f"v0={signature}"

def test_slack_event():
    """Send test Slack event"""
    
    # Slack event payload (simulating a message)
    event_payload = {
        "token": "token",
        "team_id": "",
        "event_id": "",
        "event": {
            "type": "",
            "channel": "",
            "user": "",
            "text": "",
            "ts": ""
        },
        "type": "",
        "event_ts": ""
    }
    
    # Serialize payload
    body = json.dumps(event_payload).encode('utf-8')
    timestamp = str(int(time.time()))
    
    # Create signature
    signature = create_slack_signature(body, timestamp, SIGNING_SECRET)
    
    # Send request
    headers = {
        "X-Slack-Signature": signature,
        "X-Slack-Request-Timestamp": timestamp,
        "Content-Type": "application/json"
    }
    
    print(f"Sending test event to {SLACK_ENDPOINT}")
    print(f"Signature: {signature}")
    print(f"Timestamp: {timestamp}")
    print(f"Payload: {json.dumps(event_payload, indent=2)}")
    
    try:
        response = requests.post(SLACK_ENDPOINT, data=body, headers=headers)
        print(f"\n✓ Status Code: {response.status_code}")
        print(f"Response: {response.text}")
    except Exception as e:
        print(f"✗ Error: {e}")

if __name__ == "__main__":
    test_slack_event()
