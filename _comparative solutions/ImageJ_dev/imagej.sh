#!/bin/bash

# Change directory to the script's location
cd "$(dirname "$0")" || { echo "Failed to change directory"; exit 1; }

# Run the JAR file
java -Xmx512m -jar ij.jar -ijpath "$(pwd)" || { echo "Failed to start ij.jar"; exit 1; }
