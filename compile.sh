#!/bin/bash
echo "🔥 BUILD STARTED"
echo "Current dir: $(pwd)"
ls -la

echo "📦 Compiling Activity.cpp..."
g++ -o activity Activity.cpp -std=c++11

if [ -f "activity" ]; then
    chmod +x activity
    echo "✅ SUCCESS: activity created"
    ls -la activity
else
    echo "❌ FAILED: activity not created"
    exit 1
fi