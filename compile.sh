#!/bin/bash
echo "📦 Compiling Activity.cpp..."
g++ -o activity Activity.cpp -std=c++11
chmod +x activity
echo "✅ Compilation done!"