#include <iostream>
#include <string>
#include <vector>
#include <fstream>
#include <chrono>
#include <iomanip>
#include <sstream>
#include <stack>

using namespace std;

string getCurrentTime() {
    auto now = chrono::system_clock::now();
    auto time = chrono::system_clock::to_time_t(now);
    stringstream ss;
    ss << put_time(localtime(&time), "%Y-%m-%d %H:%M:%S");
    return ss.str();
}

struct Activity {
    string id;
    string title;
    string category;
    string description;
    string priority;
    string status;
    int score;
    string userId;
    string timestamp;
};

vector<Activity> activities;
stack<Activity> undoStack;
stack<Activity> redoStack;
stack<pair<Activity, Activity>> updateUndoStack;

// 🔥 PERMANENT DELETE STACK
stack<Activity> permanentDeleteStack;

// Add activity
void addActivity(Activity act) {
    activities.push_back(act);
    cout << "✅ ADDED: " << act.title << endl;
    
    while(!redoStack.empty()) {
        redoStack.pop();
    }
}

// Update activity
void updateActivity(string activityId, Activity newAct, Activity oldAct) {
    for (auto &activity : activities) {
        if (activity.id == activityId) {
            updateUndoStack.push({activity, newAct});
            activity = newAct;
            activity.timestamp = getCurrentTime();
            
            cout << "📝 UPDATED: " << oldAct.title << " → " << newAct.title << endl;
            
            while(!redoStack.empty()) {
                redoStack.pop();
            }
            
            return;
        }
    }
    cout << "❌ UPDATE FAILED: Activity not found - " << activityId << endl;
}

// Undo last update
void undoUpdate() {
    if (updateUndoStack.empty()) {
        cout << "❌ NO UPDATES TO UNDO" << endl;
        return;
    }
    
    auto [oldAct, newAct] = updateUndoStack.top();
    updateUndoStack.pop();
    
    for (auto &activity : activities) {
        if (activity.id == oldAct.id) {
            activity = oldAct;
            cout << "↩️  UPDATE UNDONE: " << newAct.title << " → " << oldAct.title << endl;
            return;
        }
    }
}

// Delete activity by ID
void deleteActivity(string activityId) {
    for (auto it = activities.begin(); it != activities.end(); ++it) {
        if (it->id == activityId) {
            undoStack.push(*it);
            
            while(!redoStack.empty()) {
                redoStack.pop();
            }
            
            activities.erase(it);
            cout << "🗑️  DELETED (to undo stack): " << activityId << " - " << it->title << endl;
            return;
        }
    }
    cout << "❌ DELETE FAILED: Activity not found - " << activityId << endl;
}

// 🔥🔥🔥 PERMANENT DELETE FUNCTION
void permanentDeleteActivity(string activityId) {
    for (auto it = activities.begin(); it != activities.end(); ++it) {
        if (it->id == activityId) {
            // Store in permanent delete stack for logging
            permanentDeleteStack.push(*it);
            
            // Remove from undo stack if present
            stack<Activity> tempUndoStack;
            while (!undoStack.empty()) {
                if (undoStack.top().id != activityId) {
                    tempUndoStack.push(undoStack.top());
                }
                undoStack.pop();
            }
            
            // Restore remaining undo items
            while (!tempUndoStack.empty()) {
                undoStack.push(tempUndoStack.top());
                tempUndoStack.pop();
            }
            
            // Remove from redo stack if present
            stack<Activity> tempRedoStack;
            while (!redoStack.empty()) {
                if (redoStack.top().id != activityId) {
                    tempRedoStack.push(redoStack.top());
                }
                redoStack.pop();
            }
            
            // Restore remaining redo items
            while (!tempRedoStack.empty()) {
                redoStack.push(tempRedoStack.top());
                tempRedoStack.pop();
            }
            
            // Permanently remove from activities
            cout << "🔥 PERMANENT DELETE: " << activityId << " - " << it->title << " (CANNOT BE UNDONE)" << endl;
            activities.erase(it);
            return;
        }
    }
    cout << "❌ PERMANENT DELETE FAILED: Activity not found - " << activityId << endl;
}

// Undo last delete
void undoDelete() {
    if (undoStack.empty()) {
        cout << "❌ NOTHING TO UNDO" << endl;
        return;
    }
    
    Activity lastDeleted = undoStack.top();
    undoStack.pop();
    
    redoStack.push(lastDeleted);
    
    activities.push_back(lastDeleted);
    cout << "↩️  UNDO DELETE: " << lastDeleted.title << " restored" << endl;
}

// Redo delete
void redoDelete() {
    if (redoStack.empty()) {
        cout << "❌ NOTHING TO REDO" << endl;
        return;
    }
    
    Activity lastUndone = redoStack.top();
    redoStack.pop();
    
    bool found = false;
    for (auto it = activities.begin(); it != activities.end(); ++it) {
        if (it->id == lastUndone.id) {
            undoStack.push(*it);
            activities.erase(it);
            found = true;
            cout << "↪️  REDO DELETE: " << lastUndone.title << " deleted again" << endl;
            break;
        }
    }
    
    if (!found) {
        cout << "⚠️  Activity not found for redo: " << lastUndone.title << endl;
    }
}

// Display all activities
void displayActivities() {
    cout << "\n📋 TOTAL ACTIVITIES: " << activities.size() << endl;
    cout << "════════════════════════════════════════\n";
    
    for (const auto& act : activities) {
        cout << "ID: " << act.id << " | " << act.title 
             << " [" << act.category << ", " << act.priority 
             << ", Score: " << act.score << "]" << endl;
    }
    
    cout << "\n📊 STACK STATS:" << endl;
    cout << "↩️  UNDO DELETE STACK: " << undoStack.size() << " items" << endl;
    cout << "↪️  REDO DELETE STACK: " << redoStack.size() << " items" << endl;
    cout << "📝 UPDATE UNDO STACK: " << updateUndoStack.size() << " items" << endl;
    cout << "🔥 PERMANENT DELETED: " << permanentDeleteStack.size() << " items" << endl;
    
    // Show permanently deleted activities
    if (!permanentDeleteStack.empty()) {
        cout << "\n🔥 PERMANENTLY DELETED ACTIVITIES (CANNOT BE RECOVERED):" << endl;
        stack<Activity> temp = permanentDeleteStack;
        while (!temp.empty()) {
            cout << "   - " << temp.top().title << " (ID: " << temp.top().id << ")" << endl;
            temp.pop();
        }
    }
}

int main(int argc, char* argv[]) {
    
    cout << "\n═══════════════════════════════════════════════════\n";
    cout << "           TASKPULSE - ACTIVITY MANAGER           \n";
    cout << "═══════════════════════════════════════════════════\n";
    cout << "Time: " << getCurrentTime() << endl;
    
    if (argc < 2) {
        cout << "\nCommands:\n";
        cout << "  add \"ID\" \"Title\" \"Category\" \"Priority\" \"Score\" \"Description\" \"Status\" \"UserID\"\n";
        cout << "  update \"ID\" \"NewTitle\" \"NewCategory\" \"NewPriority\" \"NewScore\" \"NewDesc\" \"NewStatus\" \"UserID\" \"OldTitle\" \"OldCategory\" \"OldPriority\" \"OldScore\" \"OldDesc\" \"OldStatus\"\n";
        cout << "  delete \"ActivityID\"\n";
        cout << "  permanent-delete \"ActivityID\"\n";  // 🔥 NEW COMMAND
        cout << "  undo\n";
        cout << "  redo\n";
        cout << "  display\n";
        return 0;
    }
    
    string command = argv[1];
    
    if (command == "add" && argc >= 10) {
        Activity newAct;
        newAct.id = argv[2];
        newAct.title = argv[3];
        newAct.category = argv[4];
        newAct.priority = argv[5];
        newAct.score = atoi(argv[6]);
        newAct.description = argv[7];
        newAct.status = argv[8];
        newAct.userId = argv[9];
        newAct.timestamp = getCurrentTime();
        
        addActivity(newAct);
        
    } else if (command == "update" && argc >= 16) {
        Activity newAct, oldAct;
        
        newAct.id = argv[2];
        newAct.title = argv[3];
        newAct.category = argv[4];
        newAct.priority = argv[5];
        newAct.score = atoi(argv[6]);
        newAct.description = argv[7];
        newAct.status = argv[8];
        newAct.userId = argv[9];
        newAct.timestamp = getCurrentTime();
        
        oldAct.id = argv[2];
        oldAct.title = argv[10];
        oldAct.category = argv[11];
        oldAct.priority = argv[12];
        oldAct.score = atoi(argv[13]);
        oldAct.description = argv[14];
        oldAct.status = argv[15];
        oldAct.userId = argv[9];
        
        updateActivity(argv[2], newAct, oldAct);
        
    } else if (command == "delete" && argc >= 3) {
        deleteActivity(argv[2]);
        
    } else if (command == "permanent-delete" && argc >= 3) {
        permanentDeleteActivity(argv[2]);
        
    } else if (command == "undo") {
        if (!undoStack.empty()) {
            undoDelete();
        } else if (!updateUndoStack.empty()) {
            undoUpdate();
        } else {
            cout << "❌ NOTHING TO UNDO" << endl;
        }
        
    } else if (command == "redo") {
        redoDelete();
        
    } else if (command == "display") {
        displayActivities();
        
    } else {
        cout << "❌ INVALID COMMAND" << endl;
    }
    
    cout << "\n📊 STATS - Activities: " << activities.size() 
         << " | Undo Stack: " << undoStack.size() 
         << " | Redo Stack: " << redoStack.size() 
         << " | Permanent Deleted: " << permanentDeleteStack.size() << endl;
    cout << "═══════════════════════════════════════════════════\n\n";
    
    return 0;
}