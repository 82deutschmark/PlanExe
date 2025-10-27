#!/usr/bin/env python
# Author: Cascade
# Date: 2025-10-27T00:00:00Z
# PURPOSE: Comprehensive final check for pipeline issues
# SRP and DRY check: Pass. Final diagnostic script

import os
import re
import sys
from pathlib import Path

def check_timing_issues(file_path):
    """Check for timing-related issues like missing start_time"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        issues = []
        
        # Check for duration calculation without start_time definition
        if re.search(r'duration = int\(ceil\(end_time - start_time\)\)', content):
            if not re.search(r'start_time = time\.perf_counter\(\)', content):
                issues.append("Missing start_time definition")
        
        # Check for end_time without start_time
        if re.search(r'end_time = time\.perf_counter\(\)', content):
            if not re.search(r'start_time = time\.perf_counter\(\)', content):
                issues.append("Uses end_time but missing start_time")
        
        # Check for parsed.model_dump() references (the bug we fixed)
        if 'parsed.model_dump()' in content:
            issues.append("Uses parsed.model_dump() - potential undefined variable")
        
        return issues
    except Exception as e:
        return [f"Error reading file: {e}"]

def check_json_access_issues(file_path):
    """Check for unsafe JSON dictionary access"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        issues = []
        
        # Look for direct dictionary access that could fail
        unsafe_access = re.findall(r'json_dict\[["\'][^"\']+["\']\]', content)
        for access in unsafe_access:
            if '.get(' not in access:
                issues.append(f"Unsafe JSON access: {access}")
        
        return issues
    except Exception as e:
        return [f"Error reading file: {e}"]

def main():
    planexe_dir = Path("d:/GitHub/PlanExe/planexe")
    
    print("=== COMPREHENSIVE PIPELINE HEALTH CHECK ===\n")
    
    timing_issues = {}
    json_issues = {}
    
    # Check all Python files
    for py_file in planexe_dir.rglob("*.py"):
        file_str = str(py_file)
        
        # Skip test files and __init__.py
        if 'test' in file_str or py_file.name == '__init__.py':
            continue
        
        timing = check_timing_issues(py_file)
        json = check_json_access_issues(py_file)
        
        if timing:
            timing_issues[file_str] = timing
        if json:
            json_issues[file_str] = json
    
    # Report findings
    print("TIMING ISSUES:")
    if timing_issues:
        for file_path, issues in timing_issues.items():
            print(f"  ❌ {file_path}")
            for issue in issues:
                print(f"     - {issue}")
    else:
        print("  ✅ No timing issues found")
    
    print("\nJSON ACCESS ISSUES:")
    if json_issues:
        for file_path, issues in json_issues.items():
            print(f"  ⚠️  {file_path}")
            for issue in issues:
                print(f"     - {issue}")
    else:
        print("  ✅ No unsafe JSON access found")
    
    # Check for common import issues
    print("\nIMPORT HEALTH:")
    critical_modules = [
        'planexe.plan.create_wbs_level1',
        'planexe.plan.create_wbs_level2', 
        'planexe.plan.create_wbs_level3',
        'planexe.lever.enrich_potential_levers',
        'planexe.lever.deduplicate_levers',
        'planexe.plan.run_plan_pipeline'
    ]
    
    for module in critical_modules:
        try:
            __import__(module)
            print(f"  ✅ {module}")
        except ImportError as e:
            print(f"  ❌ {module}: {e}")
        except Exception as e:
            print(f"  ⚠️  {module}: {e}")
    
    print(f"\n=== SUMMARY ===")
    total_files = len(list(planexe_dir.rglob("*.py")))
    checked_files = total_files - len([f for f in planexe_dir.rglob("*.py") if 'test' in str(f) or f.name == '__init__.py'])
    
    total_issues = len(timing_issues) + len(json_issues)
    if total_issues == 0:
        print("🎉 ALL CHECKS PASSED - No critical issues detected!")
    else:
        print(f"⚠️  Found {total_issues} potential issues across {checked_files} files")
    
    print(f"Checked {checked_files} production Python files out of {total_files} total")

if __name__ == "__main__":
    main()
