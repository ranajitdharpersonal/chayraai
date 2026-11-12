
import os
import boto3
from dotenv import load_dotenv

load_dotenv(".env.local")

region = (
    os.getenv("AWS_REGION")
    or os.getenv("AWS_DEFAULT_REGION")
    or "us-east-1"
)

print(f"\nAWS Region: {region}")
client = boto3.client("bedrock", region_name=region)

try:
    print("\n========== FOUNDATION MODELS ==========\n")

    response = client.list_foundation_models()

    for model in response.get("modelSummaries", []):
        print(
            f"{model.get('providerName')} | "
            f"{model.get('modelName')} | "
            f"{model.get('modelId')} | "
            f"Status: {model.get('modelLifecycle', {}).get('status')} | "
            f"Inference: {model.get('inferenceTypesSupported')}"
        )

    print("\n========== INFERENCE PROFILES ==========\n")

    paginator = client.get_paginator("list_inference_profiles")

    for page in paginator.paginate():
        for profile in page.get("inferenceProfileSummaries", []):
            print(
                f"{profile.get('inferenceProfileName')} | "
                f"{profile.get('inferenceProfileId')} | "
                f"Status: {profile.get('status')} | "
                f"Type: {profile.get('type')}"
            )

except Exception as e:
    print(f"\nAWS ERROR: {type(e).__name__}: {e}")
