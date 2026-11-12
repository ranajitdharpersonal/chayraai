
import boto3
from dotenv import load_dotenv
import os

load_dotenv(".env.local")

region = os.getenv("AWS_REGION", "us-east-1")

client = boto3.client(
    "bedrock-runtime",
    region_name=region
)

try:
    response = client.converse(
        modelId="us.amazon.nova-lite-v1:0",
        messages=[
            {
                "role": "user",
                "content": [
                    {"text": "Reply with exactly one word: OK"}
                ]
            }
        ],
        inferenceConfig={"maxTokens": 80}
    )

    print("\nSUCCESS!")
    print(response["output"]["message"]["content"][0]["text"])

except Exception as e:
    print("\nINFERENCE FAILED!")
    print(type(e).__name__, e)
