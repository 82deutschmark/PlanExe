#!/usr/bin/env python3
"""
Version management utility for PlanExe.
Updates version in pyproject.toml and helps with changelog entries.

Usage:
    python scripts/maintenance/update_version.py 0.9.7
"""

import sys
import re
from pathlib import Path

def update_pyproject_version(new_version):
    """Update version in pyproject.toml"""
    pyproject_path = Path("pyproject.toml")
    if not pyproject_path.exists():
        print("Error: pyproject.toml not found")
        return False
    
    content = pyproject_path.read_text()
    updated_content = re.sub(
        r'version = ".*?"',
        f'version = "{new_version}"',
        content
    )
    
    pyproject_path.write_text(updated_content)
    print(f"✅ Updated pyproject.toml to version {new_version}")
    return True

def validate_semver(version):
    """Validate semantic version format"""
    pattern = r'^\d+\.\d+\.\d+(-[a-zA-Z0-9]+)?$'
    return re.match(pattern, version) is not None

def main():
    if len(sys.argv) != 2:
        print("Usage: python update_version.py <version>")
        print("Example: python update_version.py 0.9.7")
        sys.exit(1)
    
    new_version = sys.argv[1]
    
    if not validate_semver(new_version):
        print(f"Error: '{new_version}' is not a valid semantic version")
        print("Format: MAJOR.MINOR.PATCH or MAJOR.MINOR.PATCH-prerelease")
        sys.exit(1)
    
    print(f"Updating PlanExe to version {new_version}")
    
    if update_pyproject_version(new_version):
        print("\n📝 Next steps:")
        print("1. Update CHANGELOG.md with new version entry")
        print("2. Commit changes: git add pyproject.toml CHANGELOG.md")
        print("3. Create release: git tag -a v{new_version} -m 'Release {new_version}'")
        print("4. Push: git push origin v{new_version}")
    else:
        sys.exit(1)

if __name__ == "__main__":
    main()
