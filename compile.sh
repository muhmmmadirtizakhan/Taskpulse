#!/bin/bash
echo "🚀 Compiling Activity.cpp for Linux..."
g++ -o activity Activity.cpp -std=c++11 -static-libstdc++
chmod +x activity
echo "✅ Compiled! Size: $(ls -lh activity | awk '{print $5}')"