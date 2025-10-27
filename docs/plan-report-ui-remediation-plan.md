# Plan Report Page Fix

**Author:** Cascade  
**Date:** 2025-10-27  
**Status:** Quick fix for prototype report viewer

## Problem

The plan report page (`/plan`) currently just dumps raw HTML from the backend. This breaks when the HTML generation fails and doesn't integrate with our existing UI components. The page needs to use the structured data that's already in the database from the Luigi pipeline.

## Current Issues

- Uses `dangerouslySetInnerHTML` to render backend HTML blob
- No fallback when HTML generation fails 
- Doesn't use shadcn/ui components
- Not showing real data that got returned!!!
- Manual fallback component that duplicates logic

## How PlanExe Actually Works

The Luigi pipeline already stores everything in the `plan_content` table:
- Each of the 61 tasks writes its output to the database during execution
- The report task just assembles this into HTML
- We have all the structured data we need - just need to render it

## Simple Fix

Instead of over-engineering, let's just:

1. **Use existing data**: Add a JSON endpoint that returns the plan content already in the database
2. **Render with components**: Replace HTML dump with proper React components using our existing UI library
3. **Automatic fallback**: If JSON endpoint fails, use the existing fallback logic without user intervention

## Implementation

### Backend (1 hour)

Add JSON response to existing report endpoint in `planexe_api/api.py`:

```python
# Add to /api/plans/{id}/report endpoint
if request.headers.get("accept") == "application/json":
    # Return plan_content data as JSON
    sections = db.get_plan_content(plan_id)
    return {
        "plan_id": plan_id,
        "sections": sections,
        "source": "database"
    }
```

### Frontend (2-3 hours)

1. Update `fastapi-client.ts` to request JSON
2. Replace `ReportPageClient.tsx` HTML dump with simple component rendering:
   ```tsx
   // Instead of dangerouslySetInnerHTML
   {sections.map(section => (
     <Card key={section.id}>
       <CardHeader>{section.title}</CardHeader>
       <CardContent>
         <ReactMarkdown>{section.content}</ReactMarkdown>
       </CardContent>
     </Card>
   ))}
   ```
3. Keep existing fallback as automatic backup

### That's it.

No complex state machines, no extensive redesign, no enterprise phases. Just a simple fix that uses the data we already have.

## Testing

- Verify JSON endpoint returns plan content
- Test fallback when JSON fails
- Check responsive layout works
- Done.

## Notes

- This is a prototype - keep it simple
- Use existing components and patterns
- Don't add unnecessary complexity
- The database-first architecture already gives us what we need
