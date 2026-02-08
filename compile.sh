#!/bin/bash
echo "Compiling Activity.cpp for Linux..."
g++ -o activity Activity.cpp -std=c++11
echo "Linux executable created: ./activity"