#include <iostream>
#include <string>
#include <vector>
#include <fstream>
#include <chrono>
#include <iomanip>
#include <sstream>
#include <stack>
#include <queue>  // 👈 QUEUE INCLUDE KARO

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

// 🔥 NOTIFICATION STRUCT FOR QUEUE
struct Notification {
    string message;
    string type;        // "ADD", "UPDATE", "DELETE", "PERMANENT_DELETE"
    string activityId;
    string timestamp;
    
    Notification(string msg, string t, string id) 
        : message(msg), type(t), activityId(id), timestamp(getCurrentTime()) {}
};

// 🔥 Node structure for linked list
struct Node {
    Activity data;
    Node* next;
    
    Node(Activity act) : data(act), next(nullptr) {}
};

// 🔥 Linked list head
Node* head = nullptr;
int activityCount = 0;

// 📚 STACKS
stack<Activity> undoStack;
stack<Activity> redoStack;
stack<pair<Activity, Activity>> updateUndoStack;
stack<Activity> permanentDeleteStack;

// 📋 QUEUE - NOTIFICATION SYSTEM
queue<Notification> notificationQueue;

// Function to add notification
void addNotification(string message, string type, string activityId) {
    Notification notif(message, type, activityId);
    notificationQueue.push(notif);
    cout << "🔔 NOTIFICATION QUEUED: " << message << endl;
}

// Function to process notifications (FIFO)
void processNotifications() {
    if (notificationQueue.empty()) {
        cout << "📭 No notifications in queue" << endl;
        return;
    }
    
    cout << "\n📨 PROCESSING NOTIFICATIONS (FIFO ORDER):" << endl;
    cout << "════════════════════════════════════════\n";
    
    int count = 1;
    while (!notificationQueue.empty()) {
        Notification notif = notificationQueue.front();
        notificationQueue.pop();
        
        cout << count++ << ". [" << notif.timestamp << "] ";
        cout << "[" << notif.type << "] ";
        cout << notif.message << " (ID: " << notif.activityId << ")" << endl;
    }
    cout << "════════════════════════════════════════\n";
}

// Add activity
void addActivity(Activity act) {
    Node* newNode = new Node(act);
    newNode->next = head;
    head = newNode;
    activityCount++;
    
    cout << "✅ ADDED: " << act.title << endl;
    addNotification("Activity added: " + act.title, "ADD", act.id);
    
    while(!redoStack.empty()) {
        redoStack.pop();
    }
}

// Update activity
void updateActivity(string activityId, Activity newAct, Activity oldAct) {
    Node* current = head;
    while (current != nullptr) {
        if (current->data.id == activityId) {
            updateUndoStack.push({current->data, newAct});
            current->data = newAct;
            current->data.timestamp = getCurrentTime();
            
            cout << "📝 UPDATED: " << oldAct.title << " → " << newAct.title << endl;
            addNotification("Activity updated: " + oldAct.title + " → " + newAct.title, "UPDATE", activityId);
            
            while(!redoStack.empty()) {
                redoStack.pop();
            }
            
            return;
        }
        current = current->next;
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
    
    Node* current = head;
    while (current != nullptr) {
        if (current->data.id == oldAct.id) {
            current->data = oldAct;
            cout << "↩️  UPDATE UNDONE: " << newAct.title << " → " << oldAct.title << endl;
            addNotification("Update undone: " + newAct.title + " → " + oldAct.title, "UNDO_UPDATE", oldAct.id);
            return;
        }
        current = current->next;
    }
}

// Delete activity by ID
void deleteActivity(string activityId) {
    Node* current = head;
    Node* prev = nullptr;
    
    while (current != nullptr) {
        if (current->data.id == activityId) {
            undoStack.push(current->data);
            
            while(!redoStack.empty()) {
                redoStack.pop();
            }
            
            if (prev == nullptr) {
                head = current->next;
            } else {
                prev->next = current->next;
            }
            
            cout << "🗑️  DELETED (to undo stack): " << activityId << " - " << current->data.title << endl;
            addNotification("Activity deleted: " + current->data.title, "DELETE", activityId);
            
            delete current;
            activityCount--;
            return;
        }
        prev = current;
        current = current->next;
    }
    cout << "❌ DELETE FAILED: Activity not found - " << activityId << endl;
}

// 🔥🔥🔥 PERMANENT DELETE FUNCTION
void permanentDeleteActivity(string activityId) {
    Node* current = head;
    Node* prev = nullptr;
    
    while (current != nullptr) {
        if (current->data.id == activityId) {
            // Store in permanent delete stack for logging
            permanentDeleteStack.push(current->data);
            
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
            
            // Permanently remove from linked list
            if (prev == nullptr) {
                head = current->next;
            } else {
                prev->next = current->next;
            }
            
            cout << "🔥 PERMANENT DELETE: " << activityId << " - " << current->data.title << " (CANNOT BE UNDONE)" << endl;
            addNotification("PERMANENT DELETE: " + current->data.title, "PERMANENT_DELETE", activityId);
            
            delete current;
            activityCount--;
            return;
        }
        prev = current;
        current = current->next;
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
    
    // Add back to linked list
    Node* newNode = new Node(lastDeleted);
    newNode->next = head;
    head = newNode;
    activityCount++;
    
    cout << "↩️  UNDO DELETE: " << lastDeleted.title << " restored" << endl;
    addNotification("Undo delete: " + lastDeleted.title + " restored", "UNDO_DELETE", lastDeleted.id);
}

// Redo delete
void redoDelete() {
    if (redoStack.empty()) {
        cout << "❌ NOTHING TO REDO" << endl;
        return;
    }
    
    Activity lastUndone = redoStack.top();
    redoStack.pop();
    
    Node* current = head;
    Node* prev = nullptr;
    
    while (current != nullptr) {
        if (current->data.id == lastUndone.id) {
            undoStack.push(current->data);
            
            if (prev == nullptr) {
                head = current->next;
            } else {
                prev->next = current->next;
            }
            
            cout << "↪️  REDO DELETE: " << lastUndone.title << " deleted again" << endl;
            addNotification("Redo delete: " + lastUndone.title + " deleted again", "REDO_DELETE", lastUndone.id);
            
            delete current;
            activityCount--;
            return;
        }
        prev = current;
        current = current->next;
    }
    
    cout << "⚠️  Activity not found for redo: " << lastUndone.title << endl;
}

// Display all activities
void displayActivities() {
    cout << "\n📋 TOTAL ACTIVITIES: " << activityCount << endl;
    cout << "════════════════════════════════════════\n";
    
    Node* current = head;
    while (current != nullptr) {
        cout << "ID: " << current->data.id << " | " << current->data.title 
             << " [" << current->data.category << ", " << current->data.priority 
             << ", Score: " << current->data.score << "]" << endl;
        current = current->next;
    }
    
    cout << "\n📊 STACK STATS:" << endl;
    cout << "↩️  UNDO DELETE STACK: " << undoStack.size() << " items" << endl;
    cout << "↪️  REDO DELETE STACK: " << redoStack.size() << " items" << endl;
    cout << "📝 UPDATE UNDO STACK: " << updateUndoStack.size() << " items" << endl;
    cout << "🔥 PERMANENT DELETED: " << permanentDeleteStack.size() << " items" << endl;
    
    cout << "\n📋 QUEUE STATS:" << endl;
    cout << "📨 NOTIFICATION QUEUE: " << notificationQueue.size() << " pending notifications" << endl;
    
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

// Display queue
void displayQueue() {
    cout << "\n📨 NOTIFICATION QUEUE (" << notificationQueue.size() << " pending):" << endl;
    cout << "════════════════════════════════════════\n";
    
    if (notificationQueue.empty()) {
        cout << "Queue is empty!" << endl;
        return;
    }
    
    // Create a temporary queue to display without losing data
    queue<Notification> tempQueue = notificationQueue;
    int count = 1;
    
    while (!tempQueue.empty()) {
        Notification notif = tempQueue.front();
        cout << count++ << ". [" << notif.timestamp << "] ";
        cout << "[" << notif.type << "] ";
        cout << notif.message << endl;
        tempQueue.pop();
    }
    cout << "════════════════════════════════════════\n";
}

// Cleanup function to free memory
void cleanupLinkedList() {
    while (head != nullptr) {
        Node* temp = head;
        head = head->next;
        delete temp;
    }
}

int main(int argc, char* argv[]) {
    
    cout << "\n═══════════════════════════════════════════════════\n";
    cout << "           TASKPULSE - ACTIVITY MANAGER           \n";
    cout << "═══════════════════════════════════════════════════\n";
    cout << "Time: " << getCurrentTime() << endl;
    cout << "Data Structures: Linked List + Stacks + Queue\n";
    cout << "═══════════════════════════════════════════════════\n";
    
    if (argc < 2) {
        cout << "\nCommands:\n";
        cout << "  add \"ID\" \"Title\" \"Category\" \"Priority\" \"Score\" \"Description\" \"Status\" \"UserID\"\n";
        cout << "  update \"ID\" \"NewTitle\" \"NewCategory\" \"NewPriority\" \"NewScore\" \"NewDesc\" \"NewStatus\" \"UserID\" \"OldTitle\" \"OldCategory\" \"OldPriority\" \"OldScore\" \"OldDesc\" \"OldStatus\"\n";
        cout << "  delete \"ActivityID\"\n";
        cout << "  permanent-delete \"ActivityID\"\n";
        cout << "  undo\n";
        cout << "  redo\n";
        cout << "  display\n";
        cout << "  queue           # Show pending notifications\n";
        cout << "  process-queue   # Process all notifications (FIFO)\n";
        
        // Cleanup before exit
        cleanupLinkedList();
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
        
    } else if (command == "queue") {
        displayQueue();
        
    } else if (command == "process-queue") {
        processNotifications();
        
    } else {
        cout << "❌ INVALID COMMAND" << endl;
    }
    
    cout << "\n📊 STATS - Activities: " << activityCount 
         << " | Undo Stack: " << undoStack.size() 
         << " | Redo Stack: " << redoStack.size() 
         << " | Queue: " << notificationQueue.size() 
         << " | Permanent Deleted: " << permanentDeleteStack.size() << endl;
    cout << "═══════════════════════════════════════════════════\n\n";
    
    // Cleanup before exit
    cleanupLinkedList();
    
    return 0;
}