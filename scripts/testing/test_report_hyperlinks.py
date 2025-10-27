#!/usr/bin/env python3

"""
Test script to verify the HTML report hyperlink fix.
This creates a sample report with multiple sections to test the table of contents and anchor links.
"""

import sys
from pathlib import Path

# Add the project root to the path so we can import planexe modules
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from planexe.report.report_generator import ReportGenerator

def create_test_report():
    """Create a test report with multiple sections to verify hyperlink functionality."""
    
    # Create a temporary directory for test output
    test_dir = project_root / "test_output"
    test_dir.mkdir(exist_ok=True)
    
    # Initialize the report generator
    generator = ReportGenerator()
    
    # Add some test sections with different content types
    generator.append_markdown_with_tables(
        "Project Overview", 
        test_dir / "test_overview.md",
        css_classes=["overview-section"]
    )
    
    generator.append_markdown(
        "Strategic Analysis", 
        test_dir / "test_strategy.md",
        css_classes=["strategy-section"]
    )
    
    generator.append_json(
        "Technical Specifications", 
        test_dir / "test_tech.json",
        css_classes=["tech-section"]
    )
    
    generator.append_csv(
        "Financial Projections", 
        test_dir / "test_financial.csv",
        css_classes=["financial-section"]
    )
    
    # Create test content files
    (test_dir / "test_overview.md").write_text("""
# Project Overview

This is a comprehensive test project to verify that HTML report hyperlinks work correctly.

## Key Features

- **Table of Contents**: Automatically generated with clickable links
- **Anchor Navigation**: Each section has a unique ID for direct linking
- **Smooth Scrolling**: Links smoothly scroll to target sections
- **Expandable Sections**: Clicking TOC links expands collapsible sections

## Test Matrix

| Feature | Status | Notes |
|---------|--------|-------|
| TOC Generation | ✅ Working | Creates clickable links |
| Anchor IDs | ✅ Working | Unique IDs for each section |
| Smooth Scroll | ✅ Working | JavaScript enhanced |
| Section Expand | ✅ Working | Auto-expands on TOC click |
    """.strip())
    
    (test_dir / "test_strategy.md").write_text("""
# Strategic Analysis

## Market Position

Our analysis indicates strong market potential in the target segment.

### Competitive Advantages

1. First-mover advantage in the space
2. Superior technology stack
3. Experienced team with domain expertise

## Risk Assessment

**High Priority Risks:**
- Market timing uncertainty
- Resource allocation challenges
- Regulatory compliance requirements

**Mitigation Strategies:**
- Agile development methodology
- Incremental market validation
- Continuous compliance monitoring
    """.strip())
    
    (test_dir / "test_tech.json").write_text("""
{
  "architecture": {
    "frontend": "React + TypeScript",
    "backend": "FastAPI + Python",
    "database": "PostgreSQL",
    "deployment": "Docker + Railway"
  },
  "features": {
    "core": [
      "User authentication",
      "Real-time collaboration",
      "Data visualization"
    ],
    "advanced": [
      "Machine learning integration",
      "Advanced analytics",
      "API gateway"
    ]
  },
  "performance": {
    "target_response_time": "<200ms",
    "uptime_goal": "99.9%",
    "concurrent_users": 10000
  }
}
    """.strip())
    
    (test_dir / "test_financial.csv").write_text("""
Category,Q1_2024,Q2_2024,Q3_2024,Q4_2024,Total
Revenue,100000,150000,200000,250000,700000
Expenses,80000,90000,100000,110000,380000
Profit,20000,60000,100000,140000,320000
Margin,20%,40%,50%,56%,45.7%
    """.strip())
    
    # Generate the report
    output_path = test_dir / "test_report_with_navigation.html"
    generator.save_report(
        output_path, 
        title="Test Report - Hyperlink Navigation Verification",
        execute_plan_section_hidden=False
    )
    
    print(f"✅ Test report generated successfully!")
    print(f"📄 Output file: {output_path}")
    print(f"🌐 Open in browser: file://{output_path.absolute()}")
    print()
    print("🔍 Test Instructions:")
    print("1. Open the report in a web browser")
    print("2. Verify the Table of Contents appears with clickable links")
    print("3. Click each TOC link - it should scroll to the section and expand it")
    print("4. Test that all sections have proper anchor IDs")
    print("5. Verify smooth scrolling behavior")
    
    return output_path

if __name__ == "__main__":
    try:
        create_test_report()
    except Exception as e:
        print(f"❌ Error creating test report: {e}")
        sys.exit(1)
