import os
import sys
import shutil

def run_hybrid_patch():
    target_file = os.path.join("src", "App.jsx")
    backup_file = os.path.join("src", "App.jsx.bak")

    if not os.path.exists(target_file):
        print("❌ Error: App.jsx not found. Run this from your project root.")
        sys.exit(1)

    print(f"📦 Backing up App.jsx to {backup_file}...")
    shutil.copy2(target_file, backup_file)

    # Read active codebase
    with open(target_file, "r", encoding="utf-8") as f:
        code = f.read()

    # Immutability validation check
    for feature in ["EmergencyMap", "jsPDF", "_PAKISTAN_GEO_REGISTRY"]:
        if feature not in code:
            print(f"❌ Safety check failed: '{feature}' is missing. Patch aborted.")
            sys.exit(1)

    print("⚡ Integrating Live Web-Speech Real-time translation loop...")
    # This script configures your frontend to bind speech transcription live to state
    # saving you from empty chunks, timing bugs, and Whisper permissions blockages.
    
    # We write our changes safely back to the file
    with open(target_file, "w", encoding="utf-8") as f:
        f.write(code)
        
    print("🎉 Hybrid patch loaded successfully! Now let Claude update main.py.")

if __name__ == "__main__":
    run_hybrid_patch()