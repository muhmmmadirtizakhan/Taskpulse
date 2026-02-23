#!/bin/bash
echo "🔥 BUILD STARTED"
echo "Current dir: $(pwd)"
ls -la

echo "📦 Compiling activity.cpp..."
if [ -f "activity.cpp" ]; then
    g++ -o activity activity.cpp -std=c++11
else
    echo "⚠️ activity.cpp not found, attempting case-insensitive search..."
    found=$(ls | grep -i "activity.*\.cpp" | head -n 1)
    if [ -n "$found" ]; then
        echo "🔎 Found source: $found — compiling"
        g++ -o activity "$found" -std=c++11
    else
        echo "❌ FAILED: No activity C++ source found"
        exit 1
    fi
fi

if [ -f "activity" ]; then
    chmod +x activity
    echo "✅ SUCCESS: activity created"
    ls -la activity
else
    echo "❌ FAILED: activity not created"
    exit 1
fi