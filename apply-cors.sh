#!/bin/bash

# Target bucket specified in the request
BUCKET="gs://gen-lang-client-0493195631.appspot.com"

echo "Applying CORS rules to $BUCKET..."
gsutil cors set cors.json $BUCKET

echo ""
echo "Verifying applied CORS rules:"
gsutil cors get $BUCKET
